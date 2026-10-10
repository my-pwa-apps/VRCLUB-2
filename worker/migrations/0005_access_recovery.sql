ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE vr_invitations ADD COLUMN user_id INTEGER REFERENCES users(id);
CREATE INDEX invitations_user_access ON vr_invitations(user_id, revoked_at);

CREATE TABLE access_devices (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    slot INTEGER NOT NULL CHECK (slot IN (1, 2)),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    revoked_at INTEGER
);
CREATE UNIQUE INDEX access_device_slots ON access_devices(user_id, slot) WHERE revoked_at IS NULL;

CREATE TABLE access_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    device_id TEXT REFERENCES access_devices(id),
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
);
CREATE INDEX access_sessions_user ON access_sessions(user_id);

CREATE TABLE access_challenges (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    legacy_subject TEXT,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_session TEXT
);

CREATE TABLE access_rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE access_vr_leases (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    token_hash TEXT NOT NULL,
    tab TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE access_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    device_id TEXT,
    created_at INTEGER NOT NULL
);
