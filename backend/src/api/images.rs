use std::sync::Arc;

use axum::{
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Extension, Json,
};
use uuid::Uuid;

use crate::auth;
use crate::db;
use crate::ws::handler::AppState;

/// Upload an image to a board (auth required).
/// The auth middleware inserts Claims into request extensions;
/// using `Extension<auth::Claims>` extracts it before Multipart consumes the body.
pub async fn upload_image(
    State(state): State<Arc<AppState>>,
    Path(board_id): Path<Uuid>,
    Extension(claims): Extension<auth::Claims>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    // Check board access
    let has_access = db::boards::user_has_access(&state.pool, board_id, claims.sub).await;
    match has_access {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "No access to this board"})),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Access check error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to check board access"})),
            )
                .into_response()
        }
    }

    // Read the first file field from the multipart form
    let mut filename = String::from("upload.png");
    let mut content_type = String::from("image/png");
    let mut data: Option<Vec<u8>> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let field_name = field.name().unwrap_or("").to_string();
        if field_name == "file" || field_name == "image" {
            if let Some(name) = field.file_name() {
                filename = name.to_string();
            }
            if let Some(ct) = field.content_type() {
                content_type = ct.to_string();
            }
            match field.bytes().await {
                Ok(bytes) => {
                    data = Some(bytes.to_vec());
                    break;
                }
                Err(e) => {
                    tracing::error!("Failed to read multipart field: {}", e);
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({"error": "Failed to read file data"})),
                    )
                        .into_response();
                }
            }
        }
    }

    let data = match data {
        Some(d) if !d.is_empty() => d,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "No file provided"})),
            )
                .into_response()
        }
    };

    // Validate content type is an image
    if !content_type.starts_with("image/") {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "File must be an image"})),
        )
            .into_response();
    }

    match db::images::save_image(
        &state.pool,
        board_id,
        claims.sub,
        &filename,
        &content_type,
        &data,
        None,
        None,
    )
    .await
    {
        Ok(image) => {
            let url = format!("/api/boards/{}/images/{}", board_id, image.id);
            (
                StatusCode::CREATED,
                Json(serde_json::json!({
                    "id": image.id,
                    "url": url
                })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Save image error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to save image"})),
            )
                .into_response()
        }
    }
}

/// Get an image by ID (public, no auth required).
pub async fn get_image(
    State(state): State<Arc<AppState>>,
    Path((_board_id, image_id)): Path<(Uuid, Uuid)>,
) -> impl IntoResponse {
    match db::images::get_image(&state.pool, image_id).await {
        Ok(Some(image)) => {
            let headers = [
                (header::CONTENT_TYPE, image.content_type),
                (
                    header::CACHE_CONTROL,
                    "public, max-age=31536000, immutable".to_string(),
                ),
            ];
            (headers, image.data).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Image not found"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Get image error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to get image"})),
            )
                .into_response()
        }
    }
}
