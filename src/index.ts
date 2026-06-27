import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { logger } from 'hono/logger';
import type { Env } from './types';
import { errorHandler } from './middleware/error';
import { authRoutes } from './routes/auth';
import { userRoutes } from './routes/user';
import { mailboxRoutes } from './routes/mailbox';
import { mailRoutes } from './routes/mail';
import { labelRoutes } from './routes/label';
import { folderRoutes } from './routes/folder';
import { attachmentRoutes } from './routes/attachment';

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', secureHeaders());

// Error handler
app.onError((err, c) => errorHandler(err, c));

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/user', userRoutes);
app.route('/api/mailboxes', mailboxRoutes);
app.route('/api/mail', mailRoutes);
app.route('/api/labels', labelRoutes);
app.route('/api/folders', folderRoutes);
app.route('/api/attachments', attachmentRoutes);

// Email routing webhook endpoint
app.post('/email/routing', async (c) => {
  const { execute } = await import('./db');
  const db = execute(c.env.DB);

  // Get raw email content
  const contentType = c.req.header('content-type') || '';
  const rawEmail = await c.req.text();

  // Parse email using postal-mime
  const { parse: parseMime } = await import('postal-mime');
  const parsed = await parseMime(rawEmail);

  // Extract email fields
  const from = parsed.from?.value?.[0]?.address || '';
  const to = parsed.to?.value?.map((t: { address?: string }) => t.address).join(',') || '';
  const subject = parsed.subject || '';
  const textBody = parsed.text || '';
  const htmlBody = parsed.html || '';

  // Find recipient mailbox
  const recipientEmail = to.split(',')[0]?.trim();
  if (!recipientEmail) {
    return c.json({ error: 'Invalid recipient' }, 400);
  }

  // Look up mailbox by email address
  const mailbox = await db
    .prepare('SELECT * FROM mailboxes WHERE email = ?')
    .bind(recipientEmail)
    .first();

  if (!mailbox) {
    // Unknown recipient - return 550 to reject
    return c.json({ error: 'Mailbox not found' }, 550);
  }

  // Create email record
  const emailId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(`
      INSERT INTO emails (id, mailbox_id, from_address, to_address, subject, body_text, body_html, is_read, is_starred, folder, created_at, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'inbox', ?, ?)
    `)
    .bind(emailId, mailbox.id, from, to, subject, textBody, htmlBody, now, now)
    .run();

  // Process attachments
  if (parsed.attachments) {
    for (const attachment of parsed.attachments) {
      const attachmentId = crypto.randomUUID();
      const filename = attachment.filename || `attachment_${attachmentId}`;
      const content = attachment.content as ArrayBuffer;

      // Upload to R2
      await c.env.ATTACHMENTS.put(`${emailId}/${filename}`, content, {
        httpMetadata: {
          contentType: attachment.mimeType || 'application/octet-stream',
        },
      });

      // Save attachment metadata to D1
      await db
        .prepare(`
          INSERT INTO attachments (id, email_id, filename, content_type, size, storage_path, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(attachmentId, emailId, filename, attachment.mimeType || 'application/octet-stream', content.byteLength, `${emailId}/${filename}`, now)
        .run();
    }
  }

  return c.json({ success: true, emailId });
});

export default app;
