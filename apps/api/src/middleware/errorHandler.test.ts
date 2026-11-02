import express from 'express';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import errorHandler from './errorHandler';
import { ErrorsMap } from './errors';

describe('errorHandler', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.post('/json', (_req, res) => res.json({ ok: true }));
    app.post('/error', (req, _res, next) => next(req.body));
    app.get('/unexpected', () => {
      throw new SyntaxError('SQL / private stack');
    });
    app.use(errorHandler);

    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('returns INVALID_JSON for malformed JSON', async () => {
    const response = await fetch(`${baseUrl}/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"title":',
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      error: { code: 'INVALID_JSON', message: ErrorsMap.INVALID_JSON.message, details: [] },
    });
  });

  it.each([
    ['INVALID_MONTH', 400],
    ['INVALID_JSON', 400],
    ['VALIDATION_ERROR', 422],
    ['NOT_FOUND', 404],
    ['REVISION_CONFLICT', 409],
    ['INTERNAL_ERROR', 500],
  ])('maps %s to HTTP %s', async (code, status) => {
    const response = await fetch(`${baseUrl}/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      error: { code, message: expect.any(String), details: [] },
    });
  });

  it('keeps validation details local to each request', async () => {
    for (const details of [[{ field: 'amountCents', message: 'Нужна целая сумма' }], []]) {
      const response = await fetch(`${baseUrl}/error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'VALIDATION_ERROR', details }),
      });
      expect(await response.json()).toEqual({
        error: { code: 'VALIDATION_ERROR', message: expect.any(String), details },
      });
    }
  });

  it('does not expose unexpected errors or confuse them with invalid JSON', async () => {
    const response = await fetch(`${baseUrl}/unexpected`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: ErrorsMap.INTERNAL_ERROR.message, details: [] },
    });
  });

  it.each(['toString', 'UNKNOWN'])('handles unknown code %s safely', async (code) => {
    const response = await fetch(`${baseUrl}/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        message: 'private',
        details: [{ field: 'SQL', message: 'private' }],
      }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: ErrorsMap.INTERNAL_ERROR.message, details: [] },
    });
  });

  it('delegates when headers have already been sent', () => {
    const error = new Error('failure');
    const next = vi.fn();
    const response = { headersSent: true };
    errorHandler(
      error,
      {} as Parameters<typeof errorHandler>[1],
      response as Parameters<typeof errorHandler>[2],
      next,
    );
    expect(next).toHaveBeenCalledWith(error);
  });
});
