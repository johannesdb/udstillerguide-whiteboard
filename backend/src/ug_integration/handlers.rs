use std::sync::Arc;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth;
use crate::db;
use crate::ws::handler::AppState;

use super::client::UgClient;

fn get_claims(request: &axum::http::Extensions) -> Option<auth::Claims> {
    auth::middleware::extract_claims(request)
}

#[derive(Debug, Deserialize)]
struct ConnectRequest {
    ug_base_url: String,
    api_key: String,
    messe_id: String,
}

#[derive(Debug, Deserialize)]
struct PushChange {
    entity_type: String,
    entity_id: String,
    data: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct PushBody {
    changes: Vec<PushChange>,
}

/// POST /api/boards/:id/ug/connect
/// Owner/admin only. Validates credentials by calling UG Core, stores the connection,
/// runs initial full sync, and returns the full UG data.
pub async fn connect(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<Uuid>,
    request: axum::extract::Request,
) -> impl IntoResponse {
    let claims = match get_claims(request.extensions()) {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Not authenticated"})),
            )
                .into_response()
        }
    };

    // Owner/admin only
    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(role)) if role == "owner" || role == "admin" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "Only owner/admin can connect UG integration"})),
            )
                .into_response()
        }
    }

    // Parse body
    let body: ConnectRequest = match axum::body::to_bytes(request.into_body(), 1024 * 16).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": "Invalid request body"})),
                )
                    .into_response()
            }
        },
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "Failed to read body"})),
            )
                .into_response()
        }
    };

    // Validate by calling UG Core get_messe
    let client = UgClient::new(&body.ug_base_url, &body.api_key);
    if let Err(e) = client.get_messe(&body.messe_id).await {
        tracing::error!("UG connect validation failed: {}", e);
        return (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"error": format!("Failed to validate UG connection: {}", e)})),
        )
            .into_response();
    }

    // Store connection
    if let Err(e) =
        db::ug_connections::create_connection(&state.pool, board_id, &body.ug_base_url, &body.api_key, &body.messe_id)
            .await
    {
        tracing::error!("Failed to store UG connection: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": "Failed to store connection"})),
        )
            .into_response();
    }

    // Run initial full sync
    let full_data = match client.get_full(&body.messe_id).await {
        Ok(data) => data,
        Err(e) => {
            tracing::error!("UG initial sync failed: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": format!("Initial sync failed: {}", e)})),
            )
                .into_response();
        }
    };

    // Update last_synced
    if let Err(e) = db::ug_connections::update_last_synced(&state.pool, board_id).await {
        tracing::error!("Failed to update last_synced: {}", e);
        // Non-fatal: we still have the data, so continue
    }

    Json(serde_json::to_value(&full_data).unwrap_or_default()).into_response()
}

/// DELETE /api/boards/:id/ug/connect
/// Owner/admin only. Removes the UG connection for this board.
pub async fn disconnect(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<Uuid>,
    request: axum::extract::Request,
) -> impl IntoResponse {
    let claims = match get_claims(request.extensions()) {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Not authenticated"})),
            )
                .into_response()
        }
    };

    // Owner/admin only
    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(role)) if role == "owner" || role == "admin" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "Only owner/admin can disconnect UG integration"})),
            )
                .into_response()
        }
    }

    match db::ug_connections::delete_connection(&state.pool, board_id).await {
        Ok(true) => Json(serde_json::json!({"ok": true})).into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "No UG connection found for this board"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Failed to delete UG connection: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to delete connection"})),
            )
                .into_response()
        }
    }
}

/// GET /api/boards/:id/ug/status
/// Any board member. Returns connection status for this board.
pub async fn status(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<Uuid>,
    request: axum::extract::Request,
) -> impl IntoResponse {
    let claims = match get_claims(request.extensions()) {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Not authenticated"})),
            )
                .into_response()
        }
    };

    // Any board member
    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(_)) => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "No access to this board"})),
            )
                .into_response()
        }
    }

    match db::ug_connections::get_connection(&state.pool, board_id).await {
        Ok(Some(conn)) => Json(serde_json::json!({
            "connected": true,
            "messe_id": conn.messe_id,
            "last_synced": conn.last_synced,
            "sync_enabled": conn.sync_enabled,
        }))
        .into_response(),
        Ok(None) => Json(serde_json::json!({"connected": false})).into_response(),
        Err(e) => {
            tracing::error!("Failed to get UG connection status: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to get connection status"})),
            )
                .into_response()
        }
    }
}

/// POST /api/boards/:id/ug/sync
/// Any board member. Performs incremental or full sync from UG Core.
pub async fn sync(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<Uuid>,
    request: axum::extract::Request,
) -> impl IntoResponse {
    let claims = match get_claims(request.extensions()) {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Not authenticated"})),
            )
                .into_response()
        }
    };

    // Any board member
    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(_)) => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "No access to this board"})),
            )
                .into_response()
        }
    }

    // Get connection
    let conn = match db::ug_connections::get_connection(&state.pool, board_id).await {
        Ok(Some(conn)) => conn,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "No UG connection for this board"})),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Failed to get UG connection: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to get connection"})),
            )
                .into_response();
        }
    };

    let client = UgClient::new(&conn.ug_base_url, &conn.api_key);

    // If last_synced exists, try incremental; otherwise full
    let data = if let Some(last_synced) = conn.last_synced {
        let since = last_synced.to_rfc3339();
        match client.get_changes(&conn.messe_id, &since).await {
            Ok(changes) => serde_json::to_value(&changes).unwrap_or_default(),
            Err(e) => {
                tracing::warn!("Incremental sync failed, falling back to full: {}", e);
                match client.get_full(&conn.messe_id).await {
                    Ok(full) => serde_json::to_value(&full).unwrap_or_default(),
                    Err(e2) => {
                        tracing::error!("Full sync fallback also failed: {}", e2);
                        return (
                            StatusCode::BAD_GATEWAY,
                            Json(serde_json::json!({"error": format!("Sync failed: {}", e2)})),
                        )
                            .into_response();
                    }
                }
            }
        }
    } else {
        match client.get_full(&conn.messe_id).await {
            Ok(full) => serde_json::to_value(&full).unwrap_or_default(),
            Err(e) => {
                tracing::error!("Full sync failed: {}", e);
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({"error": format!("Sync failed: {}", e)})),
                )
                    .into_response();
            }
        }
    };

    // Update last_synced
    if let Err(e) = db::ug_connections::update_last_synced(&state.pool, board_id).await {
        tracing::error!("Failed to update last_synced: {}", e);
    }

    Json(data).into_response()
}

/// POST /api/boards/:id/ug/push
/// Owner/admin only. Pushes local changes back to UG Core.
pub async fn push(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<Uuid>,
    request: axum::extract::Request,
) -> impl IntoResponse {
    let claims = match get_claims(request.extensions()) {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Not authenticated"})),
            )
                .into_response()
        }
    };

    // Owner/admin only
    let role = match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(r)) => r,
        Ok(None) => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "No access to this board"})),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("DB error checking access: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response();
        }
    };

    if role != "owner" && role != "admin" {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "Only board owner or admin can push to UG Core"})),
        )
            .into_response();
    }

    // Get connection
    let conn = match db::ug_connections::get_connection(&state.pool, board_id).await {
        Ok(Some(conn)) => conn,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "No UG connection for this board"})),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Failed to get UG connection: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to get connection"})),
            )
                .into_response();
        }
    };

    // Parse body
    let body: PushBody = match axum::body::to_bytes(request.into_body(), 1024 * 64).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": "Invalid request body"})),
                )
                    .into_response()
            }
        },
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "Failed to read body"})),
            )
                .into_response()
        }
    };

    let client = UgClient::new(&conn.ug_base_url, &conn.api_key);
    let mut results = Vec::new();

    for change in &body.changes {
        let result = match change.entity_type.as_str() {
            "stand" => {
                client
                    .update_stand(&change.entity_id, &change.data)
                    .await
            }
            "taxonomi" => {
                client
                    .update_taxonomi(&change.entity_id, &change.data)
                    .await
            }
            other => {
                results.push(serde_json::json!({
                    "entity_type": other,
                    "entity_id": change.entity_id,
                    "status": "error",
                    "error": format!("Unknown entity type: {}", other),
                }));
                continue;
            }
        };

        match result {
            Ok(()) => {
                results.push(serde_json::json!({
                    "entity_type": change.entity_type,
                    "entity_id": change.entity_id,
                    "status": "ok",
                }));
            }
            Err(e) => {
                tracing::error!(
                    "Failed to push {} {}: {}",
                    change.entity_type,
                    change.entity_id,
                    e
                );
                results.push(serde_json::json!({
                    "entity_type": change.entity_type,
                    "entity_id": change.entity_id,
                    "status": "error",
                    "error": e.to_string(),
                }));
            }
        }
    }

    Json(serde_json::json!({"results": results})).into_response()
}
