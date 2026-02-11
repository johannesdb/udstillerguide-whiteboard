use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct BoardImage {
    pub id: Uuid,
    pub board_id: Uuid,
    pub uploader_id: Uuid,
    pub filename: Option<String>,
    pub content_type: String,
    pub data: Vec<u8>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn save_image(
    pool: &PgPool,
    board_id: Uuid,
    uploader_id: Uuid,
    filename: &str,
    content_type: &str,
    data: &[u8],
    width: Option<i32>,
    height: Option<i32>,
) -> Result<BoardImage> {
    let image = sqlx::query_as::<_, BoardImage>(
        "INSERT INTO board_images (board_id, uploader_id, filename, content_type, data, width, height)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *",
    )
    .bind(board_id)
    .bind(uploader_id)
    .bind(filename)
    .bind(content_type)
    .bind(data)
    .bind(width)
    .bind(height)
    .fetch_one(pool)
    .await?;
    Ok(image)
}

pub async fn get_image(pool: &PgPool, image_id: Uuid) -> Result<Option<BoardImage>> {
    let image = sqlx::query_as::<_, BoardImage>("SELECT * FROM board_images WHERE id = $1")
        .bind(image_id)
        .fetch_optional(pool)
        .await?;
    Ok(image)
}
