CREATE TABLE public_rooms (
    room TEXT PRIMARY KEY,
    people INTEGER NOT NULL CHECK (people BETWEEN 0 AND 8),
    locked INTEGER NOT NULL CHECK (locked IN (0, 1)),
    expires_at INTEGER NOT NULL
);
CREATE INDEX public_rooms_expiry ON public_rooms(expires_at);
CREATE TABLE room_directory_limits (
    key TEXT PRIMARY KEY,
    requests INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
