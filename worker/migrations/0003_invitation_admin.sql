ALTER TABLE vr_invitations ADD COLUMN issued_by TEXT;
ALTER TABLE vr_invitations ADD COLUMN label TEXT NOT NULL DEFAULT '';
ALTER TABLE vr_invitations ADD COLUMN revoked_by TEXT;

CREATE TABLE invitation_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hash TEXT NOT NULL REFERENCES vr_invitations(code_hash),
    action TEXT NOT NULL CHECK (action IN ('issued', 'revoked')),
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX invitation_audit_by_code ON invitation_audit(code_hash, id);
