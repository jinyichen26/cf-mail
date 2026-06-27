export interface Env {
  DB: D1Database;
  ATTACHMENTS: R2Bucket;
  CACHE: KVNamespace;
  MAIL_DOMAIN: string;
  TURNSTILE_SITE_KEY: string;
  RESEND_API_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  JWT_SECRET: string;
}

export interface User {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Mailbox {
  id: string;
  user_id: string;
  email: string;
  is_default: boolean;
  created_at: string;
}

export interface Email {
  id: string;
  mailbox_id: string;
  from_address: string;
  to_address: string;
  subject: string;
  body_text: string;
  body_html: string;
  is_read: boolean;
  is_starred: boolean;
  folder: string;
  created_at: string;
  received_at: string;
  deleted_at?: string;
}

export interface Attachment {
  id: string;
  email_id: string;
  filename: string;
  content_type: string;
  size: number;
  storage_path: string;
  created_at: string;
}

export interface Label {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Folder {
  id: string;
  user_id: string;
  name: string;
  is_system: boolean;
  created_at: string;
}

export interface EmailLabel {
  email_id: string;
  label_id: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface EmailFilters {
  folder?: string;
  label_id?: string;
  is_read?: boolean;
  is_starred?: boolean;
  search?: string;
  sort?: 'asc' | 'desc';
}
