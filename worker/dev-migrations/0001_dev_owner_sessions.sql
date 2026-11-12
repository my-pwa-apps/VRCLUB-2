CREATE TABLE IF NOT EXISTS dev_owner_sessions (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS dev_owner_sessions_expiry ON dev_owner_sessions(expires_at);
