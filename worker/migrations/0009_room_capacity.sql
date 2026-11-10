CREATE TABLE public_rooms_expanded (
    room TEXT PRIMARY KEY,
    people INTEGER NOT NULL CHECK (people BETWEEN 0 AND 32),
    locked INTEGER NOT NULL CHECK (locked IN (0, 1)),
    expires_at INTEGER NOT NULL
);
INSERT INTO public_rooms_expanded (room, people, locked, expires_at)
    SELECT room, people, locked, expires_at FROM public_rooms;
DROP TABLE public_rooms;
ALTER TABLE public_rooms_expanded RENAME TO public_rooms;
CREATE INDEX public_rooms_expiry ON public_rooms(expires_at);
