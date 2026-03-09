-- Migration: Add assisted_by fields for collaborative repair tracking
-- Date: 2026-02-07

-- Add assisted_by_ids column (JSON array of helper technician user IDs)
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS assisted_by_ids TEXT DEFAULT '[]';

-- Add assisted_by_names column (comma-separated names for display)
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS assisted_by_names TEXT;

-- Comment for documentation
COMMENT ON COLUMN job_tickets.assisted_by_ids IS 'JSON array of user IDs who assisted with this repair';
COMMENT ON COLUMN job_tickets.assisted_by_names IS 'Comma-separated display names of assisting technicians';
