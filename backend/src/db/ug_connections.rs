use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct UgConnection {
    pub board_id: Uuid,
    pub ug_base_url: String,
    #[serde(skip_serializing)]
    pub api_key: String,
    pub messe_id: String,
    pub last_synced: Option<DateTime<Utc>>,
    pub sync_enabled: bool,
    pub created_at: DateTime<Utc>,
}

pub async fn create_connection(
    pool: &PgPool,
    board_id: Uuid,
    ug_base_url: &str,
    api_key: &str,
    messe_id: &str,
) -> Result<UgConnection> {
    let conn = sqlx::query_as::<_, UgConnection>(
        r#"INSERT INTO ug_connections (board_id, ug_base_url, api_key, messe_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (board_id) DO UPDATE
             SET ug_base_url = $2, api_key = $3, messe_id = $4, sync_enabled = true
           RETURNING *"#,
    )
    .bind(board_id)
    .bind(ug_base_url)
    .bind(api_key)
    .bind(messe_id)
    .fetch_one(pool)
    .await?;
    Ok(conn)
}

pub async fn get_connection(pool: &PgPool, board_id: Uuid) -> Result<Option<UgConnection>> {
    let conn = sqlx::query_as::<_, UgConnection>(
        "SELECT * FROM ug_connections WHERE board_id = $1",
    )
    .bind(board_id)
    .fetch_optional(pool)
    .await?;
    Ok(conn)
}

pub async fn delete_connection(pool: &PgPool, board_id: Uuid) -> Result<bool> {
    let result = sqlx::query("DELETE FROM ug_connections WHERE board_id = $1")
        .bind(board_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn update_last_synced(pool: &PgPool, board_id: Uuid) -> Result<()> {
    sqlx::query("UPDATE ug_connections SET last_synced = NOW() WHERE board_id = $1")
        .bind(board_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_all_active(pool: &PgPool) -> Result<Vec<UgConnection>> {
    let conns = sqlx::query_as::<_, UgConnection>(
        "SELECT * FROM ug_connections WHERE sync_enabled = true",
    )
    .fetch_all(pool)
    .await?;
    Ok(conns)
}
