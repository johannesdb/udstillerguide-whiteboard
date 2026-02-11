use std::sync::Arc;

use axum::{
    extract::{Query, State},
    response::{IntoResponse, Redirect},
};
use chrono::Utc;
use oauth2::{
    AuthorizationCode, CsrfToken, PkceCodeChallenge, Scope, TokenResponse,
};
use oauth2::reqwest::async_http_client;
use serde::Deserialize;

use crate::auth;
use crate::db;
use crate::ws::handler::AppState;

#[derive(Debug, Deserialize)]
struct GoogleUserInfo {
    id: String,
    email: String,
    name: Option<String>,
}

/// GET /api/auth/google — redirect to Google consent screen
pub async fn google_login(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let client = match &state.oauth_client {
        Some(c) => c,
        None => {
            return Redirect::to("/?error=google_not_configured").into_response();
        }
    };

    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    let (auth_url, csrf_state) = client
        .authorize_url(CsrfToken::new_random)
        .add_scope(Scope::new("openid".to_string()))
        .add_scope(Scope::new("email".to_string()))
        .add_scope(Scope::new("profile".to_string()))
        .set_pkce_challenge(pkce_challenge)
        .url();

    // Store PKCE verifier + timestamp keyed by CSRF state
    if let Ok(mut pending) = state.oauth_pending.lock() {
        // Clean up expired entries (older than 10 minutes)
        let cutoff = Utc::now() - chrono::Duration::minutes(10);
        pending.retain(|_, (_, ts)| *ts > cutoff);

        pending.insert(
            csrf_state.secret().clone(),
            (pkce_verifier, Utc::now()),
        );
    }

    Redirect::to(auth_url.as_str()).into_response()
}

#[derive(Debug, Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

/// GET /api/auth/google/callback — exchange code for token, find/create user, redirect with JWT
pub async fn google_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<CallbackQuery>,
) -> impl IntoResponse {
    // Handle errors from Google
    if let Some(error) = &query.error {
        tracing::warn!("Google OAuth error: {}", error);
        return Redirect::to(&format!("/?error={}", urlencoding::encode(error))).into_response();
    }

    let code = match &query.code {
        Some(c) => c.clone(),
        None => return Redirect::to("/?error=missing_code").into_response(),
    };

    let csrf_state = match &query.state {
        Some(s) => s.clone(),
        None => return Redirect::to("/?error=missing_state").into_response(),
    };

    let client = match &state.oauth_client {
        Some(c) => c,
        None => return Redirect::to("/?error=google_not_configured").into_response(),
    };

    // Validate CSRF state and retrieve PKCE verifier
    let pkce_verifier = match state.oauth_pending.lock() {
        Ok(mut pending) => match pending.remove(&csrf_state) {
            Some((verifier, ts)) => {
                let cutoff = Utc::now() - chrono::Duration::minutes(10);
                if ts < cutoff {
                    return Redirect::to("/?error=state_expired").into_response();
                }
                verifier
            }
            None => return Redirect::to("/?error=invalid_state").into_response(),
        },
        Err(_) => return Redirect::to("/?error=server_error").into_response(),
    };

    // Exchange authorization code for tokens
    let token_result = match client
        .exchange_code(AuthorizationCode::new(code))
        .set_pkce_verifier(pkce_verifier)
        .request_async(async_http_client)
        .await
    {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("Google token exchange failed: {}", e);
            return Redirect::to("/?error=token_exchange_failed").into_response();
        }
    };

    let access_token = token_result.access_token().secret();

    // Fetch user info from Google
    let http_client = reqwest::Client::new();
    let user_info: GoogleUserInfo = match http_client
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .bearer_auth(access_token)
        .send()
        .await
    {
        Ok(res) => match res.json().await {
            Ok(info) => info,
            Err(e) => {
                tracing::error!("Failed to parse Google user info: {}", e);
                return Redirect::to("/?error=userinfo_parse_failed").into_response();
            }
        },
        Err(e) => {
            tracing::error!("Failed to fetch Google user info: {}", e);
            return Redirect::to("/?error=userinfo_fetch_failed").into_response();
        }
    };

    // Find or create user
    let user = match find_or_create_google_user(&state.pool, &user_info).await {
        Ok(u) => u,
        Err(e) => {
            tracing::error!("Failed to find/create Google user: {}", e);
            return Redirect::to("/?error=user_creation_failed").into_response();
        }
    };

    // Generate JWT
    let token = match auth::create_token(user.id, &user.username, &state.jwt_secret) {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("Failed to create JWT: {}", e);
            return Redirect::to("/?error=token_creation_failed").into_response();
        }
    };

    // Build user JSON for the fragment
    let user_json = serde_json::json!({
        "id": user.id,
        "username": user.username,
        "email": user.email,
    });
    let user_string = user_json.to_string();
    let user_encoded = urlencoding::encode(&user_string);

    // Redirect with token in URL fragment (never sent to server/logs)
    Redirect::to(&format!("/#token={}&user={}", token, user_encoded)).into_response()
}

async fn find_or_create_google_user(
    pool: &sqlx::PgPool,
    info: &GoogleUserInfo,
) -> anyhow::Result<db::users::User> {
    // 1. Find by google_id
    if let Some(user) = db::users::find_by_google_id(pool, &info.id).await? {
        return Ok(user);
    }

    // 2. Find by email — link Google to existing account
    if let Some(user) = db::users::find_by_email(pool, &info.email).await? {
        let linked = db::users::link_google_account(pool, user.id, &info.id).await?;
        tracing::info!("Linked Google account to existing user: {}", user.username);
        return Ok(linked);
    }

    // 3. Create new user with unique username derived from Google name
    let base_name = info
        .name
        .as_deref()
        .unwrap_or("user")
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_')
        .collect::<String>();
    let base_name = if base_name.len() < 3 {
        "user".to_string()
    } else {
        base_name
    };

    // Try the base name, then append numbers if taken
    let mut username = base_name.clone();
    for i in 0..100 {
        if i > 0 {
            username = format!("{}_{}", base_name, i);
        }
        match db::users::create_google_user(pool, &username, &info.email, &info.id).await {
            Ok(user) => {
                tracing::info!("Created new Google user: {}", user.username);
                return Ok(user);
            }
            Err(e) => {
                let msg = e.to_string();
                if msg.contains("duplicate") && msg.contains("username") {
                    continue; // Try next username
                }
                return Err(e);
            }
        }
    }

    anyhow::bail!("Could not generate unique username after 100 attempts")
}
