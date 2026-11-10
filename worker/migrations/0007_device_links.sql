-- Headset pairing (an OAuth-style device code): a headset with no keyboard asks for a short code, the owner approves
-- it on a phone where they are verified, and the headset then collects its own device session. Only hashes are stored.
CREATE TABLE access_device_links (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    secret_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'consumed')),
    user_id INTEGER REFERENCES users(id),
    device_id TEXT REFERENCES access_devices(id),
    session_hash TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE INDEX access_device_links_expiry ON access_device_links(expires_at);
