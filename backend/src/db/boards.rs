use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct Board {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Uuid,
    pub yrs_state: Option<Vec<u8>>,
    pub thumbnail: Option<Vec<u8>>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, serde::Serialize)]
pub struct BoardSummary {
    pub id: Uuid,
    pub name: String,
    pub owner_id: Uuid,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<Board> for BoardSummary {
    fn from(b: Board) -> Self {
        BoardSummary {
            id: b.id,
            name: b.name,
            owner_id: b.owner_id,
            created_at: b.created_at,
            updated_at: b.updated_at,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct BoardCollaborator {
    pub board_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub invited_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct ShareLink {
    pub id: Uuid,
    pub board_id: Uuid,
    pub token: String,
    pub role: String,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn create_board(pool: &PgPool, name: &str, owner_id: Uuid) -> Result<Board> {
    let board = sqlx::query_as::<_, Board>(
        "INSERT INTO boards (name, owner_id) VALUES ($1, $2) RETURNING *",
    )
    .bind(name)
    .bind(owner_id)
    .fetch_one(pool)
    .await?;
    Ok(board)
}

pub async fn get_board(pool: &PgPool, board_id: Uuid) -> Result<Option<Board>> {
    let board = sqlx::query_as::<_, Board>("SELECT * FROM boards WHERE id = $1")
        .bind(board_id)
        .fetch_optional(pool)
        .await?;
    Ok(board)
}

pub async fn list_boards_for_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Board>> {
    let boards = sqlx::query_as::<_, Board>(
        "SELECT b.* FROM boards b
         WHERE b.owner_id = $1
         UNION
         SELECT b.* FROM boards b
         JOIN board_collaborators bc ON bc.board_id = b.id
         WHERE bc.user_id = $1
         ORDER BY updated_at DESC",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(boards)
}

pub async fn update_board_name(
    pool: &PgPool,
    board_id: Uuid,
    name: &str,
) -> Result<Option<Board>> {
    let board = sqlx::query_as::<_, Board>(
        "UPDATE boards SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    )
    .bind(name)
    .bind(board_id)
    .fetch_optional(pool)
    .await?;
    Ok(board)
}

pub async fn delete_board(pool: &PgPool, board_id: Uuid) -> Result<bool> {
    let result = sqlx::query("DELETE FROM boards WHERE id = $1")
        .bind(board_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn save_yrs_state(pool: &PgPool, board_id: Uuid, state: &[u8]) -> Result<()> {
    sqlx::query("UPDATE boards SET yrs_state = $1, updated_at = NOW() WHERE id = $2")
        .bind(state)
        .bind(board_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn add_collaborator(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
    role: &str,
) -> Result<BoardCollaborator> {
    let collab = sqlx::query_as::<_, BoardCollaborator>(
        "INSERT INTO board_collaborators (board_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (board_id, user_id) DO UPDATE SET role = $3
         RETURNING *",
    )
    .bind(board_id)
    .bind(user_id)
    .bind(role)
    .fetch_one(pool)
    .await?;
    Ok(collab)
}

pub async fn remove_collaborator(pool: &PgPool, board_id: Uuid, user_id: Uuid) -> Result<bool> {
    let result =
        sqlx::query("DELETE FROM board_collaborators WHERE board_id = $1 AND user_id = $2")
            .bind(board_id)
            .bind(user_id)
            .execute(pool)
            .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_collaborators(pool: &PgPool, board_id: Uuid) -> Result<Vec<BoardCollaborator>> {
    let collabs = sqlx::query_as::<_, BoardCollaborator>(
        "SELECT * FROM board_collaborators WHERE board_id = $1",
    )
    .bind(board_id)
    .fetch_all(pool)
    .await?;
    Ok(collabs)
}

pub async fn user_has_access(
    pool: &PgPool,
    board_id: Uuid,
    user_id: Uuid,
) -> Result<Option<String>> {
    // Check if owner
    let board = sqlx::query_as::<_, Board>("SELECT * FROM boards WHERE id = $1 AND owner_id = $2")
        .bind(board_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    if board.is_some() {
        return Ok(Some("owner".to_string()));
    }
    // Check collaborator role
    let collab = sqlx::query_as::<_, BoardCollaborator>(
        "SELECT * FROM board_collaborators WHERE board_id = $1 AND user_id = $2",
    )
    .bind(board_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(collab.map(|c| c.role))
}

pub async fn create_share_link(
    pool: &PgPool,
    board_id: Uuid,
    token: &str,
    role: &str,
    expires_at: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<ShareLink> {
    let link = sqlx::query_as::<_, ShareLink>(
        "INSERT INTO share_links (board_id, token, role, expires_at) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(board_id)
    .bind(token)
    .bind(role)
    .bind(expires_at)
    .fetch_one(pool)
    .await?;
    Ok(link)
}

pub async fn get_share_link_by_token(pool: &PgPool, token: &str) -> Result<Option<ShareLink>> {
    let link = sqlx::query_as::<_, ShareLink>(
        "SELECT * FROM share_links WHERE token = $1 AND (expires_at IS NULL OR expires_at > NOW())",
    )
    .bind(token)
    .fetch_optional(pool)
    .await?;
    Ok(link)
}

pub async fn delete_share_link(pool: &PgPool, link_id: Uuid) -> Result<bool> {
    let result = sqlx::query("DELETE FROM share_links WHERE id = $1")
        .bind(link_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn get_share_links_for_board(pool: &PgPool, board_id: Uuid) -> Result<Vec<ShareLink>> {
    let links = sqlx::query_as::<_, ShareLink>("SELECT * FROM share_links WHERE board_id = $1")
        .bind(board_id)
        .fetch_all(pool)
        .await?;
    Ok(links)
}
