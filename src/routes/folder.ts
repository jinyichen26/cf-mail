import { Hono } from 'hono';
import type { Env, Folder } from '../types';
import type { ApiResponse } from '../types';
import { authenticate } from '../middleware/auth';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/error';

export const folderRoutes = new Hono<{ Bindings: Env }>();

// Get all folders
folderRoutes.get('/', authenticate, async (c) => {
  const userPayload = c.get('user');

  const folders = await c.env.DB
    .prepare('SELECT * FROM folders WHERE user_id = ? ORDER BY is_system DESC, name ASC')
    .bind(userPayload?.sub)
    .all<Folder>();

  const response: ApiResponse = {
    success: true,
    data: folders.results,
  };

  return c.json(response);
});

// Create folder
folderRoutes.post('/', authenticate, async (c) => {
  const userPayload = c.get('user');
  const { name } = await c.req.json<{ name: string }>();

  if (!name) {
    throw new BadRequestError('Folder name is required');
  }

  // Check if system folder with same name exists
  const existingSystemFolder = await c.env.DB
    .prepare('SELECT * FROM folders WHERE name = ? AND is_system = 1')
    .bind(name.toLowerCase())
    .first();

  if (existingSystemFolder) {
    throw new BadRequestError('Cannot create folder with system folder name');
  }

  const folderId = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB
    .prepare(`
      INSERT INTO folders (id, user_id, name, is_system, created_at)
      VALUES (?, ?, ?, 0, ?)
    `)
    .bind(folderId, userPayload?.sub, name.toLowerCase(), now)
    .run();

  const folder = await c.env.DB
    .prepare('SELECT * FROM folders WHERE id = ?')
    .bind(folderId)
    .first<Folder>();

  const response: ApiResponse = {
    success: true,
    data: folder,
    message: 'Folder created successfully',
  };

  return c.json(response, 201);
});

// Update folder
folderRoutes.patch('/:id', authenticate, async (c) => {
  const userPayload = c.get('user');
  const folderId = c.req.param('id');
  const { name } = await c.req.json<{ name?: string }>();

  const folder = await c.env.DB
    .prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?')
    .bind(folderId, userPayload?.sub)
    .first<Folder>();

  if (!folder) {
    throw new NotFoundError('Folder not found');
  }

  if (folder.is_system) {
    throw new ForbiddenError('Cannot modify system folder');
  }

  if (!name) {
    throw new BadRequestError('Folder name is required');
  }

  await c.env.DB
    .prepare('UPDATE folders SET name = ? WHERE id = ?')
    .bind(name.toLowerCase(), folderId)
    .run();

  const updatedFolder = await c.env.DB
    .prepare('SELECT * FROM folders WHERE id = ?')
    .bind(folderId)
    .first<Folder>();

  const response: ApiResponse = {
    success: true,
    data: updatedFolder,
    message: 'Folder updated successfully',
  };

  return c.json(response);
});

// Delete folder
folderRoutes.delete('/:id', authenticate, async (c) => {
  const userPayload = c.get('user');
  const folderId = c.req.param('id');

  const folder = await c.env.DB
    .prepare('SELECT * FROM folders WHERE id = ? AND user_id = ?')
    .bind(folderId, userPayload?.sub)
    .first<Folder>();

  if (!folder) {
    throw new NotFoundError('Folder not found');
  }

  if (folder.is_system) {
    throw new ForbiddenError('Cannot delete system folder');
  }

  // Move emails in this folder to inbox
  await c.env.DB
    .prepare(`
      UPDATE emails SET folder = 'inbox'
      WHERE folder = ? AND mailbox_id IN (
        SELECT id FROM mailboxes WHERE user_id = ?
      )
    `)
    .bind(folder.name, userPayload?.sub)
    .run();

  // Delete folder
  await c.env.DB
    .prepare('DELETE FROM folders WHERE id = ?')
    .bind(folderId)
    .run();

  const response: ApiResponse = {
    success: true,
    message: 'Folder deleted successfully',
  };

  return c.json(response);
});
