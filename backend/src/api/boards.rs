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

#[derive(Debug, Deserialize)]
pub struct CreateBoardRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBoardRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct AddCollaboratorRequest {
    pub username: String,
    pub role: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateShareLinkRequest {
    pub role: Option<String>,
    pub expires_in_hours: Option<i64>,
}

fn get_claims(request: &axum::http::Extensions) -> Option<auth::Claims> {
    auth::middleware::extract_claims(request)
}

pub async fn create_board(
    State(state): State<Arc<AppState>>,
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

    let body: CreateBoardRequest = match axum::body::to_bytes(request.into_body(), 1024 * 16).await
    {
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

    match db::boards::create_board(&state.pool, &body.name, claims.sub).await {
        Ok(board) => {
            let summary: db::boards::BoardSummary = board.into();
            (
                StatusCode::CREATED,
                Json(serde_json::to_value(summary).unwrap()),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Create board error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to create board"})),
            )
                .into_response()
        }
    }
}

pub async fn list_boards(
    State(state): State<Arc<AppState>>,
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

    match db::boards::list_boards_for_user(&state.pool, claims.sub).await {
        Ok(boards) => {
            let summaries: Vec<db::boards::BoardSummary> =
                boards.into_iter().map(|b| b.into()).collect();
            Json(serde_json::to_value(summaries).unwrap()).into_response()
        }
        Err(e) => {
            tracing::error!("List boards error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to list boards"})),
            )
                .into_response()
        }
    }
}

pub async fn get_board(
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

    // Check access
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

    match db::boards::get_board(&state.pool, board_id).await {
        Ok(Some(board)) => {
            let summary: db::boards::BoardSummary = board.into();
            Json(serde_json::to_value(summary).unwrap()).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Board not found"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Get board error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to get board"})),
            )
                .into_response()
        }
    }
}

pub async fn update_board(
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

    // Check owner
    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(role)) if role == "owner" || role == "admin" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "Only owner/admin can update board"})),
            )
                .into_response()
        }
    }

    let body: UpdateBoardRequest =
        match axum::body::to_bytes(request.into_body(), 1024 * 16).await {
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

    match db::boards::update_board_name(&state.pool, board_id, &body.name).await {
        Ok(Some(board)) => {
            let summary: db::boards::BoardSummary = board.into();
            Json(serde_json::to_value(summary).unwrap()).into_response()
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Board not found"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Update board error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to update board"})),
            )
                .into_response()
        }
    }
}

pub async fn delete_board(
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

    // Only owner can delete
    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(role)) if role == "owner" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "Only owner can delete board"})),
            )
                .into_response()
        }
    }

    match db::boards::delete_board(&state.pool, board_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Board not found"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Delete board error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to delete board"})),
            )
                .into_response()
        }
    }
}

pub async fn add_collaborator(
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

    // Only owner/admin can add collaborators
    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(role)) if role == "owner" || role == "admin" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "Not authorized to manage collaborators"})),
            )
                .into_response()
        }
    }

    let body: AddCollaboratorRequest =
        match axum::body::to_bytes(request.into_body(), 1024 * 16).await {
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

    let user = match db::users::find_by_username(&state.pool, &body.username).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "User not found"})),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Find user error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to find user"})),
            )
                .into_response();
        }
    };

    let role = body.role.unwrap_or_else(|| "editor".to_string());
    match db::boards::add_collaborator(&state.pool, board_id, user.id, &role).await {
        Ok(collab) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(collab).unwrap()),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Add collaborator error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to add collaborator"})),
            )
                .into_response()
        }
    }
}

pub async fn remove_collaborator(
    State(state): State<Arc<AppState>>,
    Path((board_id, user_id)): Path<(Uuid, Uuid)>,
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

    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(role)) if role == "owner" || role == "admin" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "Not authorized"})),
            )
                .into_response()
        }
    }

    match db::boards::remove_collaborator(&state.pool, board_id, user_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Collaborator not found"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Remove collaborator error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to remove collaborator"})),
            )
                .into_response()
        }
    }
}

pub async fn create_share_link(
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

    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(role)) if role == "owner" || role == "admin" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "Not authorized to create share links"})),
            )
                .into_response()
        }
    }

    let body: CreateShareLinkRequest =
        match axum::body::to_bytes(request.into_body(), 1024 * 16).await {
            Ok(bytes) => match serde_json::from_slice(&bytes) {
                Ok(b) => b,
                Err(_) => CreateShareLinkRequest {
                    role: None,
                    expires_in_hours: None,
                },
            },
            Err(_) => CreateShareLinkRequest {
                role: None,
                expires_in_hours: None,
            },
        };

    let token: String = {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        (0..64)
            .map(|_| {
                let idx = rng.gen_range(0..36);
                if idx < 10 {
                    (b'0' + idx) as char
                } else {
                    (b'a' + idx - 10) as char
                }
            })
            .collect()
    };

    let role = body.role.unwrap_or_else(|| "viewer".to_string());
    let expires_at = body
        .expires_in_hours
        .map(|h| chrono::Utc::now() + chrono::Duration::hours(h));

    match db::boards::create_share_link(&state.pool, board_id, &token, &role, expires_at).await {
        Ok(link) => (
            StatusCode::CREATED,
            Json(serde_json::to_value(link).unwrap()),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Create share link error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to create share link"})),
            )
                .into_response()
        }
    }
}

pub async fn get_share_links(
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

    match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(role)) if role == "owner" || role == "admin" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "Not authorized"})),
            )
                .into_response()
        }
    }

    match db::boards::get_share_links_for_board(&state.pool, board_id).await {
        Ok(links) => Json(serde_json::to_value(links).unwrap()).into_response(),
        Err(e) => {
            tracing::error!("Get share links error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to get share links"})),
            )
                .into_response()
        }
    }
}

pub async fn delete_share_link(
    State(state): State<Arc<AppState>>,
    Path((_board_id, link_id)): Path<(Uuid, Uuid)>,
    request: axum::extract::Request,
) -> impl IntoResponse {
    let _claims = match get_claims(request.extensions()) {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Not authenticated"})),
            )
                .into_response()
        }
    };

    match db::boards::delete_share_link(&state.pool, link_id).await {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Share link not found"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Delete share link error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to delete share link"})),
            )
                .into_response()
        }
    }
}

/// Get board info via share token (no auth required)
pub async fn get_board_by_share_token(
    State(state): State<Arc<AppState>>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    match db::boards::get_share_link_by_token(&state.pool, &token).await {
        Ok(Some(link)) => match db::boards::get_board(&state.pool, link.board_id).await {
            Ok(Some(board)) => {
                let info = serde_json::json!({
                    "board_id": board.id,
                    "name": board.name,
                    "role": link.role,
                });
                Json(info).into_response()
            }
            _ => (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "Board not found"})),
            )
                .into_response(),
        },
        _ => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Invalid or expired share link"})),
        )
            .into_response(),
    }
}
