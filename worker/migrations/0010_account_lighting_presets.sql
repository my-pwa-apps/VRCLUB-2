CREATE TABLE account_lighting_presets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    presets TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
