use std::sync::Arc;

use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};

use crate::auth;
use crate::db;
use crate::ws::handler::AppState;

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: db::users::UserPublic,
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterRequest>,
) -> impl IntoResponse {
    if req.username.len() < 3 || req.username.len() > 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Username must be 3-100 characters"})),
        )
            .into_response();
    }

    if !req.email.contains('@') {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Invalid email"})),
        )
            .into_response();
    }

    if req.password.len() < 6 {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "Password must be at least 6 characters"})),
        )
            .into_response();
    }

    let password_hash = match bcrypt::hash(&req.password, bcrypt::DEFAULT_COST) {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to hash password"})),
            )
                .into_response()
        }
    };

    match db::users::create_user(&state.pool, &req.username, &req.email, &password_hash).await {
        Ok(user) => {
            let token = auth::create_token(user.id, &user.username, &state.jwt_secret)
                .unwrap_or_default();
            let response = AuthResponse {
                token,
                user: user.into(),
            };
            (StatusCode::CREATED, Json(serde_json::to_value(response).unwrap())).into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("duplicate") {
                (
                    StatusCode::CONFLICT,
                    Json(serde_json::json!({"error": "Username or email already exists"})),
                )
                    .into_response()
            } else {
                tracing::error!("Registration error: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": "Registration failed"})),
                )
                    .into_response()
            }
        }
    }
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    let user = match db::users::find_by_username(&state.pool, &req.username).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Invalid credentials"})),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Login error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Login failed"})),
            )
                .into_response();
        }
    };

    let password_hash = match &user.password_hash {
        Some(h) => h,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "This account uses Google login. Please sign in with Google."})),
            )
                .into_response()
        }
    };

    match bcrypt::verify(&req.password, password_hash) {
        Ok(true) => {
            let token = auth::create_token(user.id, &user.username, &state.jwt_secret)
                .unwrap_or_default();
            let response = AuthResponse {
                token,
                user: user.into(),
            };
            Json(serde_json::to_value(response).unwrap()).into_response()
        }
        _ => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "Invalid credentials"})),
        )
            .into_response(),
    }
}

pub async fn auth_providers(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    Json(serde_json::json!({
        "google": state.oauth_client.is_some(),
        "password": true,
    }))
}

pub async fn me(
    State(state): State<Arc<AppState>>,
    request: axum::extract::Request,
) -> impl IntoResponse {
    let claims = match auth::middleware::extract_claims(request.extensions()) {
        Some(c) => c,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Not authenticated"})),
            )
                .into_response()
        }
    };

    match db::users::find_by_id(&state.pool, claims.sub).await {
        Ok(Some(user)) => {
            let public: db::users::UserPublic = user.into();
            Json(serde_json::to_value(public).unwrap()).into_response()
        }
        _ => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "User not found"})),
        )
            .into_response(),
    }
}
