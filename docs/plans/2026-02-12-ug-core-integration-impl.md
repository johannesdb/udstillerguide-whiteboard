# UG Core Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect the whiteboard to UG Core's REST API so halls, stands, exhibitors, and taxonomies flow in both directions — replacing mock data with live sync.

**Architecture:** The whiteboard backend (Rust/Axum) acts as proxy between browser and UG Core. A new `ug_integration` module handles connect/sync/push. A background tokio task polls for changes every 30s. The frontend replaces `ug-mock-data.js` imports with REST calls to our backend. A standalone mock server lets us develop and test without a live UG Core instance.

**Tech Stack:** Rust (Axum, sqlx, reqwest, tokio), JavaScript (ES modules), OpenAPI 3.0 YAML

**Design doc:** `docs/plans/2026-02-12-ug-core-integration-design.md`

---

## Task 1: Database Migration — `ug_connections` table

**Files:**
- Modify: `backend/src/db/mod.rs:17-107` (add migration SQL to `run_migrations`)

**Step 1: Add migration SQL**

Append to the raw SQL string in `run_migrations()`, after the Google OAuth block (line 99):

```sql
-- UG Core connection per board (1:1)
CREATE TABLE IF NOT EXISTS ug_connections (
    board_id     UUID PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
    ug_base_url  TEXT NOT NULL,
    api_key      TEXT NOT NULL,
    messe_id     TEXT NOT NULL,
    last_synced  TIMESTAMPTZ,
    sync_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Step 2: Verify migration runs**

Run: `cd backend && cargo build 2>&1 | tail -5`
Expected: compiles without error.

Start server locally and check logs for "Database migrations completed".

**Step 3: Commit**

```bash
git add backend/src/db/mod.rs
git commit -m "feat: add ug_connections migration table"
```

---

## Task 2: Database queries — `db/ug_connections.rs`

**Files:**
- Create: `backend/src/db/ug_connections.rs`
- Modify: `backend/src/db/mod.rs:1-3` (add `pub mod ug_connections;`)

**Step 1: Create the db module**

Create `backend/src/db/ug_connections.rs`:

```rust
use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct UgConnection {
    pub board_id: Uuid,
    pub ug_base_url: String,
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
```

**Step 2: Register the module**

In `backend/src/db/mod.rs`, add after line 3 (`pub mod users;`):

```rust
pub mod ug_connections;
```

**Step 3: Verify compilation**

Run: `cd backend && cargo build 2>&1 | tail -5`
Expected: compiles without error.

**Step 4: Commit**

```bash
git add backend/src/db/ug_connections.rs backend/src/db/mod.rs
git commit -m "feat: add ug_connections db queries"
```

---

## Task 3: UG Core HTTP client — `ug_integration/client.rs`

**Files:**
- Create: `backend/src/ug_integration/mod.rs`
- Create: `backend/src/ug_integration/client.rs`
- Create: `backend/src/ug_integration/types.rs`
- Modify: `backend/src/main.rs:1-6` (add `mod ug_integration;`)

**Step 1: Create types module**

Create `backend/src/ug_integration/types.rs` with the API data structures matching the design doc's JSON contract:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgMesse {
    pub id: String,
    pub navn: String,
    pub dato: String,
    pub lokation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgHal {
    pub id: String,
    pub navn: String,
    pub bredde: f64,
    pub hoejde: f64,
    pub farve: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgStandPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgStand {
    pub id: String,
    pub standnummer: String,
    pub hal_id: String,
    pub udstiller_id: Option<String>,
    pub bredde: f64,
    pub hoejde: f64,
    pub status: String,
    pub position: Option<UgStandPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgUdstiller {
    pub id: String,
    pub firmanavn: String,
    pub kontakt: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgTaxonomi {
    pub id: String,
    pub navn: String,
    pub parent: Option<String>,
    pub children: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgFullResponse {
    pub messe: UgMesse,
    pub haller: Vec<UgHal>,
    pub stande: Vec<UgStand>,
    pub udstillere: Vec<UgUdstiller>,
    pub taxonomier: Vec<UgTaxonomi>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgChange {
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub data: serde_json::Value,
    pub changed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UgChangesResponse {
    pub changes: Vec<UgChange>,
    pub version: String,
}
```

**Step 2: Create HTTP client**

Create `backend/src/ug_integration/client.rs`:

```rust
use anyhow::{Context, Result};
use reqwest::Client;

use super::types::{UgChangesResponse, UgFullResponse, UgMesse};

pub struct UgClient {
    http: Client,
    base_url: String,
    api_key: String,
}

impl UgClient {
    pub fn new(base_url: &str, api_key: &str) -> Self {
        Self {
            http: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
        }
    }

    /// Validate connection by fetching messe metadata
    pub async fn get_messe(&self, messe_id: &str) -> Result<UgMesse> {
        let url = format!("{}/api/v1/messer/{}", self.base_url, messe_id);
        let resp = self
            .http
            .get(&url)
            .header("X-API-Key", &self.api_key)
            .send()
            .await
            .context("Failed to reach UG Core")?;

        if !resp.status().is_success() {
            anyhow::bail!(
                "UG Core returned {} for GET {}",
                resp.status(),
                url
            );
        }

        resp.json().await.context("Invalid JSON from UG Core /messer")
    }

    /// Full sync — fetch all data for a messe
    pub async fn get_full(&self, messe_id: &str) -> Result<UgFullResponse> {
        let url = format!("{}/api/v1/messer/{}/full", self.base_url, messe_id);
        let resp = self
            .http
            .get(&url)
            .header("X-API-Key", &self.api_key)
            .send()
            .await
            .context("Failed to reach UG Core /full")?;

        if !resp.status().is_success() {
            anyhow::bail!("UG Core returned {} for GET {}", resp.status(), url);
        }

        resp.json().await.context("Invalid JSON from UG Core /full")
    }

    /// Incremental sync — changes since a timestamp
    pub async fn get_changes(&self, messe_id: &str, since: &str) -> Result<UgChangesResponse> {
        let url = format!(
            "{}/api/v1/messer/{}/changes?since={}",
            self.base_url, messe_id, since
        );
        let resp = self
            .http
            .get(&url)
            .header("X-API-Key", &self.api_key)
            .send()
            .await
            .context("Failed to reach UG Core /changes")?;

        if !resp.status().is_success() {
            anyhow::bail!("UG Core returned {} for GET {}", resp.status(), url);
        }

        resp.json()
            .await
            .context("Invalid JSON from UG Core /changes")
    }

    /// Push stand update back to UG Core
    pub async fn update_stand(
        &self,
        stand_id: &str,
        body: &serde_json::Value,
    ) -> Result<()> {
        let url = format!("{}/api/v1/stande/{}", self.base_url, stand_id);
        let resp = self
            .http
            .put(&url)
            .header("X-API-Key", &self.api_key)
            .json(body)
            .send()
            .await
            .context("Failed to push stand update to UG Core")?;

        if !resp.status().is_success() {
            anyhow::bail!("UG Core returned {} for PUT {}", resp.status(), url);
        }
        Ok(())
    }

    /// Push taxonomy create/update/delete to UG Core
    pub async fn update_taxonomi(
        &self,
        taxonomi_id: &str,
        body: &serde_json::Value,
    ) -> Result<()> {
        let url = format!("{}/api/v1/taxonomier/{}", self.base_url, taxonomi_id);
        let resp = self
            .http
            .put(&url)
            .header("X-API-Key", &self.api_key)
            .json(body)
            .send()
            .await
            .context("Failed to push taxonomy update to UG Core")?;

        if !resp.status().is_success() {
            anyhow::bail!("UG Core returned {} for PUT {}", resp.status(), url);
        }
        Ok(())
    }
}
```

**Step 3: Create mod.rs**

Create `backend/src/ug_integration/mod.rs`:

```rust
pub mod client;
pub mod handlers;
pub mod types;
```

(Note: `handlers` created in Task 4.)

**Step 4: Register module in main.rs**

Add `mod ug_integration;` after `mod ws;` (line 6) in `backend/src/main.rs`.

**Step 5: Verify compilation**

The build will fail because `handlers` doesn't exist yet. Temporarily comment out `pub mod handlers;` in mod.rs, build, then uncomment.

Run: `cd backend && cargo build 2>&1 | tail -5`

**Step 6: Commit**

```bash
git add backend/src/ug_integration/ backend/src/main.rs
git commit -m "feat: add UG Core HTTP client and types"
```

---

## Task 4: Backend API handlers — `ug_integration/handlers.rs`

**Files:**
- Create: `backend/src/ug_integration/handlers.rs`
- Modify: `backend/src/main.rs` (add routes)

**Step 1: Create handlers**

Create `backend/src/ug_integration/handlers.rs`:

```rust
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

#[derive(Debug, Deserialize)]
pub struct ConnectRequest {
    pub ug_base_url: String,
    pub api_key: String,
    pub messe_id: String,
}

fn get_claims(extensions: &axum::http::Extensions) -> Option<auth::Claims> {
    auth::middleware::extract_claims(extensions)
}

/// POST /api/boards/:id/ug/connect
/// Validates the UG Core connection, stores credentials, runs initial full sync.
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

    // Check user has access to this board
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

    // Only owner/admin can connect
    if role != "owner" && role != "admin" {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "Only board owner or admin can connect to UG Core"})),
        )
            .into_response();
    }

    // Parse body
    let body: ConnectRequest = match axum::body::to_bytes(request.into_body(), 1024 * 16).await {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(b) => b,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({"error": "Invalid request body. Expected: ug_base_url, api_key, messe_id"})),
                )
                    .into_response()
            }
        },
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": "Could not read request body"})),
            )
                .into_response()
        }
    };

    // Validate connection by fetching messe metadata from UG Core
    let client = UgClient::new(&body.ug_base_url, &body.api_key);
    let messe = match client.get_messe(&body.messe_id).await {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!("UG Core connection validation failed: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": format!("Could not connect to UG Core: {}", e)})),
            )
                .into_response();
        }
    };

    // Store connection in DB
    match db::ug_connections::create_connection(
        &state.pool,
        board_id,
        &body.ug_base_url,
        &body.api_key,
        &body.messe_id,
    )
    .await
    {
        Ok(_) => {}
        Err(e) => {
            tracing::error!("Failed to store UG connection: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Failed to save connection"})),
            )
                .into_response();
        }
    }

    // Run initial full sync
    let full_data = match client.get_full(&body.messe_id).await {
        Ok(data) => data,
        Err(e) => {
            tracing::error!("Initial full sync failed: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({"error": format!("Connected but initial sync failed: {}", e)})),
            )
                .into_response();
        }
    };

    // Update last_synced
    let _ = db::ug_connections::update_last_synced(&state.pool, board_id).await;

    tracing::info!(
        board_id = %board_id,
        messe = %messe.navn,
        "UG Core connected: {} halls, {} stands",
        full_data.haller.len(),
        full_data.stande.len()
    );

    (StatusCode::OK, Json(serde_json::to_value(&full_data).unwrap())).into_response()
}

/// DELETE /api/boards/:id/ug/connect
/// Removes the UG Core connection for a board.
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

    let role = match db::boards::user_has_access(&state.pool, board_id, claims.sub).await {
        Ok(Some(r)) => r,
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "No access"})),
            )
                .into_response()
        }
    };

    if role != "owner" && role != "admin" {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "Only owner/admin can disconnect"})),
        )
            .into_response();
    }

    match db::ug_connections::delete_connection(&state.pool, board_id).await {
        Ok(true) => {
            (StatusCode::OK, Json(serde_json::json!({"disconnected": true}))).into_response()
        }
        Ok(false) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "No UG connection for this board"})),
        )
            .into_response(),
        Err(e) => {
            tracing::error!("Disconnect error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// GET /api/boards/:id/ug/status
/// Returns connection info and sync status.
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

    if db::boards::user_has_access(&state.pool, board_id, claims.sub)
        .await
        .ok()
        .flatten()
        .is_none()
    {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "No access"})),
        )
            .into_response();
    }

    match db::ug_connections::get_connection(&state.pool, board_id).await {
        Ok(Some(conn)) => {
            let body = serde_json::json!({
                "connected": true,
                "messe_id": conn.messe_id,
                "ug_base_url": conn.ug_base_url,
                "last_synced": conn.last_synced,
                "sync_enabled": conn.sync_enabled,
            });
            (StatusCode::OK, Json(body)).into_response()
        }
        Ok(None) => {
            (StatusCode::OK, Json(serde_json::json!({"connected": false}))).into_response()
        }
        Err(e) => {
            tracing::error!("Status check error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response()
        }
    }
}

/// POST /api/boards/:id/ug/sync
/// Triggers a manual sync — fetches latest data from UG Core.
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

    if db::boards::user_has_access(&state.pool, board_id, claims.sub)
        .await
        .ok()
        .flatten()
        .is_none()
    {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "No access"})),
        )
            .into_response();
    }

    let conn = match db::ug_connections::get_connection(&state.pool, board_id).await {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "No UG connection for this board"})),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("DB error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response();
        }
    };

    let client = UgClient::new(&conn.ug_base_url, &conn.api_key);

    // Use incremental sync if we have a last_synced timestamp, otherwise full sync
    let data = if let Some(last) = conn.last_synced {
        let since = last.to_rfc3339();
        match client.get_changes(&conn.messe_id, &since).await {
            Ok(changes) => serde_json::to_value(&changes).unwrap(),
            Err(e) => {
                tracing::warn!("Incremental sync failed, falling back to full: {}", e);
                match client.get_full(&conn.messe_id).await {
                    Ok(full) => serde_json::to_value(&full).unwrap(),
                    Err(e2) => {
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
            Ok(full) => serde_json::to_value(&full).unwrap(),
            Err(e) => {
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({"error": format!("Sync failed: {}", e)})),
                )
                    .into_response();
            }
        }
    };

    let _ = db::ug_connections::update_last_synced(&state.pool, board_id).await;

    (StatusCode::OK, Json(data)).into_response()
}

/// POST /api/boards/:id/ug/push
/// Pushes local changes (stand positions, taxonomy edits) to UG Core.
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

    if db::boards::user_has_access(&state.pool, board_id, claims.sub)
        .await
        .ok()
        .flatten()
        .is_none()
    {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({"error": "No access"})),
        )
            .into_response();
    }

    let conn = match db::ug_connections::get_connection(&state.pool, board_id).await {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error": "No UG connection"})),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("DB error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "Internal error"})),
            )
                .into_response();
        }
    };

    // Parse changes from body
    #[derive(Deserialize)]
    struct PushBody {
        changes: Vec<PushChange>,
    }
    #[derive(Deserialize)]
    struct PushChange {
        entity_type: String,
        entity_id: String,
        data: serde_json::Value,
    }

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
                Json(serde_json::json!({"error": "Could not read body"})),
            )
                .into_response()
        }
    };

    let client = UgClient::new(&conn.ug_base_url, &conn.api_key);
    let mut results = Vec::new();

    for change in &body.changes {
        let result = match change.entity_type.as_str() {
            "stand" => client.update_stand(&change.entity_id, &change.data).await,
            "taxonomi" => client.update_taxonomi(&change.entity_id, &change.data).await,
            other => {
                tracing::warn!("Unknown entity type for push: {}", other);
                continue;
            }
        };

        match result {
            Ok(()) => results.push(serde_json::json!({
                "entity_id": change.entity_id,
                "status": "synced",
            })),
            Err(e) => {
                tracing::warn!("Push failed for {} {}: {}", change.entity_type, change.entity_id, e);
                results.push(serde_json::json!({
                    "entity_id": change.entity_id,
                    "status": "error",
                    "error": e.to_string(),
                }));
            }
        }
    }

    (StatusCode::OK, Json(serde_json::json!({"results": results}))).into_response()
}
```

**Step 2: Wire routes in main.rs**

Add UG integration routes to the `protected_routes` block in `main.rs`, after the images route (line 149):

```rust
        .route(
            "/api/boards/:id/ug/connect",
            post(ug_integration::handlers::connect),
        )
        .route(
            "/api/boards/:id/ug/connect",
            delete(ug_integration::handlers::disconnect),
        )
        .route(
            "/api/boards/:id/ug/status",
            get(ug_integration::handlers::status),
        )
        .route(
            "/api/boards/:id/ug/sync",
            post(ug_integration::handlers::sync),
        )
        .route(
            "/api/boards/:id/ug/push",
            post(ug_integration::handlers::push),
        )
```

Also add the use at the top of main.rs:
```rust
use ug_integration::handlers;
```

(Or reference via `ug_integration::handlers::` directly as shown above.)

**Step 3: Verify compilation**

Run: `cd backend && cargo build 2>&1 | tail -10`
Expected: compiles. Fix any type mismatches between `user_has_access` signature and how we call it. Adapt to existing return type (likely `Result<Option<String>>`).

**Step 4: Commit**

```bash
git add backend/src/ug_integration/handlers.rs backend/src/main.rs
git commit -m "feat: add UG integration API handlers (connect/disconnect/sync/push/status)"
```

---

## Task 5: Background sync loop

**Files:**
- Create: `backend/src/ug_integration/sync_loop.rs`
- Modify: `backend/src/ug_integration/mod.rs` (add `pub mod sync_loop;`)
- Modify: `backend/src/main.rs` (spawn the loop before server start)

**Step 1: Create sync loop**

Create `backend/src/ug_integration/sync_loop.rs`:

```rust
use std::sync::Arc;
use std::time::Duration;

use sqlx::PgPool;

use super::client::UgClient;
use crate::db;

/// Spawn a background task that polls UG Core every 30 seconds
/// for all boards with active UG connections.
pub fn spawn_sync_loop(pool: Arc<PgPool>) {
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

    tracing::debug!("Background sync: checking {} UG connections", connections.len());

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
            // This requires integrating with the RoomManager to push updates
            // to connected clients. For now, we log and update timestamp.
        }
    } else {
        // No last_synced — skip background sync (requires manual trigger first)
        return Ok(());
    }

    db::ug_connections::update_last_synced(pool, conn.board_id).await?;
    Ok(())
}
```

**Step 2: Register module**

In `backend/src/ug_integration/mod.rs`, add:
```rust
pub mod sync_loop;
```

**Step 3: Spawn loop in main.rs**

In `main.rs`, after AppState creation (after line 75) but before router setup:

```rust
    // Spawn background UG sync loop
    ug_integration::sync_loop::spawn_sync_loop(Arc::new(state.pool.clone()));
```

Wait — `state.pool` is inside `Arc<AppState>`. We need the pool before wrapping. Adjust:

```rust
    // Spawn background UG sync loop (before Arc wrapping)
    let pool_for_sync = pool.clone();

    let state = Arc::new(AppState { pool, ... });

    // After state creation:
    ug_integration::sync_loop::spawn_sync_loop(Arc::new(pool_for_sync));
```

Or pass `state.pool.clone()` — either works since PgPool is Clone.

**Step 4: Verify compilation**

Run: `cd backend && cargo build 2>&1 | tail -5`

**Step 5: Commit**

```bash
git add backend/src/ug_integration/sync_loop.rs backend/src/ug_integration/mod.rs backend/src/main.rs
git commit -m "feat: add background UG sync loop (30s polling)"
```

---

## Task 6: Frontend — `ug-api.js` (API client replacing mock data)

**Files:**
- Create: `backend/static/js/plugins/ug-api.js`

**Step 1: Create the API client**

Create `backend/static/js/plugins/ug-api.js`:

```javascript
// UG Plugin - API client for backend UG integration endpoints
// Replaces ug-mock-data.js with real API calls

import { getToken } from '/js/auth.js?v=4';

async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const res = await fetch(path, {
        ...options,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `API error: ${res.status}`);
    }

    return res;
}

/**
 * Connect a board to UG Core.
 * @param {string} boardId
 * @param {string} ugBaseUrl - UG Core base URL
 * @param {string} apiKey - API key
 * @param {string} messeId - Messe ID in UG Core
 * @returns {Promise<UgFullResponse>} - Full messe data from initial sync
 */
export async function connectUg(boardId, ugBaseUrl, apiKey, messeId) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/connect`, {
        method: 'POST',
        body: { ug_base_url: ugBaseUrl, api_key: apiKey, messe_id: messeId },
    });
    return res.json();
}

/**
 * Disconnect a board from UG Core.
 * @param {string} boardId
 */
export async function disconnectUg(boardId) {
    await apiFetch(`/api/boards/${boardId}/ug/connect`, {
        method: 'DELETE',
    });
}

/**
 * Get UG connection status for a board.
 * @param {string} boardId
 * @returns {Promise<{connected: boolean, messe_id?: string, last_synced?: string, sync_enabled?: boolean}>}
 */
export async function getUgStatus(boardId) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/status`);
    return res.json();
}

/**
 * Trigger manual sync — fetches latest from UG Core.
 * Returns full data (if first sync) or incremental changes.
 * @param {string} boardId
 * @returns {Promise<Object>} - UgFullResponse or UgChangesResponse
 */
export async function syncUg(boardId) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/sync`, {
        method: 'POST',
    });
    return res.json();
}

/**
 * Push local changes to UG Core.
 * @param {string} boardId
 * @param {Array<{entity_type: string, entity_id: string, data: Object}>} changes
 * @returns {Promise<{results: Array}>}
 */
export async function pushChanges(boardId, changes) {
    const res = await apiFetch(`/api/boards/${boardId}/ug/push`, {
        method: 'POST',
        body: { changes },
    });
    return res.json();
}

// === Compatibility layer ===
// These re-export the same data shapes as ug-mock-data.js
// so that ug-layout.js and ug-panel.js can switch over incrementally.

export const STATUS_FARVER = {
    bekraeftet: '#4CAF50',
    afventer:   '#FF9800',
    annulleret: '#f44336',
    ledig:      '#9E9E9E',
};

/**
 * Look up exhibitor by ID in a list.
 */
export function findUdstiller(udstillere, id) {
    return udstillere.find(u => u.id === id) || null;
}

/**
 * Get stands for a specific hall.
 */
export function getStandeForHal(stande, halId) {
    return stande.filter(s => s.hal_id === halId);
}

/**
 * Count stands by status.
 */
export function getStatusTaelling(stande) {
    const counts = { bekraeftet: 0, afventer: 0, annulleret: 0, ledig: 0 };
    for (const stand of stande) {
        if (counts[stand.status] !== undefined) {
            counts[stand.status]++;
        }
    }
    return counts;
}
```

**Step 2: Commit**

```bash
git add backend/static/js/plugins/ug-api.js
git commit -m "feat: add ug-api.js frontend API client"
```

---

## Task 7: Frontend — Update `ug-layout.js` to accept data parameter

**Files:**
- Modify: `backend/static/js/plugins/ug-layout.js`

The key change: functions currently import `MOCK_*` constants directly. We refactor to accept data as a parameter, so callers can pass either mock data or API data.

**Step 1: Refactor `ug-layout.js`**

Replace the mock-data import and refactor functions to accept a `data` parameter:

Remove import of `ug-mock-data.js` (lines 6-8). Instead, import helpers from `ug-api.js`:

```javascript
// ug-layout.js - top of file
import { generateId, createConnector } from '/js/canvas.js?v=4';
import { STATUS_FARVER, findUdstiller, getStandeForHal } from './ug-api.js?v=4';
import { UG_ELEMENT_TYPES } from './ug-elements.js';
```

Change `generateGulvplan` signature to accept data:

```javascript
export function generateGulvplan(app, data, originX = 100, originY = 100) {
    const elements = [];
    const gap = 60;
    let halX = originX;

    for (const hal of data.haller) {
        const halEl = {
            id: generateId(),
            type: 'ug-hal',
            x: halX, y: originY,
            width: hal.bredde, height: hal.hoejde,
            color: hal.farve,
            fill: hexToRgba(hal.farve, 0.06),
            content: hal.navn,
            fontSize: 20,
            external: {
                id: hal.id, type: 'hal',
                syncStatus: 'synced',
                data: { ...hal },
            },
        };
        elements.push(halEl);

        const stande = getStandeForHal(data.stande, hal.id);
        const standPadding = 20;
        const headerH = 45;
        const standGap = 15;
        const cols = Math.floor((hal.bredde - standPadding * 2 + standGap) / (130 + standGap)) || 1;

        stande.forEach((stand, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const udstiller = findUdstiller(data.udstillere, stand.udstiller_id);
            const standLabel = udstiller ? udstiller.firmanavn : 'LEDIG';

            const standEl = {
                id: generateId(),
                type: 'ug-stand',
                x: halX + standPadding + col * (stand.bredde + standGap),
                y: originY + headerH + standPadding + row * (stand.hoejde + standGap),
                width: stand.bredde, height: stand.hoejde,
                color: STATUS_FARVER[stand.status] || '#9E9E9E',
                content: `${stand.standnummer}\n${standLabel}`,
                fontSize: 14,
                external: {
                    id: stand.id, type: 'stand',
                    syncStatus: 'synced',
                    data: {
                        standnummer: stand.standnummer,
                        udstiller: standLabel,
                        status: stand.status,
                        hal_id: hal.id,
                    },
                },
            };
            elements.push(standEl);
        });

        halX += hal.bredde + gap;
    }
    return elements;
}
```

Change `generateHierarki` to accept data:

```javascript
export function generateHierarki(app, data, originX = 100, originY = 600) {
    // Same logic but using data.haller, data.taxonomier, data.messe
    // instead of MOCK_HALLER, MOCK_TAXONOMIER, MOCK_MESSE
    ...
}
```

Change `importMesseData` to accept a data parameter:

```javascript
export function importMesseData(app, data) {
    try {
        const cam = app.camera;
        const viewCenter = cam.screenToWorld(window.innerWidth / 2, window.innerHeight / 3);

        const gulvplanEls = generateGulvplan(app, data, viewCenter.x - 400, viewCenter.y - 200);
        const hierarkiY = viewCenter.y + 300;
        const hierarkiEls = generateHierarki(app, data, viewCenter.x - 400, hierarkiY);

        const allEls = [...gulvplanEls, ...hierarkiEls];
        for (const el of allEls) {
            app.addElement(el);
        }
        return allEls.length;
    } catch (error) {
        console.error('UG Plugin: Fejl ved import af messe-data:', error);
        throw error;
    }
}
```

**Step 2: Verify no import version mismatch**

Ensure all `?v=4` versions are consistent in the new imports.

**Step 3: Commit**

```bash
git add backend/static/js/plugins/ug-layout.js
git commit -m "refactor: ug-layout.js accepts data parameter instead of mock imports"
```

---

## Task 8: Frontend — Update `ug-panel.js` with connect dialog and live data

**Files:**
- Modify: `backend/static/js/plugins/ug-panel.js`

The panel gets three states: (1) Not connected — show connect form, (2) Connected — show live data + sync controls, (3) Loading.

**Step 1: Rewrite ug-panel.js**

Replace the entire file. The new version:
- Imports from `ug-api.js` instead of `ug-mock-data.js`
- Checks UG connection status on render
- Shows connect form if not connected
- Shows live data panel if connected
- Adds sync/disconnect buttons

```javascript
// UG Plugin - Sidebar panel UI
// Three states: not connected (form), connected (data overview), loading

import {
    connectUg, disconnectUg, getUgStatus, syncUg,
    STATUS_FARVER, findUdstiller, getStandeForHal, getStatusTaelling,
} from './ug-api.js?v=4';
import { importMesseData } from './ug-layout.js?v=4';

export function renderUgPanel(container, app) {
    container.innerHTML = '<div style="padding:8px; color:var(--wa-color-neutral-500); font-size:12px">Indlæser...</div>';

    const boardId = app.boardId;
    if (!boardId) {
        container.innerHTML = '<div style="padding:8px; color:var(--wa-color-neutral-500)">Intet board valgt</div>';
        return;
    }

    // Check connection status
    getUgStatus(boardId)
        .then(status => {
            if (status.connected) {
                renderConnectedPanel(container, app, status);
            } else {
                renderConnectForm(container, app);
            }
        })
        .catch(err => {
            console.error('UG Panel: status check failed:', err);
            // Fallback: show connect form
            renderConnectForm(container, app);
        });
}

function renderConnectForm(container, app) {
    container.innerHTML = '';

    const section = document.createElement('div');
    section.style.cssText = 'padding:4px 0';
    section.innerHTML = `
        <h3 style="margin:0 0 12px; font-size:16px; font-weight:600">Forbind til UG Core</h3>
        <p style="font-size:12px; color:var(--wa-color-neutral-500); margin:0 0 16px">
            Indtast forbindelsesoplysninger til UG Core for at importere messedata.
        </p>
    `;

    // URL field
    const urlInput = document.createElement('wa-input');
    urlInput.label = 'UG Core URL';
    urlInput.placeholder = 'https://ug-core.example.com';
    urlInput.size = 'small';
    urlInput.style.cssText = 'margin-bottom:10px; width:100%';
    section.appendChild(urlInput);

    // API key field
    const keyInput = document.createElement('wa-input');
    keyInput.label = 'API-nøgle';
    keyInput.type = 'password';
    keyInput.size = 'small';
    keyInput.style.cssText = 'margin-bottom:10px; width:100%';
    section.appendChild(keyInput);

    // Messe ID field
    const messeInput = document.createElement('wa-input');
    messeInput.label = 'Messe-ID';
    messeInput.placeholder = 'messe-001';
    messeInput.size = 'small';
    messeInput.style.cssText = 'margin-bottom:16px; width:100%';
    section.appendChild(messeInput);

    // Connect button
    const connectBtn = document.createElement('wa-button');
    connectBtn.variant = 'brand';
    connectBtn.size = 'small';
    connectBtn.style.cssText = 'width:100%';
    connectBtn.innerHTML = '<wa-icon slot="prefix" name="plug"></wa-icon> Forbind';
    connectBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        const key = keyInput.value.trim();
        const messeId = messeInput.value.trim();

        if (!url || !key || !messeId) {
            showPanelToast(app, 'Udfyld alle felter', 'warning');
            return;
        }

        connectBtn.loading = true;
        try {
            const data = await connectUg(app.boardId, url, key, messeId);
            const count = importMesseData(app, data);
            showPanelToast(app, `Forbundet! ${count} elementer importeret`, 'success');
            // Re-render panel in connected state
            renderUgPanel(container, app);
        } catch (error) {
            showPanelToast(app, `Fejl: ${error.message}`, 'danger');
        } finally {
            connectBtn.loading = false;
        }
    });
    section.appendChild(connectBtn);

    container.appendChild(section);
}

function renderConnectedPanel(container, app, status) {
    container.innerHTML = '';

    // Header with sync info
    const header = document.createElement('div');
    header.style.cssText = 'margin-bottom:16px';
    const lastSync = status.last_synced
        ? new Date(status.last_synced).toLocaleString('da-DK')
        : 'Aldrig';
    header.innerHTML = `
        <h3 style="margin:0 0 4px; font-size:16px; font-weight:600">UG Core</h3>
        <div style="font-size:12px; color:var(--wa-color-neutral-500)">
            Messe: ${status.messe_id} &middot; Synkroniseret: ${lastSync}
        </div>
    `;
    container.appendChild(header);

    // Action buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:6px; margin-bottom:16px';

    const syncBtn = document.createElement('wa-button');
    syncBtn.variant = 'brand';
    syncBtn.size = 'small';
    syncBtn.style.cssText = 'flex:1';
    syncBtn.innerHTML = '<wa-icon slot="prefix" name="arrows-rotate"></wa-icon> Synkroniser';
    syncBtn.addEventListener('click', async () => {
        syncBtn.loading = true;
        try {
            const data = await syncUg(app.boardId);
            // If full response (has .haller), re-import
            if (data.haller) {
                const count = importMesseData(app, data);
                showPanelToast(app, `${count} elementer opdateret`, 'success');
            } else if (data.changes) {
                showPanelToast(app, `${data.changes.length} ændringer hentet`, 'success');
            }
            renderUgPanel(container, app);
        } catch (error) {
            showPanelToast(app, `Sync fejl: ${error.message}`, 'danger');
        } finally {
            syncBtn.loading = false;
        }
    });
    btnRow.appendChild(syncBtn);

    const disconnectBtn = document.createElement('wa-button');
    disconnectBtn.variant = 'default';
    disconnectBtn.size = 'small';
    disconnectBtn.innerHTML = '<wa-icon slot="prefix" name="plug-circle-xmark"></wa-icon> Afbryd';
    disconnectBtn.addEventListener('click', async () => {
        try {
            await disconnectUg(app.boardId);
            showPanelToast(app, 'Afbrudt fra UG Core', 'success');
            renderUgPanel(container, app);
        } catch (error) {
            showPanelToast(app, `Fejl: ${error.message}`, 'danger');
        }
    });
    btnRow.appendChild(disconnectBtn);
    container.appendChild(btnRow);

    // Fetch and render live data overview
    renderLiveDataOverview(container, app);
}

async function renderLiveDataOverview(container, app) {
    // Get live data from the sync endpoint
    try {
        const data = await syncUg(app.boardId);

        // If we got full data, render overview sections
        if (data.haller && data.stande) {
            renderStatusSection(container, data.stande);
            renderHalSection(container, data.haller, data.stande);
            renderStandList(container, app, data.stande, data.udstillere);
        }
    } catch (error) {
        const fallback = document.createElement('div');
        fallback.style.cssText = 'font-size:12px; color:var(--wa-color-neutral-400); padding:8px';
        fallback.textContent = 'Kunne ikke hente live data. Brug Synkroniser-knappen.';
        container.appendChild(fallback);
    }
}

function renderStatusSection(container, stande) {
    const counts = getStatusTaelling(stande);
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:16px';
    section.innerHTML = `
        <h4 style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--wa-color-neutral-600)">Status</h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px">
            ${statusBadge('Bekræftet', counts.bekraeftet, STATUS_FARVER.bekraeftet)}
            ${statusBadge('Afventer', counts.afventer, STATUS_FARVER.afventer)}
            ${statusBadge('Annulleret', counts.annulleret, STATUS_FARVER.annulleret)}
            ${statusBadge('Ledig', counts.ledig, STATUS_FARVER.ledig)}
        </div>
    `;
    container.appendChild(section);
}

function renderHalSection(container, haller, stande) {
    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:16px';
    section.innerHTML = `
        <h4 style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--wa-color-neutral-600)">Haller</h4>
    `;
    for (const hal of haller) {
        const halStande = getStandeForHal(stande, hal.id);
        const optaget = halStande.filter(s => s.status !== 'ledig').length;
        const card = document.createElement('div');
        card.style.cssText = `
            padding:8px 10px; margin-bottom:6px; border-radius:6px;
            border-left:4px solid ${hal.farve}; background:var(--wa-color-neutral-50);
            font-size:13px;
        `;
        card.innerHTML = `
            <div style="font-weight:600">${hal.navn}</div>
            <div style="color:var(--wa-color-neutral-500); font-size:11px">
                ${halStande.length} stande &middot; ${optaget} optaget &middot; ${halStande.length - optaget} ledige
            </div>
        `;
        section.appendChild(card);
    }
    container.appendChild(section);
}

function renderStandList(container, app, stande, udstillere) {
    const section = document.createElement('div');
    section.innerHTML = `
        <h4 style="margin:0 0 8px; font-size:13px; font-weight:600; color:var(--wa-color-neutral-600)">Stande</h4>
    `;

    const filterRow = document.createElement('div');
    filterRow.style.cssText = 'display:flex; gap:6px; margin-bottom:8px';
    const filterSelect = document.createElement('wa-select');
    filterSelect.size = 'small';
    filterSelect.value = 'alle';
    filterSelect.style.cssText = 'flex:1';
    filterSelect.innerHTML = `
        <wa-option value="alle">Alle</wa-option>
        <wa-option value="bekraeftet">Bekræftet</wa-option>
        <wa-option value="afventer">Afventer</wa-option>
        <wa-option value="ledig">Ledig</wa-option>
        <wa-option value="annulleret">Annulleret</wa-option>
    `;
    filterRow.appendChild(filterSelect);
    section.appendChild(filterRow);

    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'max-height:300px; overflow-y:auto';
    section.appendChild(listContainer);
    container.appendChild(section);

    function renderList(filter) {
        listContainer.innerHTML = '';
        const filtered = filter === 'alle'
            ? stande
            : stande.filter(s => s.status === filter);

        for (const stand of filtered) {
            const udstiller = findUdstiller(udstillere, stand.udstiller_id);
            const item = document.createElement('div');
            item.style.cssText = `
                display:flex; align-items:center; gap:8px;
                padding:6px 8px; border-radius:4px; margin-bottom:4px;
                background:white; border:1px solid var(--wa-color-neutral-200);
                font-size:12px; cursor:pointer;
            `;
            item.innerHTML = `
                <span style="width:8px; height:8px; border-radius:50%; background:${STATUS_FARVER[stand.status] || '#999'}; flex-shrink:0"></span>
                <span style="font-weight:600; min-width:32px">${stand.standnummer}</span>
                <span style="flex:1; color:var(--wa-color-neutral-600); overflow:hidden; text-overflow:ellipsis; white-space:nowrap">
                    ${udstiller ? udstiller.firmanavn : 'Ledig'}
                </span>
            `;
            item.addEventListener('click', () => {
                const standEl = app.elements.find(e =>
                    e.type === 'ug-stand' && e.external?.data?.standnummer === stand.standnummer
                );
                if (standEl) {
                    app.camera.x = standEl.x + standEl.width / 2 - window.innerWidth / 2;
                    app.camera.y = standEl.y + standEl.height / 2 - window.innerHeight / 2;
                    app.selectedIds = new Set([standEl.id]);
                }
            });
            listContainer.appendChild(item);
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div style="color:var(--wa-color-neutral-400); font-size:12px; padding:8px">Ingen stande med dette filter</div>';
        }
    }

    renderList('alle');
    filterSelect.addEventListener('wa-change', () => renderList(filterSelect.value));
}

// === Helpers ===

function statusBadge(label, count, color) {
    return `
        <div style="display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:6px; background:var(--wa-color-neutral-50)">
            <span style="width:10px; height:10px; border-radius:50%; background:${color}"></span>
            <span style="font-size:12px; flex:1">${label}</span>
            <span style="font-size:14px; font-weight:700">${count}</span>
        </div>
    `;
}

function showPanelToast(app, message, variant) {
    if (app && app.uiManager) {
        app.uiManager.showToast(message, variant);
    }
}
```

**Step 2: Verify import version strings are `?v=4`**

Check that `ug-api.js?v=4` and `ug-layout.js?v=4` match existing versions.

**Step 3: Commit**

```bash
git add backend/static/js/plugins/ug-panel.js
git commit -m "feat: ug-panel.js with connect form, live data, sync/disconnect"
```

---

## Task 9: Frontend — Update `ug-plugin.js` to wire everything together

**Files:**
- Modify: `backend/static/js/plugins/ug-plugin.js`

The tool's `onDown` handler needs to use the API now instead of mock data.

**Step 1: Update ug-plugin.js**

Replace the mock-data import with api import:

```javascript
// UG Plugin - Main registration
// Registrerer element-typer, panel og tools for Udstillerguide

import { WhiteboardPlugins } from '/js/plugins.js?v=4';
import { UG_ELEMENT_TYPES } from './ug-elements.js';
import { importMesseData } from './ug-layout.js?v=4';
import { renderUgPanel } from './ug-panel.js?v=4';
import { syncUg } from './ug-api.js?v=4';

WhiteboardPlugins.register('udstillerguide', {
    elementTypes: UG_ELEMENT_TYPES,

    panel: {
        id: 'udstillerguide',
        title: 'Udstillerguide',
        render: (container) => {
            const app = window.__whiteboardApp;
            renderUgPanel(container, app);
        },
    },

    tools: [
        {
            name: 'ug-import',
            title: 'Synkroniser messe-data fra UG Core',
            icon: '<wa-icon name="arrows-rotate" variant="sharp" family="solid" style="font-size:18px"></wa-icon>',
            cursor: 'default',
            onDown: async (world, app) => {
                try {
                    const data = await syncUg(app.boardId);
                    if (data.haller) {
                        const count = importMesseData(app, data);
                        if (app.uiManager) {
                            app.uiManager.showToast(`${count} elementer importeret`, 'success');
                        }
                    } else {
                        if (app.uiManager) {
                            app.uiManager.showToast('Ingen UG-forbindelse. Brug panelet til at forbinde.', 'warning');
                        }
                    }
                } catch (error) {
                    console.error('UG import failed:', error);
                    if (app.uiManager) {
                        app.uiManager.showToast(`Import fejl: ${error.message}`, 'danger');
                    }
                }
            },
        },
    ],

    onElementUpdate: (id, props) => {
        // TODO: Queue changes for push to UG Core
    },

    onElementDelete: (id) => {
        // TODO: Handle deletion of synced elements
    },
});
```

**Step 2: Commit**

```bash
git add backend/static/js/plugins/ug-plugin.js
git commit -m "refactor: ug-plugin.js uses API sync instead of mock data"
```

---

## Task 10: Mock server for development and testing

**Files:**
- Create: `mock-ug-server/server.js`
- Create: `mock-ug-server/package.json`

A simple Node.js server that implements the UG Core API contract so we can develop and test without a live UG Core instance.

**Step 1: Create package.json**

```json
{
  "name": "mock-ug-core",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js"
  }
}
```

**Step 2: Create mock server**

Create `mock-ug-server/server.js`:

```javascript
import { createServer } from 'node:http';

const PORT = 4000;

const MOCK_DATA = {
    messe: { id: 'messe-001', navn: 'FoodExpo 2026', dato: '2026-09-15', lokation: 'Bella Center, København' },
    haller: [
        { id: 'hal-a', navn: 'Hal A', bredde: 600, hoejde: 400, farve: '#2196F3' },
        { id: 'hal-b', navn: 'Hal B', bredde: 500, hoejde: 350, farve: '#FF9800' },
    ],
    stande: [
        { id: 'stand-a01', standnummer: 'A01', hal_id: 'hal-a', udstiller_id: 'udst-001', bredde: 120, hoejde: 80, status: 'bekraeftet', position: { x: 20, y: 65 } },
        { id: 'stand-a02', standnummer: 'A02', hal_id: 'hal-a', udstiller_id: null, bredde: 120, hoejde: 80, status: 'ledig', position: { x: 155, y: 65 } },
        { id: 'stand-a03', standnummer: 'A03', hal_id: 'hal-a', udstiller_id: 'udst-002', bredde: 100, hoejde: 80, status: 'bekraeftet', position: { x: 290, y: 65 } },
        { id: 'stand-a04', standnummer: 'A04', hal_id: 'hal-a', udstiller_id: 'udst-003', bredde: 140, hoejde: 80, status: 'afventer', position: { x: 20, y: 160 } },
        { id: 'stand-a05', standnummer: 'A05', hal_id: 'hal-a', udstiller_id: null, bredde: 120, hoejde: 80, status: 'ledig', position: { x: 175, y: 160 } },
        { id: 'stand-b01', standnummer: 'B01', hal_id: 'hal-b', udstiller_id: 'udst-004', bredde: 130, hoejde: 80, status: 'bekraeftet', position: { x: 20, y: 65 } },
        { id: 'stand-b02', standnummer: 'B02', hal_id: 'hal-b', udstiller_id: 'udst-005', bredde: 120, hoejde: 80, status: 'annulleret', position: { x: 165, y: 65 } },
        { id: 'stand-b03', standnummer: 'B03', hal_id: 'hal-b', udstiller_id: null, bredde: 110, hoejde: 80, status: 'ledig', position: { x: 300, y: 65 } },
    ],
    udstillere: [
        { id: 'udst-001', firmanavn: 'Nordic Foods A/S', kontakt: 'Anna Jensen', email: 'anna@nordicfoods.dk' },
        { id: 'udst-002', firmanavn: 'GreenBite ApS', kontakt: 'Lars Nielsen', email: 'lars@greenbite.dk' },
        { id: 'udst-003', firmanavn: 'ScandiDrinks', kontakt: 'Maria Petersen', email: 'maria@scandidrinks.dk' },
        { id: 'udst-004', firmanavn: 'FreshFarm Ltd', kontakt: 'Erik Holm', email: 'erik@freshfarm.dk' },
        { id: 'udst-005', firmanavn: 'TasteWave', kontakt: 'Sofie Berg', email: 'sofie@tastewave.dk' },
    ],
    taxonomier: [
        { id: 'tax-prog', navn: 'Program', parent: null, children: ['tax-sem', 'tax-work'] },
        { id: 'tax-sem', navn: 'Seminarer', parent: 'tax-prog', children: [] },
        { id: 'tax-work', navn: 'Workshops', parent: 'tax-prog', children: [] },
        { id: 'tax-kat', navn: 'Kategorier', parent: null, children: ['tax-food', 'tax-drink', 'tax-tech'] },
        { id: 'tax-food', navn: 'Food', parent: 'tax-kat', children: [] },
        { id: 'tax-drink', navn: 'Drikkevarer', parent: 'tax-kat', children: [] },
        { id: 'tax-tech', navn: 'FoodTech', parent: 'tax-kat', children: [] },
    ],
    version: new Date().toISOString(),
};

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
}

const server = createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-User-Id',
        });
        return res.end();
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    // Validate API key
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return json(res, { error: 'Missing X-API-Key header' }, 401);
    }

    console.log(`${req.method} ${path}`);

    // Route: GET /api/v1/messer/:id
    const messeMatch = path.match(/^\/api\/v1\/messer\/([^/]+)$/);
    if (messeMatch && req.method === 'GET') {
        return json(res, MOCK_DATA.messe);
    }

    // Route: GET /api/v1/messer/:id/full
    const fullMatch = path.match(/^\/api\/v1\/messer\/([^/]+)\/full$/);
    if (fullMatch && req.method === 'GET') {
        return json(res, MOCK_DATA);
    }

    // Route: GET /api/v1/messer/:id/haller
    const hallerMatch = path.match(/^\/api\/v1\/messer\/([^/]+)\/haller$/);
    if (hallerMatch && req.method === 'GET') {
        return json(res, MOCK_DATA.haller);
    }

    // Route: GET /api/v1/messer/:id/stande
    const standeMatch = path.match(/^\/api\/v1\/messer\/([^/]+)\/stande$/);
    if (standeMatch && req.method === 'GET') {
        return json(res, MOCK_DATA.stande);
    }

    // Route: GET /api/v1/messer/:id/udstillere
    const udstillereMatch = path.match(/^\/api\/v1\/messer\/([^/]+)\/udstillere$/);
    if (udstillereMatch && req.method === 'GET') {
        return json(res, MOCK_DATA.udstillere);
    }

    // Route: GET /api/v1/messer/:id/taxonomier
    const taxMatch = path.match(/^\/api\/v1\/messer\/([^/]+)\/taxonomier$/);
    if (taxMatch && req.method === 'GET') {
        return json(res, MOCK_DATA.taxonomier);
    }

    // Route: GET /api/v1/messer/:id/changes?since=...
    const changesMatch = path.match(/^\/api\/v1\/messer\/([^/]+)\/changes$/);
    if (changesMatch && req.method === 'GET') {
        // Return empty changes (no updates since last sync)
        return json(res, { changes: [], version: new Date().toISOString() });
    }

    // Route: PUT /api/v1/stande/:id
    const standPut = path.match(/^\/api\/v1\/stande\/([^/]+)$/);
    if (standPut && req.method === 'PUT') {
        console.log(`  -> Stand ${standPut[1]} updated`);
        return json(res, { ok: true });
    }

    // Route: PUT /api/v1/taxonomier/:id
    const taxPut = path.match(/^\/api\/v1\/taxonomier\/([^/]+)$/);
    if (taxPut && req.method === 'PUT') {
        console.log(`  -> Taxonomy ${taxPut[1]} updated`);
        return json(res, { ok: true });
    }

    json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, () => {
    console.log(`Mock UG Core server running on http://localhost:${PORT}`);
    console.log('Endpoints:');
    console.log('  GET  /api/v1/messer/:id');
    console.log('  GET  /api/v1/messer/:id/full');
    console.log('  GET  /api/v1/messer/:id/changes?since=...');
    console.log('  PUT  /api/v1/stande/:id');
    console.log('  PUT  /api/v1/taxonomier/:id');
});
```

**Step 3: Verify mock server runs**

Run: `cd mock-ug-server && node server.js`
Expected: "Mock UG Core server running on http://localhost:4000"

Test: `curl -H "X-API-Key: test" http://localhost:4000/api/v1/messer/messe-001/full | head -c 200`
Expected: JSON with messe, haller, stande, etc.

**Step 4: Commit**

```bash
git add mock-ug-server/
git commit -m "feat: add mock UG Core server for development/testing"
```

---

## Task 11: OpenAPI specification for UG Core team

**Files:**
- Create: `docs/ug-core-api-spec.yaml`

**Step 1: Write OpenAPI 3.0 spec**

Create `docs/ug-core-api-spec.yaml` with the full contract from the design doc. This is documentation for the UG Core team to implement.

Key sections:
- Info + server URLs
- Security scheme (X-API-Key header)
- Paths matching all read + write endpoints from design doc
- Schema definitions for Messe, Hal, Stand, Udstiller, Taxonomi, FullResponse, ChangesResponse

```yaml
openapi: "3.0.3"
info:
  title: UG Core API — Whiteboard Integration
  version: "1.0.0"
  description: |
    API-kontrakt mellem Udstillerguide Whiteboard og UG Core.
    Whiteboard-backenden kalder disse endpoints for at synkronisere messedata.

servers:
  - url: "{baseUrl}/api/v1"
    variables:
      baseUrl:
        default: "https://ug-core.example.com"

security:
  - apiKey: []

paths:
  /messer/{messeId}:
    get:
      summary: Hent messe metadata
      parameters:
        - name: messeId
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: Messe data
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Messe" }

  /messer/{messeId}/full:
    get:
      summary: Hent alt data for en messe (bulk)
      parameters:
        - name: messeId
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: Fuld messe-data
          content:
            application/json:
              schema: { $ref: "#/components/schemas/FullResponse" }

  /messer/{messeId}/changes:
    get:
      summary: Ændringer siden et tidspunkt (incremental sync)
      parameters:
        - name: messeId
          in: path
          required: true
          schema: { type: string }
        - name: since
          in: query
          required: true
          schema: { type: string, format: date-time }
      responses:
        "200":
          description: Liste af ændringer
          content:
            application/json:
              schema: { $ref: "#/components/schemas/ChangesResponse" }

  /stande/{standId}:
    put:
      summary: Opdater stand (position, status)
      parameters:
        - name: standId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        content:
          application/json:
            schema: { $ref: "#/components/schemas/StandUpdate" }
      responses:
        "200":
          description: Opdateret

  /taxonomier/{taxonomiId}:
    put:
      summary: Opdater kategori
      parameters:
        - name: taxonomiId
          in: path
          required: true
          schema: { type: string }
      requestBody:
        content:
          application/json:
            schema: { $ref: "#/components/schemas/TaxonomiUpdate" }
      responses:
        "200":
          description: Opdateret

components:
  securitySchemes:
    apiKey:
      type: apiKey
      in: header
      name: X-API-Key

  schemas:
    Messe:
      type: object
      required: [id, navn, dato, lokation]
      properties:
        id: { type: string }
        navn: { type: string }
        dato: { type: string }
        lokation: { type: string }

    Hal:
      type: object
      required: [id, navn, bredde, hoejde, farve]
      properties:
        id: { type: string }
        navn: { type: string }
        bredde: { type: number }
        hoejde: { type: number }
        farve: { type: string, description: "Hex color e.g. #2196F3" }

    Position:
      type: object
      properties:
        x: { type: number }
        y: { type: number }

    Stand:
      type: object
      required: [id, standnummer, hal_id, bredde, hoejde, status]
      properties:
        id: { type: string }
        standnummer: { type: string }
        hal_id: { type: string }
        udstiller_id: { type: string, nullable: true }
        bredde: { type: number }
        hoejde: { type: number }
        status: { type: string, enum: [bekraeftet, afventer, annulleret, ledig] }
        position: { $ref: "#/components/schemas/Position" }

    Udstiller:
      type: object
      required: [id, firmanavn]
      properties:
        id: { type: string }
        firmanavn: { type: string }
        kontakt: { type: string }
        email: { type: string }

    Taxonomi:
      type: object
      required: [id, navn]
      properties:
        id: { type: string }
        navn: { type: string }
        parent: { type: string, nullable: true }
        children: { type: array, items: { type: string } }

    FullResponse:
      type: object
      required: [messe, haller, stande, udstillere, taxonomier, version]
      properties:
        messe: { $ref: "#/components/schemas/Messe" }
        haller: { type: array, items: { $ref: "#/components/schemas/Hal" } }
        stande: { type: array, items: { $ref: "#/components/schemas/Stand" } }
        udstillere: { type: array, items: { $ref: "#/components/schemas/Udstiller" } }
        taxonomier: { type: array, items: { $ref: "#/components/schemas/Taxonomi" } }
        version: { type: string, format: date-time }

    Change:
      type: object
      required: [entity_type, entity_id, action, data, changed_at]
      properties:
        entity_type: { type: string, enum: [stand, hal, udstiller, taxonomi] }
        entity_id: { type: string }
        action: { type: string, enum: [created, updated, deleted] }
        data: { type: object }
        changed_at: { type: string, format: date-time }

    ChangesResponse:
      type: object
      required: [changes, version]
      properties:
        changes: { type: array, items: { $ref: "#/components/schemas/Change" } }
        version: { type: string, format: date-time }

    StandUpdate:
      type: object
      properties:
        position: { $ref: "#/components/schemas/Position" }
        status: { type: string }

    TaxonomiUpdate:
      type: object
      properties:
        navn: { type: string }
        parent: { type: string, nullable: true }
```

**Step 2: Commit**

```bash
git add docs/ug-core-api-spec.yaml
git commit -m "docs: add OpenAPI 3.0 spec for UG Core API contract"
```

---

## Task 12: End-to-end smoke test

**Files:** None created — this is a manual verification task.

**Step 1: Start mock UG Core server**

```bash
cd mock-ug-server && node server.js &
```

**Step 2: Start whiteboard backend**

```bash
cd backend && cargo run
```

**Step 3: Open board in browser**

Navigate to a board page. Open the UG sidebar panel.

**Step 4: Test connect flow**

In the panel, enter:
- URL: `http://localhost:4000`
- API Key: `test-key`
- Messe ID: `messe-001`

Click "Forbind". Verify:
- Toast shows success message
- Elements appear on canvas (halls + stands + hierarchy)
- Panel switches to connected state with data overview

**Step 5: Test sync**

Click "Synkroniser" button. Verify it completes without error.

**Step 6: Test disconnect**

Click "Afbryd". Verify panel returns to connect form.

**Step 7: Commit final state**

```bash
git add -A
git commit -m "feat: UG Core integration complete — connect, sync, push, mock server"
```

---

## Summary of all tasks

| # | Task | Files | Depends on |
|---|------|-------|-----------|
| 1 | Database migration | `db/mod.rs` | — |
| 2 | DB queries module | `db/ug_connections.rs` | 1 |
| 3 | UG Core HTTP client + types | `ug_integration/{mod,client,types}.rs` | — |
| 4 | Backend API handlers | `ug_integration/handlers.rs`, `main.rs` | 2, 3 |
| 5 | Background sync loop | `ug_integration/sync_loop.rs`, `main.rs` | 2, 3 |
| 6 | Frontend API client | `plugins/ug-api.js` | 4 |
| 7 | Refactor ug-layout.js | `plugins/ug-layout.js` | 6 |
| 8 | Rewrite ug-panel.js | `plugins/ug-panel.js` | 6, 7 |
| 9 | Update ug-plugin.js | `plugins/ug-plugin.js` | 7, 8 |
| 10 | Mock server | `mock-ug-server/` | — |
| 11 | OpenAPI spec | `docs/ug-core-api-spec.yaml` | — |
| 12 | E2E smoke test | — | All |

Tasks 1, 3, 10, 11 can run in parallel (no dependencies between them).
Tasks 2 depends on 1. Tasks 4-5 depend on 2+3. Tasks 6-9 are sequential frontend work depending on 4.
