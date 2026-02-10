CREATE TABLE IF NOT EXISTS board_collaborators (
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'editor',
    invited_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (board_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_collaborators_user ON board_collaborators(user_id);
