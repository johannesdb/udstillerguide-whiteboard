pub mod boards;
pub mod images;
pub mod users;

use anyhow::Result;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;
    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> Result<()> {
    sqlx::raw_sql(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username VARCHAR(100) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS boards (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            yrs_state BYTEA,
            thumbnail BYTEA,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS board_collaborators (
            board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role VARCHAR(20) NOT NULL DEFAULT 'editor',
            invited_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (board_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS share_links (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
            token VARCHAR(64) UNIQUE NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'editor',
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS board_images (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
            uploader_id UUID NOT NULL REFERENCES users(id),
            filename VARCHAR(255),
            content_type VARCHAR(100) NOT NULL DEFAULT 'image/png',
            data BYTEA NOT NULL,
            width INTEGER,
            height INTEGER,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_boards_owner ON boards(owner_id);
        CREATE INDEX IF NOT EXISTS idx_collaborators_user ON board_collaborators(user_id);
        CREATE INDEX IF NOT EXISTS idx_share_links_token ON share_links(token);
        CREATE INDEX IF NOT EXISTS idx_board_images_board ON board_images(board_id);

        -- Error log table
        CREATE TABLE IF NOT EXISTS error_log (
            id SERIAL PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            source VARCHAR(20) NOT NULL CHECK (source IN ('frontend', 'backend', 'websocket')),
            error_type VARCHAR(50) NOT NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'error' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
            message TEXT NOT NULL,
            stack_trace TEXT,
            context JSONB DEFAULT '{}',
            url VARCHAR(500),
            user_agent VARCHAR(500),
            user_id UUID REFERENCES users(id),
            board_id UUID REFERENCES boards(id),
            resolved BOOLEAN NOT NULL DEFAULT FALSE,
            bead_id VARCHAR(50),
            resolved_at TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_error_log_resolved ON error_log(resolved, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_error_log_severity ON error_log(severity, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_error_log_source ON error_log(source, created_at DESC);

        -- Google OAuth: add google_id column and make password_hash nullable
        ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
        ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
        "#,
    )
    .execute(pool)
    .await?;

    tracing::info!("Database migrations completed");
    Ok(())
}
