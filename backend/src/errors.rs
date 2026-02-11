use axum::{http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorLogEntry {
    pub source: String,
    pub error_type: String,
    pub severity: String,
    pub message: String,
    pub stack_trace: Option<String>,
    pub context: Option<serde_json::Value>,
    pub url: Option<String>,
    pub user_agent: Option<String>,
    pub user_id: Option<uuid::Uuid>,
    pub board_id: Option<uuid::Uuid>,
}

#[derive(Debug)]
pub struct AppError {
    pub status: StatusCode,
    pub error_type: String,
    pub message: String,
    pub severity: String,
}

impl AppError {
    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error_type: "internal".into(),
            message: message.into(),
            severity: "error".into(),
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            error_type: "validation".into(),
            message: message.into(),
            severity: "warning".into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            error_type: "not_found".into(),
            message: message.into(),
            severity: "info".into(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        tracing::warn!(
            error_type = %self.error_type,
            severity = %self.severity,
            status = %self.status,
            "AppError: {}", self.message
        );
        let body = serde_json::json!({
            "error": self.message,
            "type": self.error_type,
        });
        (self.status, Json(body)).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!("Database error: {}", e);
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error_type: "db".into(),
            message: "Database error".into(),
            severity: "error".into(),
        }
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        tracing::error!("Internal error: {}", e);
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            error_type: "internal".into(),
            message: format!("{}", e),
            severity: "error".into(),
        }
    }
}

/// Log fejl til database
pub async fn log_error(pool: &PgPool, entry: &ErrorLogEntry) -> Result<i32, sqlx::Error> {
    let rec = sqlx::query_scalar::<_, i32>(
        r#"
        INSERT INTO error_log (source, error_type, severity, message, stack_trace, context, url, user_agent, user_id, board_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
        "#,
    )
    .bind(&entry.source)
    .bind(&entry.error_type)
    .bind(&entry.severity)
    .bind(&entry.message)
    .bind(&entry.stack_trace)
    .bind(&entry.context)
    .bind(&entry.url)
    .bind(&entry.user_agent)
    .bind(&entry.user_id)
    .bind(&entry.board_id)
    .fetch_one(pool)
    .await?;

    Ok(rec)
}
