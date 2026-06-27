import { Context, MiddlewareHandler } from 'hono';
import { verify } from 'hono/jwt';
import type { Env, User } from '../types';
import { UnauthorizedError } from './error';

export interface JWTPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export const authenticate: MiddlewareHandler<{ Bindings: Env }> = async (c: Context) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('user', payload as JWTPayload);
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
};

export function getUser(c: Context): JWTPayload | null {
  return c.get('user') || null;
}
