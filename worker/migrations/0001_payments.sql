CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
    checkout_session_id TEXT PRIMARY KEY,
    payment_intent_id TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('paid', 'revoked')),
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS purchases_user_status
    ON purchases(user_id, status);
