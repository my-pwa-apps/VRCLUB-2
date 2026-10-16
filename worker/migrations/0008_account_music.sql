-- Saved music links per account, edited from a phone and read by the headset (an immersive-only headset app has no
-- keyboard and no 2D page to type a link into). One row per account holds the whole list as JSON: it is at most eight
-- short links, always read and written as a unit. Links are the owner's own data, not secrets.
CREATE TABLE account_music (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    items TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
