import { Hono } from 'hono';
import { Resend } from 'resend';
import type { Env, Email, Attachment } from '../types';
import type { ApiResponse, EmailFilters, PaginationParams } from '../types';
import { authenticate } from '../middleware/auth';
import { turnstileVerify } from '../middleware/turnstile';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error';
import { getResendApiKey } from '../services/settings';

export const mailRoutes = new Hono<{ Bindings: Env }>();

// Get email list
mailRoutes.get('/', authenticate, async (c) => {
  const userPayload = c.get('user');
  const query = c.req.query();

  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const folder = query.folder as string;
  const labelId = query.label_id as string;
  const isRead = query.is_read;
  const isStarred = query.is_starred;
  const search = query.search as string;
  const sort = (query.sort as 'asc' | 'desc') || 'desc';

  // Build query
  let sql = `
    SELECT DISTINCT e.* FROM emails e
    INNER JOIN mailboxes m ON e.mailbox_id = m.id
    WHERE m.user_id = ? AND e.deleted_at IS NULL
  `;
  const bindings: (string | number)[] = [userPayload?.sub as string];

  if (folder) {
    sql += ' AND e.folder = ?';
    bindings.push(folder);
  }

  if (isRead !== undefined) {
    sql += ' AND e.is_read = ?';
    bindings.push(isRead === 'true' ? 1 : 0);
  }

  if (isStarred !== undefined) {
    sql += ' AND e.is_starred = ?';
    bindings.push(isStarred === 'true' ? 1 : 0);
  }

  if (search) {
    sql += ' AND (e.subject LIKE ? OR e.body_text LIKE ? OR e.from_address LIKE ? OR e.to_address LIKE ?)';
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (labelId) {
    sql += ' AND e.id IN (SELECT email_id FROM email_labels WHERE label_id = ?)';
    bindings.push(labelId);
  }

  sql += ` ORDER BY e.received_at ${sort.toUpperCase()} LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  const emails = await c.env.DB.prepare(sql).bind(...bindings).all<Email>();

  // Get total count
  let countSql = `
    SELECT COUNT(DISTINCT e.id) as total FROM emails e
    INNER JOIN mailboxes m ON e.mailbox_id = m.id
    WHERE m.user_id = ? AND e.deleted_at IS NULL
  `;
  const countBindings: (string | number)[] = [userPayload?.sub as string];

  if (folder) {
    countSql += ' AND e.folder = ?';
    countBindings.push(folder);
  }

  if (isRead !== undefined) {
    countSql += ' AND e.is_read = ?';
    countBindings.push(isRead === 'true' ? 1 : 0);
  }

  if (isStarred !== undefined) {
    countSql += ' AND e.is_starred = ?';
    countBindings.push(isStarred === 'true' ? 1 : 0);
  }

  if (search) {
    countSql += ' AND (e.subject LIKE ? OR e.body_text LIKE ? OR e.from_address LIKE ? OR e.to_address LIKE ?)';
    const searchPattern = `%${search}%`;
    countBindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (labelId) {
    countSql += ' AND e.id IN (SELECT email_id FROM email_labels WHERE label_id = ?)';
    countBindings.push(labelId);
  }

  const countResult = await c.env.DB.prepare(countSql).bind(...countBindings).first<{ total: number }>();

  const response: ApiResponse = {
    success: true,
    data: {
      emails: emails.results,
      pagination: {
        page,
        limit,
        total: countResult?.total || 0,
        totalPages: Math.ceil((countResult?.total || 0) / limit),
      },
    },
  };

  return c.json(response);
});

// Get email details
mailRoutes.get('/:id', authenticate, async (c) => {
  const userPayload = c.get('user');
  const emailId = c.req.param('id');

  const email = await c.env.DB
    .prepare(`
      SELECT e.* FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id = ? AND m.user_id = ? AND e.deleted_at IS NULL
    `)
    .bind(emailId, userPayload?.sub)
    .first<Email>();

  if (!email) {
    throw new NotFoundError('Email not found');
  }

  // Mark as read
  await c.env.DB
    .prepare('UPDATE emails SET is_read = 1 WHERE id = ?')
    .bind(emailId)
    .run();

  // Get attachments
  const attachments = await c.env.DB
    .prepare('SELECT * FROM attachments WHERE email_id = ?')
    .bind(emailId)
    .all<Attachment>();

  // Get labels
  const labels = await c.env.DB
    .prepare(`
      SELECT l.* FROM labels l
      INNER JOIN email_labels el ON l.id = el.label_id
      WHERE el.email_id = ?
    `)
    .bind(emailId)
    .all();

  const response: ApiResponse = {
    success: true,
    data: {
      ...email,
      attachments: attachments.results,
      labels: labels.results,
    },
  };

  return c.json(response);
});

// Send email
mailRoutes.post('/send', authenticate, turnstileVerify, async (c) => {
  const userPayload = c.get('user');
  const body = await c.req.json<{
    to: string;
    subject: string;
    body: string;
    isHtml?: boolean;
    from?: string;
    attachmentIds?: string[];
  }>();

  if (!body.to || !body.subject || !body.body) {
    throw new BadRequestError('Recipient, subject, and body are required');
  }

  // Get user's default mailbox or specified mailbox
  let fromEmail: string;
  if (body.from) {
    const mailbox = await c.env.DB
      .prepare('SELECT * FROM mailboxes WHERE email = ? AND user_id = ?')
      .bind(body.from, userPayload?.sub)
      .first();

    if (!mailbox) {
      throw new NotFoundError('Mailbox not found');
    }
    fromEmail = body.from;
  } else {
    const defaultMailbox = await c.env.DB
      .prepare('SELECT * FROM mailboxes WHERE user_id = ? AND is_default = 1')
      .bind(userPayload?.sub)
      .first();

    if (!defaultMailbox) {
      throw new NotFoundError('No default mailbox found');
    }
    fromEmail = (defaultMailbox as { email: string }).email;
  }

  // Get Resend API Key from settings (database)
  const resendApiKey = await getResendApiKey(c.env.DB, userPayload?.sub);
  if (!resendApiKey) {
    throw new BadRequestError('Resend API key not configured. Please set it in settings.');
  }

  const resend = new Resend(resendApiKey);

  // Get attachments if specified
  let attachments: Array<{ filename: string; content: ArrayBuffer | Blob }> = [];
  if (body.attachmentIds && body.attachmentIds.length > 0) {
    for (const attachmentId of body.attachmentIds) {
      const attachment = await c.env.DB
        .prepare('SELECT * FROM attachments WHERE id = ?')
        .bind(attachmentId)
        .first<Attachment>();

      if (attachment) {
        const r2Object = await c.env.ATTACHMENTS.get(attachment.storage_path);
        if (r2Object) {
          const content = await r2Object.arrayBuffer();
          attachments.push({
            filename: attachment.filename,
            content,
          });
        }
      }
    }
  }

  // Send email via Resend
  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: body.to,
    subject: body.subject,
    [body.isHtml ? 'html' : 'text']: body.body,
    attachments: attachments.length > 0 ? attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.from(await a.content).toString('base64'),
    })) : undefined,
  });

  if (error) {
    throw new BadRequestError(`Failed to send email: ${error.message}`);
  }

  // Save to sent folder
  const emailId = crypto.randomUUID();
  const now = new Date().toISOString();

  const mailbox = await c.env.DB
    .prepare('SELECT * FROM mailboxes WHERE email = ?')
    .bind(fromEmail)
    .first<{ id: string }>();

  if (mailbox) {
    await c.env.DB
      .prepare(`
        INSERT INTO emails (id, mailbox_id, from_address, to_address, subject, body_text, body_html, is_read, is_starred, folder, created_at, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 'sent', ?, ?)
      `)
      .bind(
        emailId,
        mailbox.id,
        fromEmail,
        body.to,
        body.subject,
        body.isHtml ? '' : body.body,
        body.isHtml ? body.body : '',
        now,
        now
      )
      .run();
  }

  const response: ApiResponse = {
    success: true,
    data: { emailId, resendId: data?.id },
    message: 'Email sent successfully',
  };

  return c.json(response, 201);
});

// Mark as read/unread
mailRoutes.patch('/:id/read', authenticate, async (c) => {
  const userPayload = c.get('user');
  const emailId = c.req.param('id');
  const { isRead } = await c.req.json<{ isRead: boolean }>();

  const email = await c.env.DB
    .prepare(`
      SELECT e.* FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id = ? AND m.user_id = ? AND e.deleted_at IS NULL
    `)
    .bind(emailId, userPayload?.sub)
    .first();

  if (!email) {
    throw new NotFoundError('Email not found');
  }

  await c.env.DB
    .prepare('UPDATE emails SET is_read = ? WHERE id = ?')
    .bind(isRead ? 1 : 0, emailId)
    .run();

  const response: ApiResponse = {
    success: true,
    message: `Email marked as ${isRead ? 'read' : 'unread'}`,
  };

  return c.json(response);
});

// Toggle star
mailRoutes.patch('/:id/star', authenticate, async (c) => {
  const userPayload = c.get('user');
  const emailId = c.req.param('id');

  const email = await c.env.DB
    .prepare(`
      SELECT e.* FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id = ? AND m.user_id = ? AND e.deleted_at IS NULL
    `)
    .bind(emailId, userPayload?.sub)
    .first<Email>();

  if (!email) {
    throw new NotFoundError('Email not found');
  }

  await c.env.DB
    .prepare('UPDATE emails SET is_starred = ? WHERE id = ?')
    .bind(email.is_starred ? 0 : 1, emailId)
    .run();

  const response: ApiResponse = {
    success: true,
    message: `Email ${email.is_starred ? 'unstarred' : 'starred'}`,
  };

  return c.json(response);
});

// Move to folder
mailRoutes.patch('/:id/folder', authenticate, async (c) => {
  const userPayload = c.get('user');
  const emailId = c.req.param('id');
  const { folder } = await c.req.json<{ folder: string }>();

  if (!folder) {
    throw new BadRequestError('Folder is required');
  }

  // Verify folder exists
  const folderRecord = await c.env.DB
    .prepare('SELECT * FROM folders WHERE name = ? AND user_id = ?')
    .bind(folder, userPayload?.sub)
    .first();

  if (!folderRecord) {
    throw new NotFoundError('Folder not found');
  }

  const email = await c.env.DB
    .prepare(`
      SELECT e.* FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id = ? AND m.user_id = ? AND e.deleted_at IS NULL
    `)
    .bind(emailId, userPayload?.sub)
    .first();

  if (!email) {
    throw new NotFoundError('Email not found');
  }

  await c.env.DB
    .prepare('UPDATE emails SET folder = ? WHERE id = ?')
    .bind(folder, emailId)
    .run();

  const response: ApiResponse = {
    success: true,
    message: `Email moved to ${folder}`,
  };

  return c.json(response);
});

// Delete email (soft delete)
mailRoutes.delete('/:id', authenticate, async (c) => {
  const userPayload = c.get('user');
  const emailId = c.req.param('id');

  const email = await c.env.DB
    .prepare(`
      SELECT e.* FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id = ? AND m.user_id = ? AND e.deleted_at IS NULL
    `)
    .bind(emailId, userPayload?.sub)
    .first();

  if (!email) {
    throw new NotFoundError('Email not found');
  }

  const now = new Date().toISOString();
  await c.env.DB
    .prepare('UPDATE emails SET deleted_at = ? WHERE id = ?')
    .bind(now, emailId)
    .run();

  const response: ApiResponse = {
    success: true,
    message: 'Email deleted',
  };

  return c.json(response);
});

// Search emails
mailRoutes.get('/search', authenticate, async (c) => {
  const userPayload = c.get('user');
  const query = c.req.query();

  const page = Math.max(1, parseInt(query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit as string) || 20));
  const offset = (page - 1) * limit;
  const q = (query.q as string) || '';
  const searchField = (query.field as string) || 'all';

  if (!q) {
    throw new BadRequestError('Search query is required');
  }

  let sql = `
    SELECT e.* FROM emails e
    INNER JOIN mailboxes m ON e.mailbox_id = m.id
    WHERE m.user_id = ? AND e.deleted_at IS NULL
  `;
  const bindings: (string | number)[] = [userPayload?.sub as string];
  const searchPattern = `%${q}%`;

  switch (searchField) {
    case 'subject':
      sql += ' AND e.subject LIKE ?';
      bindings.push(searchPattern);
      break;
    case 'from':
      sql += ' AND e.from_address LIKE ?';
      bindings.push(searchPattern);
      break;
    case 'to':
      sql += ' AND e.to_address LIKE ?';
      bindings.push(searchPattern);
      break;
    case 'body':
      sql += ' AND (e.body_text LIKE ? OR e.body_html LIKE ?)';
      bindings.push(searchPattern, searchPattern);
      break;
    default:
      sql += ' AND (e.subject LIKE ? OR e.body_text LIKE ? OR e.from_address LIKE ? OR e.to_address LIKE ?)';
      bindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  sql += ' ORDER BY e.received_at DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const emails = await c.env.DB.prepare(sql).bind(...bindings).all<Email>();

  // Get total count
  let countSql = `
    SELECT COUNT(*) as total FROM emails e
    INNER JOIN mailboxes m ON e.mailbox_id = m.id
    WHERE m.user_id = ? AND e.deleted_at IS NULL
  `;
  const countBindings: (string | number)[] = [userPayload?.sub as string];

  switch (searchField) {
    case 'subject':
      countSql += ' AND e.subject LIKE ?';
      countBindings.push(searchPattern);
      break;
    case 'from':
      countSql += ' AND e.from_address LIKE ?';
      countBindings.push(searchPattern);
      break;
    case 'to':
      countSql += ' AND e.to_address LIKE ?';
      countBindings.push(searchPattern);
      break;
    case 'body':
      countSql += ' AND (e.body_text LIKE ? OR e.body_html LIKE ?)';
      countBindings.push(searchPattern, searchPattern);
      break;
    default:
      countSql += ' AND (e.subject LIKE ? OR e.body_text LIKE ? OR e.from_address LIKE ? OR e.to_address LIKE ?)';
      countBindings.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const countResult = await c.env.DB.prepare(countSql).bind(...countBindings).first<{ total: number }>();

  const response: ApiResponse = {
    success: true,
    data: {
      emails: emails.results,
      pagination: {
        page,
        limit,
        total: countResult?.total || 0,
        totalPages: Math.ceil((countResult?.total || 0) / limit),
      },
    },
  };

  return c.json(response);
});

// Batch operations
mailRoutes.post('/batch', authenticate, async (c) => {
  const userPayload = c.get('user');
  const body = await c.req.json<{
    emailIds: string[];
    action: 'read' | 'unread' | 'delete' | 'move' | 'addLabel' | 'removeLabel';
    value?: string;
  }>();

  if (!body.emailIds || !body.action) {
    throw new BadRequestError('Email IDs and action are required');
  }

  if (body.emailIds.length > 100) {
    throw new BadRequestError('Maximum 100 emails per batch operation');
  }

  // Verify all emails belong to user
  const placeholders = body.emailIds.map(() => '?').join(',');
  const emails = await c.env.DB
    .prepare(`
      SELECT e.id FROM emails e
      INNER JOIN mailboxes m ON e.mailbox_id = m.id
      WHERE e.id IN (${placeholders}) AND m.user_id = ? AND e.deleted_at IS NULL
    `)
    .bind(...body.emailIds, userPayload?.sub)
    .all<{ id: string }>();

  const validEmailIds = emails.results.map((e) => e.id);

  if (validEmailIds.length === 0) {
    throw new NotFoundError('No valid emails found');
  }

  const emailPlaceholders = validEmailIds.map(() => '?').join(',');

  switch (body.action) {
    case 'read':
      await c.env.DB
        .prepare(`UPDATE emails SET is_read = 1 WHERE id IN (${emailPlaceholders})`)
        .bind(...validEmailIds)
        .run();
      break;

    case 'unread':
      await c.env.DB
        .prepare(`UPDATE emails SET is_read = 0 WHERE id IN (${emailPlaceholders})`)
        .bind(...validEmailIds)
        .run();
      break;

    case 'delete':
      const now = new Date().toISOString();
      await c.env.DB
        .prepare(`UPDATE emails SET deleted_at = ? WHERE id IN (${emailPlaceholders})`)
        .bind(now, ...validEmailIds)
        .run();
      break;

    case 'move':
      if (!body.value) {
        throw new BadRequestError('Folder value is required for move action');
      }
      await c.env.DB
        .prepare(`UPDATE emails SET folder = ? WHERE id IN (${emailPlaceholders})`)
        .bind(body.value, ...validEmailIds)
        .run();
      break;

    case 'addLabel':
      if (!body.value) {
        throw new BadRequestError('Label ID is required for addLabel action');
      }
      for (const emailId of validEmailIds) {
        await c.env.DB
          .prepare('INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)')
          .bind(emailId, body.value)
          .run();
      }
      break;

    case 'removeLabel':
      if (!body.value) {
        throw new BadRequestError('Label ID is required for removeLabel action');
      }
      await c.env.DB
        .prepare(`DELETE FROM email_labels WHERE email_id IN (${emailPlaceholders}) AND label_id = ?`)
        .bind(...validEmailIds, body.value)
        .run();
      break;
  }

  const response: ApiResponse = {
    success: true,
    data: { processed: validEmailIds.length },
    message: `Batch ${body.action} completed`,
  };

  return c.json(response);
});
