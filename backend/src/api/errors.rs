use std::sync::Arc;

use axum::{extract::State, http::StatusCode, Json};

use crate::errors::{log_error, AppError, ErrorLogEntry};
use crate::ws::handler::AppState;

/// Frontend sender fejl hertil: POST /api/errors
pub async fn report_error(
    State(state): State<Arc<AppState>>,
    Json(entry): Json<ErrorLogEntry>,
) -> Result<Json<serde_json::Value>, AppError> {
    let id = log_error(&state.pool, &entry).await.map_err(|e| AppError {
        status: StatusCode::INTERNAL_SERVER_ERROR,
        error_type: "db".into(),
        message: format!("Failed to log error: {}", e),
        severity: "critical".into(),
    })?;

    tracing::warn!(
        error_type = %entry.error_type,
        severity = %entry.severity,
        source = %entry.source,
        "Error logged: {} (id: {})", entry.message, id
    );

    Ok(Json(serde_json::json!({ "id": id, "logged": true })))
}
