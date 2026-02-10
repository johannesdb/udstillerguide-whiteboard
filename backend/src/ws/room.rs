use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use uuid::Uuid;
use yrs::Doc;

#[derive(Clone)]
pub struct Room {
    pub board_id: Uuid,
    pub doc: Arc<RwLock<Doc>>,
    pub tx: broadcast::Sender<Vec<u8>>,
    pub users: Arc<RwLock<HashMap<Uuid, ConnectedUser>>>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConnectedUser {
    pub user_id: Uuid,
    pub username: String,
    pub color: String,
}

impl Room {
    pub fn new(board_id: Uuid) -> Self {
        let (tx, _) = broadcast::channel(256);
        Room {
            board_id,
            doc: Arc::new(RwLock::new(Doc::new())),
            tx,
            users: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn add_user(&self, user_id: Uuid, username: String) {
        let colors = [
            "#F44336", "#2196F3", "#4CAF50", "#FF9800", "#9C27B0", "#00BCD4", "#E91E63",
            "#3F51B5",
        ];
        let color_idx = self.users.read().await.len() % colors.len();
        let user = ConnectedUser {
            user_id,
            username,
            color: colors[color_idx].to_string(),
        };
        self.users.write().await.insert(user_id, user);
    }

    pub async fn remove_user(&self, user_id: &Uuid) {
        self.users.write().await.remove(user_id);
    }

    pub async fn user_count(&self) -> usize {
        self.users.read().await.len()
    }

    pub async fn get_users(&self) -> Vec<ConnectedUser> {
        self.users.read().await.values().cloned().collect()
    }
}

#[derive(Clone)]
pub struct RoomManager {
    rooms: Arc<RwLock<HashMap<Uuid, Room>>>,
}

impl RoomManager {
    pub fn new() -> Self {
        RoomManager {
            rooms: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get_or_create_room(&self, board_id: Uuid) -> Room {
        let rooms = self.rooms.read().await;
        if let Some(room) = rooms.get(&board_id) {
            return room.clone();
        }
        drop(rooms);

        let mut rooms = self.rooms.write().await;
        // Double-check after acquiring write lock
        if let Some(room) = rooms.get(&board_id) {
            return room.clone();
        }
        let room = Room::new(board_id);
        rooms.insert(board_id, room.clone());
        room
    }

    pub async fn remove_room_if_empty(&self, board_id: &Uuid) {
        let rooms = self.rooms.read().await;
        if let Some(room) = rooms.get(board_id) {
            if room.user_count().await == 0 {
                drop(rooms);
                self.rooms.write().await.remove(board_id);
            }
        }
    }

    pub async fn get_room(&self, board_id: &Uuid) -> Option<Room> {
        self.rooms.read().await.get(board_id).cloned()
    }
}
