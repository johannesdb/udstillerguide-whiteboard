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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_room_add_and_remove_user() {
        let room = Room::new(Uuid::new_v4());
        assert_eq!(room.user_count().await, 0);

        let user_id = Uuid::new_v4();
        room.add_user(user_id, "Alice".to_string()).await;
        assert_eq!(room.user_count().await, 1);

        let users = room.get_users().await;
        assert_eq!(users.len(), 1);
        assert_eq!(users[0].username, "Alice");

        room.remove_user(&user_id).await;
        assert_eq!(room.user_count().await, 0);
    }

    #[tokio::test]
    async fn test_room_user_colors_cycle() {
        let room = Room::new(Uuid::new_v4());
        let mut user_ids = vec![];
        for i in 0..9 {
            let uid = Uuid::new_v4();
            user_ids.push(uid);
            room.add_user(uid, format!("User{}", i)).await;
        }
        let users = room.get_users().await;
        // 9th user should wrap around to color index 0
        let first_color = users.iter().find(|u| u.username == "User0").unwrap().color.clone();
        let ninth_color = users.iter().find(|u| u.username == "User8").unwrap().color.clone();
        assert_eq!(first_color, ninth_color);
    }

    #[tokio::test]
    async fn test_room_broadcast_channel() {
        let room = Room::new(Uuid::new_v4());
        let mut rx = room.tx.subscribe();
        let _ = room.tx.send(b"hello".to_vec());
        let msg = rx.recv().await.unwrap();
        assert_eq!(msg, b"hello");
    }

    #[tokio::test]
    async fn test_room_manager_get_or_create() {
        let manager = RoomManager::new();
        let board_id = Uuid::new_v4();

        assert!(manager.get_room(&board_id).await.is_none());

        let room = manager.get_or_create_room(board_id).await;
        assert_eq!(room.board_id, board_id);

        // Should return same room
        let room2 = manager.get_or_create_room(board_id).await;
        assert_eq!(room2.board_id, board_id);

        assert!(manager.get_room(&board_id).await.is_some());
    }

    #[tokio::test]
    async fn test_room_manager_remove_empty_room() {
        let manager = RoomManager::new();
        let board_id = Uuid::new_v4();

        let room = manager.get_or_create_room(board_id).await;
        let uid = Uuid::new_v4();
        room.add_user(uid, "Test".to_string()).await;

        // Room with users should not be removed
        manager.remove_room_if_empty(&board_id).await;
        assert!(manager.get_room(&board_id).await.is_some());

        // After removing user, room should be removable
        room.remove_user(&uid).await;
        manager.remove_room_if_empty(&board_id).await;
        assert!(manager.get_room(&board_id).await.is_none());
    }

    #[tokio::test]
    async fn test_room_manager_multiple_boards() {
        let manager = RoomManager::new();
        let board1 = Uuid::new_v4();
        let board2 = Uuid::new_v4();

        manager.get_or_create_room(board1).await;
        manager.get_or_create_room(board2).await;

        assert!(manager.get_room(&board1).await.is_some());
        assert!(manager.get_room(&board2).await.is_some());

        // Removing one should not affect the other
        manager.remove_room_if_empty(&board1).await;
        assert!(manager.get_room(&board1).await.is_none());
        assert!(manager.get_room(&board2).await.is_some());
    }
}
