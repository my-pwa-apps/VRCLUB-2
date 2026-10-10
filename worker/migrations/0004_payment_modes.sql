-- Existing purchases came from the test rollout. Invitations are mode-independent.
ALTER TABLE purchases ADD COLUMN livemode INTEGER NOT NULL DEFAULT 0 CHECK (livemode IN (0, 1));
CREATE INDEX IF NOT EXISTS purchases_user_mode_status ON purchases(user_id, livemode, status);
