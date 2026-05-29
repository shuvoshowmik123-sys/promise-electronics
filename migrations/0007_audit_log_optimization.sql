-- Migration 0007: Audit log indexes + optimization
-- 2026-05-28
-- Safe to re-run: all IF NOT EXISTS

-- Composite index: user lookups (most common — "what did user X do?")
CREATE INDEX IF NOT EXISTS idx_audit_user_time
    ON audit_logs(user_id, created_at DESC);

-- Composite index: action filtering ("show all LOGIN_FAILED events")
CREATE INDEX IF NOT EXISTS idx_audit_action_time
    ON audit_logs(action, created_at DESC);

-- Composite index: entity filtering ("show all JobTicket changes")
CREATE INDEX IF NOT EXISTS idx_audit_entity_time
    ON audit_logs(entity, created_at DESC);

-- Partial index: security events only (warning/critical) — fast forever regardless of table size
CREATE INDEX IF NOT EXISTS idx_audit_severity_security
    ON audit_logs(severity, created_at DESC)
    WHERE severity != 'info';

-- Retention: prune info rows older than 180 days automatically via pg scheduled job
-- (application-level cron in nightly-jobs.service.ts handles this — no pg_cron dependency)
