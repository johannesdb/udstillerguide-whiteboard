use std::time::Duration;

use sqlx::PgPool;

use super::client::UgClient;
use crate::db;

/// Spawn a background task that polls UG Core every 30 seconds
/// for all boards with active UG connections.
pub fn spawn_sync_loop(pool: PgPool) {
    tokio::spawn(async move {
        let interval = Duration::from_secs(30);
        loop {
            tokio::time::sleep(interval).await;
            if let Err(e) = sync_all_boards(&pool).await {
                tracing::error!("Background UG sync error: {}", e);
            }
        }
    });
}

async fn sync_all_boards(pool: &PgPool) -> anyhow::Result<()> {
    let connections = db::ug_connections::get_all_active(pool).await?;

    if connections.is_empty() {
        return Ok(());
    }

    tracing::debug!(
        "Background sync: checking {} UG connections",
        connections.len()
    );

    for conn in connections {
        if let Err(e) = sync_single_board(pool, &conn).await {
            tracing::warn!(
                board_id = %conn.board_id,
                "Background sync failed for board: {}",
                e
            );
        }
    }
    Ok(())
}

async fn sync_single_board(
    pool: &PgPool,
    conn: &db::ug_connections::UgConnection,
) -> anyhow::Result<()> {
    let client = UgClient::new(&conn.ug_base_url, &conn.api_key);

    if let Some(last) = conn.last_synced {
        let since = last.to_rfc3339();
        let changes = client.get_changes(&conn.messe_id, &since).await?;

        if !changes.changes.is_empty() {
            tracing::info!(
                board_id = %conn.board_id,
                "{} changes from UG Core",
                changes.changes.len()
            );
            // TODO: Apply changes to board elements via Yjs doc
        }
    } else {
        // No last_synced — skip (requires manual trigger first)
        return Ok(());
    }

    // NOTE: Do not advance last_synced until changes are actually applied to the board.
    // The TODO above for applying changes via Yjs doc must be implemented first.
    // Once applied, uncomment: db::ug_connections::update_last_synced(pool, conn.board_id).await?;
    Ok(())
}
