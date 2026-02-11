use anyhow::Result;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub password_hash: Option<String>,
    pub google_id: Option<String>,
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, serde::Serialize)]
pub struct UserPublic {
    pub id: Uuid,
    pub username: String,
    pub email: String,
}

impl From<User> for UserPublic {
    fn from(u: User) -> Self {
        UserPublic {
            id: u.id,
            username: u.username,
            email: u.email,
        }
    }
}

pub async fn create_user(
    pool: &PgPool,
    username: &str,
    email: &str,
    password_hash: &str,
) -> Result<User> {
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(username)
    .bind(email)
    .bind(password_hash)
    .fetch_one(pool)
    .await?;
    Ok(user)
}

pub async fn find_by_username(pool: &PgPool, username: &str) -> Result<Option<User>> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE username = $1")
        .bind(username)
        .fetch_optional(pool)
        .await?;
    Ok(user)
}

pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<User>> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(email)
        .fetch_optional(pool)
        .await?;
    Ok(user)
}

pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(user)
}

pub async fn find_by_google_id(pool: &PgPool, google_id: &str) -> Result<Option<User>> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE google_id = $1")
        .bind(google_id)
        .fetch_optional(pool)
        .await?;
    Ok(user)
}

pub async fn create_google_user(
    pool: &PgPool,
    username: &str,
    email: &str,
    google_id: &str,
) -> Result<User> {
    let user = sqlx::query_as::<_, User>(
        "INSERT INTO users (username, email, google_id) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(username)
    .bind(email)
    .bind(google_id)
    .fetch_one(pool)
    .await?;
    Ok(user)
}

pub async fn link_google_account(pool: &PgPool, user_id: Uuid, google_id: &str) -> Result<User> {
    let user = sqlx::query_as::<_, User>(
        "UPDATE users SET google_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    )
    .bind(google_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(user)
}
