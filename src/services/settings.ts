import type { D1Database } from '@cloudflare/workers-types';

export interface AppSettings {
  resend_api_key?: string;
  turnstile_secret_key?: string;
  turnstile_site_key?: string;
  jwt_secret?: string;
  mail_domain?: string;
  max_attachment_size?: number;
  max_emails_per_user?: number;
}

const DEFAULT_SETTINGS: Partial<AppSettings> = {
  max_attachment_size: 25 * 1024 * 1024,
  max_emails_per_user: 10000,
};

export async function getSetting(
  db: D1Database,
  key: string,
  userId?: string
): Promise<string | null> {
  let query: D1PreparedStatement;
  let bindings: string[] = [];

  if (userId) {
    query = db.prepare(`
      SELECT value FROM settings
      WHERE (key = ? AND user_id = ?) OR (key = ? AND is_global = 1)
      ORDER BY is_global ASC
      LIMIT 1
    `);
    bindings = [key, userId, key];
  } else {
    query = db.prepare(`
      SELECT value FROM settings
      WHERE key = ? AND is_global = 1
      LIMIT 1
    `);
    bindings = [key];
  }

  const result = await query.bind(...bindings).first<{ value: string }>();
  return result?.value || null;
}

export async function setSetting(
  db: D1Database,
  key: string,
  value: string,
  userId?: string,
  isGlobal: boolean = false
): Promise<void> {
  const now = new Date().toISOString();
  const id = userId ? `${userId}:${key}` : `global:${key}`;

  await db
    .prepare(`
      INSERT INTO settings (id, user_id, key, value, is_global, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `)
    .bind(id, userId || null, key, value, isGlobal ? 1 : 0, now, now)
    .run();
}

export async function deleteSetting(
  db: D1Database,
  key: string,
  userId?: string
): Promise<void> {
  if (userId) {
    await db
      .prepare('DELETE FROM settings WHERE key = ? AND user_id = ?')
      .bind(key, userId)
      .run();
  } else {
    await db
      .prepare('DELETE FROM settings WHERE key = ? AND is_global = 1')
      .bind(key)
      .run();
  }
}

export async function getAllSettings(
  db: D1Database,
  userId?: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  // Get global settings first
  const globalSettings = await db
    .prepare('SELECT key, value FROM settings WHERE is_global = 1')
    .all<{ key: string; value: string }>();

  for (const setting of globalSettings.results) {
    result[setting.key] = setting.value;
  }

  // Override with user-specific settings
  if (userId) {
    const userSettings = await db
      .prepare('SELECT key, value FROM settings WHERE user_id = ?')
      .bind(userId)
      .all<{ key: string; value: string }>();

    for (const setting of userSettings.results) {
      result[setting.key] = setting.value;
    }
  }

  return result;
}

export async function getResendApiKey(db: D1Database, userId?: string): Promise<string | null> {
  return getSetting(db, 'resend_api_key', userId);
}

export async function getTurnstileSecret(db: D1Database, userId?: string): Promise<string | null> {
  return getSetting(db, 'turnstile_secret_key', userId);
}

export async function getTurnstileSiteKey(db: D1Database, userId?: string): Promise<string | null> {
  return getSetting(db, 'turnstile_site_key', userId);
}

export async function getJwtSecret(db: D1Database): Promise<string | null> {
  return getSetting(db, 'jwt_secret');
}

export async function getMailDomain(db: D1Database): Promise<string | null> {
  return getSetting(db, 'mail_domain');
}

export function getDefaultSettings(): Partial<AppSettings> {
  return { ...DEFAULT_SETTINGS };
}
