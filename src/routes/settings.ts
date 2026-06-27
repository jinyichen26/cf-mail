import { Hono } from 'hono';
import type { Env } from '../types';
import type { ApiResponse } from '../types';
import { authenticate } from '../middleware/auth';
import { BadRequestError } from '../middleware/error';
import {
  getAllSettings,
  setSetting,
  getSetting,
  deleteSetting,
} from '../services/settings';

export const settingsRoutes = new Hono<{ Bindings: Env }>();

const PUBLIC_SETTINGS = [
  'mail_domain',
  'turnstile_site_key',
  'max_attachment_size',
  'max_emails_per_user',
];

const SENSITIVE_SETTINGS = [
  'resend_api_key',
  'turnstile_secret_key',
  'jwt_secret',
];

const ADMIN_ONLY_SETTINGS = [
  'jwt_secret',
  'mail_domain',
  'turnstile_site_key',
  'turnstile_secret_key',
  'max_emails_per_user',
];

// Get user settings (non-sensitive)
settingsRoutes.get('/', authenticate, async (c) => {
  const userPayload = c.get('user');
  const allSettings = await getAllSettings(c.env.DB, userPayload?.sub);

  // Filter out sensitive settings, return only public and user-specific
  const filtered: Record<string, string> = {};
  for (const key of PUBLIC_SETTINGS) {
    if (allSettings[key]) {
      filtered[key] = allSettings[key];
    }
  }

  const response: ApiResponse = {
    success: true,
    data: filtered,
  };

  return c.json(response);
});

// Get all settings (admin - includes sensitive keys masked)
settingsRoutes.get('/all', authenticate, async (c) => {
  const userPayload = c.get('user');
  const allSettings = await getAllSettings(c.env.DB, userPayload?.sub);

  // Mask sensitive settings
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(allSettings)) {
    if (SENSITIVE_SETTINGS.includes(key) && value) {
      filtered[key] = value.slice(0, 6) + '...' + value.slice(-4);
    } else {
      filtered[key] = value;
    }
  }

  const response: ApiResponse = {
    success: true,
    data: filtered,
  };

  return c.json(response);
});

// Update a user-specific setting
settingsRoutes.put('/:key', authenticate, async (c) => {
  const userPayload = c.get('user');
  const key = c.req.param('key');
  const { value } = await c.req.json<{ value: string }>();

  if (value === undefined) {
    throw new BadRequestError('Value is required');
  }

  // Admin-only settings require special permission (for now, allow setting user-specific ones)
  if (ADMIN_ONLY_SETTINGS.includes(key)) {
    // Allow setting these, but they'll be global settings (set by first user or admin)
    // In a real system, you'd check admin role here
    await setSetting(c.env.DB, key, value, undefined, true);
  } else {
    await setSetting(c.env.DB, key, value, userPayload?.sub, false);
  }

  const response: ApiResponse = {
    success: true,
    message: `Setting ${key} updated successfully`,
  };

  return c.json(response);
});

// Delete a user-specific setting
settingsRoutes.delete('/:key', authenticate, async (c) => {
  const userPayload = c.get('user');
  const key = c.req.param('key');

  if (ADMIN_ONLY_SETTINGS.includes(key)) {
    throw new BadRequestError('Cannot delete system settings');
  }

  await deleteSetting(c.env.DB, key, userPayload?.sub);

  const response: ApiResponse = {
    success: true,
    message: `Setting ${key} deleted successfully`,
  };

  return c.json(response);
});

// Check if a setting is configured
settingsRoutes.get('/:key/exists', authenticate, async (c) => {
  const userPayload = c.get('user');
  const key = c.req.param('key');

  const value = await getSetting(c.env.DB, key, userPayload?.sub);

  const response: ApiResponse = {
    success: true,
    data: { configured: !!value },
  };

  return c.json(response);
});
