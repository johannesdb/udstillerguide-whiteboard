use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, Query, State, WebSocketUpgrade,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use super::room::RoomManager;
use super::sync;
use crate::auth;
use crate::db;

#[derive(Debug, Deserialize)]
pub struct WsQuery {
    pub token: Option<String>,
    pub share_token: Option<String>,
}

pub struct AppState {
    pub pool: PgPool,
    pub room_manager: RoomManager,
    pub jwt_secret: String,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(board_id): Path<Uuid>,
    Query(query): Query<WsQuery>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // Authenticate the user
    let (user_id, username) = if let Some(ref token) = query.token {
        match auth::verify_token(token, &state.jwt_secret) {
            Ok(claims) => (claims.sub, claims.username),
            Err(_) => {
                return axum::http::StatusCode::UNAUTHORIZED.into_response();
            }
        }
    } else if let Some(ref share_token) = query.share_token {
        // Guest access via share link
        match db::boards::get_share_link_by_token(&state.pool, share_token).await {
            Ok(Some(link)) if link.board_id == board_id => {
                let guest_id = Uuid::new_v4();
                (guest_id, "Guest".to_string())
            }
            _ => {
                return axum::http::StatusCode::UNAUTHORIZED.into_response();
            }
        }
    } else {
        return axum::http::StatusCode::UNAUTHORIZED.into_response();
    };

    ws.on_upgrade(move |socket| handle_socket(socket, board_id, user_id, username, state))
}

async fn handle_socket(
    socket: WebSocket,
    board_id: Uuid,
    user_id: Uuid,
    username: String,
    state: Arc<AppState>,
) {
    let room = state.room_manager.get_or_create_room(board_id).await;

    // Load existing state from DB if this is a fresh room
    if room.user_count().await == 0 {
        if let Ok(Some(board)) = db::boards::get_board(&state.pool, board_id).await {
            if let Some(yrs_state) = board.yrs_state {
                let doc = room.doc.read().await;
                if let Err(e) = sync::load_doc_state(&doc, &yrs_state) {
                    tracing::error!("Failed to load board state: {}", e);
                }
            }
        }
    }

    room.add_user(user_id, username.clone()).await;
    tracing::info!("User {} joined board {}", username, board_id);

    let mut rx = room.tx.subscribe();
    let (mut sender, mut receiver) = socket.split();

    // Send initial sync step 1
    {
        let doc = room.doc.read().await;
        if let Ok(sync1) = sync::create_sync_step1(&doc) {
            let _ = sender.send(Message::Binary(sync1)).await;
        }
    }

    // Send saved elements to the connecting client
    {
        let doc = room.doc.read().await;
        let elements = sync::get_all_elements(&doc);
        if !elements.is_empty() {
            let sync_msg = serde_json::json!({
                "type": "sync_state",
                "elements": elements,
            });
            if let Ok(json) = serde_json::to_string(&sync_msg) {
                let _ = sender.send(Message::Text(json)).await;
            }
        }
    }

    // Broadcast join event
    let join_msg = serde_json::json!({
        "type": "join",
        "userId": user_id.to_string(),
        "username": username,
        "users": room.get_users().await,
    });
    let _ = room
        .tx
        .send(serde_json::to_vec(&join_msg).unwrap_or_default());

    let room_tx = room.tx.clone();
    let room_doc = room.doc.clone();

    // Task: forward broadcast messages to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(Message::Binary(msg)).await.is_err() {
                break;
            }
        }
    });

    // Task: receive messages from client and process them
    let pool = state.pool.clone();
    let board_id_clone = board_id;
    let mut recv_task = tokio::spawn(async move {
        let mut save_counter = 0u32;
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Binary(data) => {
                    let data = data.to_vec();
                    if data.is_empty() {
                        continue;
                    }

                    // Check if it's a sync message or awareness
                    let msg_type = data[0];

                    if msg_type == sync::MSG_SYNC || (data.len() > 1 && data[0] == 0) {
                        // Handle sync protocol
                        let doc = room_doc.read().await;
                        match sync::handle_sync_message(&doc, &data) {
                            Ok(Some(response)) => {
                                let _ = room_tx.send(response);
                            }
                            Ok(None) => {}
                            Err(e) => {
                                tracing::warn!("Sync error: {}", e);
                            }
                        }
                        drop(doc);

                        // Broadcast update to all clients
                        let _ = room_tx.send(data);

                        // Periodic save to DB
                        save_counter += 1;
                        if save_counter.is_multiple_of(100) {
                            let doc = room_doc.read().await;
                            let state_bytes = sync::encode_doc_state(&doc);
                            if let Err(e) =
                                db::boards::save_yrs_state(&pool, board_id_clone, &state_bytes)
                                    .await
                            {
                                tracing::error!("Failed to save board state: {}", e);
                            }
                        }
                    } else if msg_type == sync::MSG_AWARENESS {
                        // Forward awareness messages to all
                        let _ = room_tx.send(data);
                    } else {
                        // Try to parse as JSON (custom messages)
                        let _ = room_tx.send(data);
                    }
                }
                Message::Text(text) => {
                    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&text) {
                        match msg.get("type").and_then(|t| t.as_str()) {
                            Some("save_request") => {
                                let doc = room_doc.read().await;
                                let state_bytes = sync::encode_doc_state(&doc);
                                drop(doc);
                                if let Err(e) = db::boards::save_yrs_state(&pool, board_id_clone, &state_bytes).await {
                                    tracing::error!("Auto-save failed: {}", e);
                                } else {
                                    tracing::debug!("Auto-save completed for board {}", board_id_clone);
                                }
                                continue;
                            }
                            Some("element_add") | Some("element_update") => {
                                if let Some(element) = msg.get("element") {
                                    if let Some(id) = element.get("id").and_then(|i| i.as_str()) {
                                        if let Ok(json_str) = serde_json::to_string(element) {
                                            let doc = room_doc.read().await;
                                            sync::store_element(&doc, id, &json_str);
                                        }
                                    }
                                }
                                let _ = room_tx.send(text.into_bytes());
                            }
                            Some("element_remove") => {
                                if let Some(id) = msg.get("elementId").and_then(|i| i.as_str()) {
                                    let doc = room_doc.read().await;
                                    sync::remove_element_from_doc(&doc, id);
                                }
                                let _ = room_tx.send(text.into_bytes());
                            }
                            Some("sync_state") => {
                                // Merge incoming elements into Y.Map (upsert, don't replace)
                                if let Some(elements) = msg.get("elements").and_then(|e| e.as_array()) {
                                    let doc = room_doc.read().await;
                                    for el in elements {
                                        if let Some(id) = el.get("id").and_then(|i| i.as_str()) {
                                            if let Ok(json_str) = serde_json::to_string(el) {
                                                sync::store_element(&doc, id, &json_str);
                                            }
                                        }
                                    }
                                }
                                let _ = room_tx.send(text.into_bytes());
                            }
                            _ => {
                                let _ = room_tx.send(text.into_bytes());
                            }
                        }
                    } else {
                        let _ = room_tx.send(text.into_bytes());
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    // Cleanup
    room.remove_user(&user_id).await;
    tracing::info!("User {} left board {}", username, board_id);

    // Broadcast leave event
    let leave_msg = serde_json::json!({
        "type": "leave",
        "userId": user_id.to_string(),
        "users": room.get_users().await,
    });
    let _ = room
        .tx
        .send(serde_json::to_vec(&leave_msg).unwrap_or_default());

    // Save state before closing if room is empty
    if room.user_count().await == 0 {
        let doc = room.doc.read().await;
        let state_bytes = sync::encode_doc_state(&doc);
        if let Err(e) = db::boards::save_yrs_state(&state.pool, board_id, &state_bytes).await {
            tracing::error!("Failed to save board state on room close: {}", e);
        }
        drop(doc);
        state.room_manager.remove_room_if_empty(&board_id).await;
    }
}
