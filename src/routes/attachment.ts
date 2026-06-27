import { Hono } from 'hono';
import type { Env, Attachment } from '../types';
import type { ApiResponse } from '../types';
import { authenticate } from '../middleware/auth';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error';

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB

export const attachmentRoutes = new Hono<{ Bindings: Env }>();

// Upload attachment
attachmentRoutes.post('/', authenticate, async (c) => {
  const userPayload = c.get('user');
  const body = await c.req.parseBody();
  const file = body.file;

  if (!file || !(file instanceof File)) {
    throw new BadRequestError('File is required');
  }

  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new BadRequestError('File size exceeds maximum limit of 25MB');
  }

  const attachmentId = crypto.randomUUID();
  const storagePath = `attachments/${userPayload?.sub}/${attachmentId}/${file.name}`;
  const now = new Date().toISOString();

  // Upload to R2
  await c.env.ATTACHMENTS.put(storagePath, file, {
    httpMetadata: {
      contentType: file.type,
    },
  });

  // Save metadata to D1
  await c.env.DB
    .prepare(`
      INSERT INTO attachments (id, email_id, filename, content_type, size, storage_path, created_at)
      VALUES (?, '', ?, ?, ?, ?, ?)
    `)
    .bind(attachmentId, file.name, file.type || 'application/octet-stream', file.size, storagePath, now)
    .run();

  const attachment = await c.env.DB
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .bind(attachmentId)
    .first<Attachment>();

  const response: ApiResponse = {
    success: true,
    data: attachment,
    message: 'Attachment uploaded successfully',
  };

  return c.json(response, 201);
});

// Download attachment
attachmentRoutes.get('/:id', authenticate, async (c) => {
  const userPayload = c.get('user');
  const attachmentId = c.req.param('id');

  const attachment = await c.env.DB
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .bind(attachmentId)
    .first<Attachment>();

  if (!attachment) {
    throw new NotFoundError('Attachment not found');
  }

  // Verify user has access to the email
  const email = await c.env.DB
    .prepare(`
      SELECT e.* FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id = ? AND m.user_id = ?
    `)
    .bind(attachment.email_id, userPayload?.sub)
    .first();

  if (!email) {
    throw new ForbiddenError('Access denied');
  }

  // Get file from R2
  const r2Object = await c.env.ATTACHMENTS.get(attachment.storage_path);

  if (!r2Object) {
    throw new NotFoundError('File not found in storage');
  }

  const content = await r2Object.arrayBuffer();

  return new Response(content, {
    headers: {
      'Content-Type': attachment.content_type,
      'Content-Disposition': `attachment; filename="${attachment.filename}"`,
      'Content-Length': String(content.byteLength),
    },
  });
});

// Delete attachment
attachmentRoutes.delete('/:id', authenticate, async (c) => {
  const userPayload = c.get('user');
  const attachmentId = c.req.param('id');

  const attachment = await c.env.DB
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .bind(attachmentId)
    .first<Attachment>();

  if (!attachment) {
    throw new NotFoundError('Attachment not found');
  }

  // Verify user has access to the email
  const email = await c.env.DB
    .prepare(`
      SELECT e.* FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id = ? AND m.user_id = ?
    `)
    .bind(attachment.email_id, userPayload?.sub)
    .first();

  if (!email) {
    throw new ForbiddenError('Access denied');
  }

  // Delete from R2
  await c.env.ATTACHMENTS.delete(attachment.storage_path);

  // Delete from D1
  await c.env.DB
    .prepare('DELETE FROM attachments WHERE id = ?')
    .bind(attachmentId)
    .run();

  const response: ApiResponse = {
    success: true,
    message: 'Attachment deleted successfully',
  };

  return c.json(response);
});
