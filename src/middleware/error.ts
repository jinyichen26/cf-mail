import { Hono } from 'hono';
import type { ApiResponse } from '../types';

export function errorHandler(err: Error, c: Hono) {
  console.error('Error:', err);

  const status = (err as { status?: number }).status || 500;
  const message = status === 500 ? 'Internal Server Error' : err.message;

  const response: ApiResponse = {
    success: false,
    error: message,
  };

  return c.json(response, status);
}

export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number = 400) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string = 'Not Found') {
    super(message, 404);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string = 'Bad Request') {
    super(message, 400);
  }
}
