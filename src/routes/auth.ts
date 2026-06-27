import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { hash, verify } from '../utils/password';
import type { Env, User } from '../types';
import type { ApiResponse } from '../types';
import { turnstileVerify } from '../middleware/turnstile';
import { BadRequestError, UnauthorizedError } from '../middleware/error';
import { createSystemDefaults } from '../db';

export const authRoutes = new Hono<{ Bindings: Env }>();

// Register
authRoutes.post('/register', turnstileVerify, async (c) => {
  const { email, username, password } = await c.req.json<{
    email: string;
    username: string;
    password: string;
  }>();

  if (!email || !username || !password) {
    throw new BadRequestError('Email, username, and password are required');
  }

  if (password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new BadRequestError('Invalid email format');
  }

  const passwordHash = await hash(password);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await c.env.DB
      .prepare(`
        INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(userId, email.toLowerCase(), username, passwordHash, now, now)
      .run();

    // Create default mailbox
    const mailboxId = crypto.randomUUID();
    const mailDomain = c.env.MAIL_DOMAIN || 'mail.example.com';
    const mailboxEmail = `${username}@${mailDomain}`;

    await c.env.DB
      .prepare(`
        INSERT INTO mailboxes (id, user_id, email, is_default, created_at)
        VALUES (?, ?, ?, 1, ?)
      `)
      .bind(mailboxId, userId, mailboxEmail, now)
      .run();

    // Create system defaults (labels, folders)
    await createSystemDefaults(userId);

    // Generate JWT
    const token = await sign(
      {
        sub: userId,
        email: email.toLowerCase(),
        username,
      },
      c.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response: ApiResponse = {
      success: true,
      data: {
        user: { id: userId, email, username },
        token,
      },
      message: 'User registered successfully',
    };

    return c.json(response, 201);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new BadRequestError('Email or username already exists');
    }
    throw error;
  }
});

// Login
authRoutes.post('/login', turnstileVerify, async (c) => {
  const { email, password } = await c.req.json<{
    email: string;
    password: string;
  }>();

  if (!email || !password) {
    throw new BadRequestError('Email and password are required');
  }

  const user = await c.env.DB
    .prepare('SELECT * FROM users WHERE email = ?')
    .bind(email.toLowerCase())
    .first<User>();

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isValidPassword = await verify(user.password_hash, password);
  if (!isValidPassword) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const token = await sign(
    {
      sub: user.id,
      email: user.email,
      username: user.username,
    },
    c.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  const response: ApiResponse = {
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      token,
    },
  };

  return c.json(response);
});
