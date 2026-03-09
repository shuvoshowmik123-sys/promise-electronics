-- Migration 0003_corporate_notifications.sql
-- Add corporate-specific fields to notifications table
-- Extend notifications table for corporate context

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS corporate_client_id TEXT REFERENCES corporate_clients(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS job_id TEXT REFERENCES job_tickets(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS context_type TEXT DEFAULT 'corporate';

-- Add index for faster corporate notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_corporate_client ON notifications(corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_context_type ON notifications(context_type);
CREATE INDEX IF NOT EXISTS idx_notifications_job_id ON notifications(job_id);

-- Create corporate_messages and corporate_message_threads tables
CREATE TABLE IF NOT EXISTS corporate_message_threads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id),
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'open', -- 'open', 'resolved', 'closed'
  last_message_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corporate_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id),
  admin_user_id TEXT REFERENCES users(id),
  thread_id TEXT REFERENCES corporate_message_threads(id),
  message TEXT NOT NULL,
  sender_type TEXT NOT NULL, -- 'corporate_user', 'admin'
  sender_id TEXT NOT NULL, -- user_id or admin_user_id
  read_by_admin BOOLEAN DEFAULT FALSE,
  read_by_corporate BOOLEAN DEFAULT FALSE,
  attachments JSONB, -- [{filename, url, type, size}]
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for message tables
CREATE INDEX IF NOT EXISTS idx_corporate_messages_thread ON corporate_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_corporate_messages_client ON corporate_messages(corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_corporate_messages_sender ON corporate_messages(sender_type, sender_id);
CREATE INDEX IF NOT EXISTS idx_corporate_message_threads_client ON corporate_message_threads(corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_corporate_message_threads_status ON corporate_message_threads(status);