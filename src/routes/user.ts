import { Hono } from 'hono';
import { hash, verify } from '../utils/password';
import type { Env, User } from '../types';
import type { ApiResponse } from '../types';
import { authenticate } from '../middleware/auth';
import { BadRequestError, UnauthorizedError } from '../middleware/error';

export const userRoutes = new Hono<{ Bindings: Env }>();

// Get current user
userRoutes.get('/', authenticate, async (c) => {
  const userPayload = c.get('user');

  const user = await c.env.DB
    .prepare('SELECT id, email, username, created_at FROM users WHERE id = ?')
    .bind(userPayload?.sub)
    .first<User>();

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const response: ApiResponse = {
    success: true,
    data: user,
  };

  return c.json(response);
});

// Change password
userRoutes.patch('/password', authenticate, async (c) => {
  const userPayload = c.get('user');
  const { currentPassword, newPassword } = await c.req.json<{
    currentPassword: string;
    newPassword: string;
  }>();

  if (!currentPassword || !newPassword) {
    throw new BadRequestError('Current password and new password are required');
  }

  if (newPassword.length < 8) {
    throw new BadRequestError('New password must be at least 8 characters');
  }

  const user = await c.env.DB
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(userPayload?.sub)
    .first<User>();

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  const isValidPassword = await verify(user.password_hash, currentPassword);
  if (!isValidPassword) {
    throw new UnauthorizedError('Current password is incorrect');
  }

  const newPasswordHash = await hash(newPassword);
  const now = new Date().toISOString();

  await c.env.DB
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(newPasswordHash, now, user.id)
    .run();

  const response: ApiResponse = {
    success: true,
    message: 'Password updated successfully',
  };

  return c.json(response);
});
