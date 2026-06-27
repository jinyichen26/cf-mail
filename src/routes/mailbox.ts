import { Hono } from 'hono';
import type { Env, Mailbox } from '../types';
import type { ApiResponse } from '../types';
import { authenticate } from '../middleware/auth';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error';

export const mailboxRoutes = new Hono<{ Bindings: Env }>();

// Get all mailboxes for current user
mailboxRoutes.get('/', authenticate, async (c) => {
  const userPayload = c.get('user');

  const mailboxes = await c.env.DB
    .prepare('SELECT * FROM mailboxes WHERE user_id = ? ORDER BY is_default DESC, created_at ASC')
    .bind(userPayload?.sub)
    .all<Mailbox>();

  const response: ApiResponse = {
    success: true,
    data: mailboxes.results,
  };

  return c.json(response);
});

// Create a new mailbox
mailboxRoutes.post('/', authenticate, async (c) => {
  const userPayload = c.get('user');
  const { username } = await c.req.json<{ username: string }>();

  if (!username) {
    throw new BadRequestError('Username is required');
  }

  // Validate username format
  const usernameRegex = /^[a-zA-Z0-9._-]+$/;
  if (!usernameRegex.test(username)) {
    throw new BadRequestError('Invalid username format');
  }

  const mailDomain = c.env.MAIL_DOMAIN || 'mail.example.com';
  const email = `${username}@${mailDomain}`;
  const mailboxId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await c.env.DB
      .prepare(`
        INSERT INTO mailboxes (id, user_id, email, is_default, created_at)
        VALUES (?, ?, ?, 0, ?)
      `)
      .bind(mailboxId, userPayload?.sub, email, now)
      .run();

    const mailbox = await c.env.DB
      .prepare('SELECT * FROM mailboxes WHERE id = ?')
      .bind(mailboxId)
      .first<Mailbox>();

    const response: ApiResponse = {
      success: true,
      data: mailbox,
      message: 'Mailbox created successfully',
    };

    return c.json(response, 201);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new BadRequestError('This mailbox already exists');
    }
    throw error;
  }
});

// Delete a mailbox
mailboxRoutes.delete('/:id', authenticate, async (c) => {
  const userPayload = c.get('user');
  const mailboxId = c.req.param('id');

  const mailbox = await c.env.DB
    .prepare('SELECT * FROM mailboxes WHERE id = ? AND user_id = ?')
    .bind(mailboxId, userPayload?.sub)
    .first<Mailbox>();

  if (!mailbox) {
    throw new NotFoundError('Mailbox not found');
  }

  if (mailbox.is_default) {
    throw new ForbiddenError('Cannot delete default mailbox');
  }

  // Delete associated emails and attachments
  const emails = await c.env.DB
    .prepare('SELECT id FROM emails WHERE mailbox_id = ?')
    .bind(mailboxId)
    .all<{ id: string }>();

  for (const email of emails.results) {
    // Delete attachments from R2
    const attachments = await c.env.DB
      .prepare('SELECT storage_path FROM attachments WHERE email_id = ?')
      .bind(email.id)
      .all<{ storage_path: string }>();

    for (const attachment of attachments.results) {
      await c.env.ATTACHMENTS.delete(attachment.storage_path);
    }

    // Delete attachments from D1
    await c.env.DB.prepare('DELETE FROM attachments WHERE email_id = ?').bind(email.id).run();

    // Delete email labels
    await c.env.DB.prepare('DELETE FROM email_labels WHERE email_id = ?').bind(email.id).run();
  }

  // Delete emails
  await c.env.DB.prepare('DELETE FROM emails WHERE mailbox_id = ?').bind(mailboxId).run();

  // Delete mailbox
  await c.env.DB.prepare('DELETE FROM mailboxes WHERE id = ?').bind(mailboxId).run();

  const response: ApiResponse = {
    success: true,
    message: 'Mailbox deleted successfully',
  };

  return c.json(response);
});
