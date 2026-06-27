import { Hono } from 'hono';
import type { Env, Label } from '../types';
import type { ApiResponse } from '../types';
import { authenticate } from '../middleware/auth';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error';

export const labelRoutes = new Hono<{ Bindings: Env }>();

// Get all labels
labelRoutes.get('/', authenticate, async (c) => {
  const userPayload = c.get('user');

  const labels = await c.env.DB
    .prepare('SELECT * FROM labels WHERE user_id = ? ORDER BY name ASC')
    .bind(userPayload?.sub)
    .all<Label>();

  const response: ApiResponse = {
    success: true,
    data: labels.results,
  };

  return c.json(response);
});

// Create label
labelRoutes.post('/', authenticate, async (c) => {
  const userPayload = c.get('user');
  const { name, color } = await c.req.json<{ name: string; color?: string }>();

  if (!name) {
    throw new BadRequestError('Label name is required');
  }

  const labelId = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB
    .prepare(`
      INSERT INTO labels (id, user_id, name, color, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .bind(labelId, userPayload?.sub, name, color || '#808080', now)
    .run();

  const label = await c.env.DB
    .prepare('SELECT * FROM labels WHERE id = ?')
    .bind(labelId)
    .first<Label>();

  const response: ApiResponse = {
    success: true,
    data: label,
    message: 'Label created successfully',
  };

  return c.json(response, 201);
});

// Update label
labelRoutes.patch('/:id', authenticate, async (c) => {
  const userPayload = c.get('user');
  const labelId = c.req.param('id');
  const { name, color } = await c.req.json<{ name?: string; color?: string }>();

  const label = await c.env.DB
    .prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?')
    .bind(labelId, userPayload?.sub)
    .first<Label>();

  if (!label) {
    throw new NotFoundError('Label not found');
  }

  await c.env.DB
    .prepare('UPDATE labels SET name = ?, color = ? WHERE id = ?')
    .bind(name || label.name, color || label.color, labelId)
    .run();

  const updatedLabel = await c.env.DB
    .prepare('SELECT * FROM labels WHERE id = ?')
    .bind(labelId)
    .first<Label>();

  const response: ApiResponse = {
    success: true,
    data: updatedLabel,
    message: 'Label updated successfully',
  };

  return c.json(response);
});

// Delete label
labelRoutes.delete('/:id', authenticate, async (c) => {
  const userPayload = c.get('user');
  const labelId = c.req.param('id');

  const label = await c.env.DB
    .prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?')
    .bind(labelId, userPayload?.sub)
    .first<Label>();

  if (!label) {
    throw new NotFoundError('Label not found');
  }

  // Remove label from all emails
  await c.env.DB
    .prepare('DELETE FROM email_labels WHERE label_id = ?')
    .bind(labelId)
    .run();

  // Delete label
  await c.env.DB
    .prepare('DELETE FROM labels WHERE id = ?')
    .bind(labelId)
    .run();

  const response: ApiResponse = {
    success: true,
    message: 'Label deleted successfully',
  };

  return c.json(response);
});

// Add label to email
labelRoutes.post('/:emailId/labels', authenticate, async (c) => {
  const userPayload = c.get('user');
  const emailId = c.req.param('emailId');
  const { labelId } = await c.req.json<{ labelId: string }>();

  if (!labelId) {
    throw new BadRequestError('Label ID is required');
  }

  // Verify email belongs to user
  const email = await c.env.DB
    .prepare(`
      SELECT e.* FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id = ? AND m.user_id = ?
    `)
    .bind(emailId, userPayload?.sub)
    .first();

  if (!email) {
    throw new NotFoundError('Email not found');
  }

  // Verify label belongs to user
  const label = await c.env.DB
    .prepare('SELECT * FROM labels WHERE id = ? AND user_id = ?')
    .bind(labelId, userPayload?.sub)
    .first();

  if (!label) {
    throw new NotFoundError('Label not found');
  }

  await c.env.DB
    .prepare('INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)')
    .bind(emailId, labelId)
    .run();

  const response: ApiResponse = {
    success: true,
    message: 'Label added to email',
  };

  return c.json(response);
});

// Remove label from email
labelRoutes.delete('/:emailId/labels/:labelId', authenticate, async (c) => {
  const userPayload = c.get('user');
  const emailId = c.req.param('emailId');
  const labelId = c.req.param('labelId');

  // Verify email belongs to user
  const email = await c.env.DB
    .prepare(`
      SELECT e.* FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id = ? AND m.user_id = ?
    `)
    .bind(emailId, userPayload?.sub)
    .first();

  if (!email) {
    throw new NotFoundError('Email not found');
  }

  await c.env.DB
    .prepare('DELETE FROM email_labels WHERE email_id = ? AND label_id = ?')
    .bind(emailId, labelId)
    .run();

  const response: ApiResponse = {
    success: true,
    message: 'Label removed from email',
  };

  return c.json(response);
});

// Export label routes
export { labelRoutes };
