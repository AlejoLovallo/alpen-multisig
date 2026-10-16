-- The role's signer configuration (SSZ `ThresholdConfig`) when the proposal's latest commit +
-- reveal pair was sent (#605). A rotation of the same role changes the live configuration in the
-- reveal's own block, so the reconcile also verifies a mined reveal against this one.
ALTER TABLE proposals ADD COLUMN broadcast_role_config BYTEA;
