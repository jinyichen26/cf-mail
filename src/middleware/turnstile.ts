import { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { ForbiddenError } from './error';

export const turnstileVerify: MiddlewareHandler<{ Bindings: Env }> = async (c: Context) => {
  const token = c.req.header('X-Turnstile-Token');

  if (!token) {
    throw new ForbiddenError('Turnstile token is required');
  }

  const secretKey = c.env.TURNSTILE_SECRET_KEY;

  try {
    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
      }),
    });

    const outcome = await result.json() as { success: boolean; 'error-codes'?: string[] };

    if (!outcome.success) {
      const errorCodes = outcome['error-codes']?.join(', ') || 'Verification failed';
      throw new ForbiddenError(`Turnstile verification failed: ${errorCodes}`);
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw error;
    }
    throw new ForbiddenError('Turnstile verification error');
  }
};
