-- Migration: 001_initial_schema
-- Description: Create initial database schema for mailbox API

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Mailboxes table
CREATE TABLE IF NOT EXISTS mailboxes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Emails table
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  is_read INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  folder TEXT DEFAULT 'inbox',
  created_at TEXT NOT NULL,
  received_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (mailbox_id) REFERENCES mailboxes(id)
);

-- Attachments table
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  email_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (email_id) REFERENCES emails(id)
);

-- Labels table
CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#808080',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_system INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Email-Labels junction table
CREATE TABLE IF NOT EXISTS email_labels (
  email_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  PRIMARY KEY (email_id, label_id),
  FOREIGN KEY (email_id) REFERENCES emails(id),
  FOREIGN KEY (label_id) REFERENCES labels(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_mailboxes_user_id ON mailboxes(user_id);
CREATE INDEX IF NOT EXISTS idx_emails_mailbox_id ON emails(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_attachments_email_id ON attachments(email_id);
CREATE INDEX IF NOT EXISTS idx_labels_user_id ON labels(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_email_labels_email_id ON email_labels(email_id);
CREATE INDEX IF NOT EXISTS idx_email_labels_label_id ON email_labels(label_id);
