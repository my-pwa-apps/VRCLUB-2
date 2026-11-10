CREATE TABLE IF NOT EXISTS vr_invitations (
    code_hash TEXT PRIMARY KEY CHECK (length(code_hash) = 64),
    created_at TEXT NOT NULL,
    redeemed_by TEXT UNIQUE,
    redeemed_at TEXT,
    revoked_at TEXT,
    CHECK ((redeemed_by IS NULL) = (redeemed_at IS NULL))
);
