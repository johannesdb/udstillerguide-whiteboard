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

-- Dedup view: gruppér identiske fejl
CREATE OR REPLACE VIEW error_log_grouped AS
SELECT
    error_type,
    message,
    source,
    severity,
    COUNT(*) as occurrence_count,
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen,
    bool_or(resolved) as any_resolved,
    array_agg(DISTINCT id ORDER BY id DESC) as error_ids
FROM error_log
GROUP BY error_type, message, source, severity;
