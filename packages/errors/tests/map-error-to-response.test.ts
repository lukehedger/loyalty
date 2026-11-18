import { describe, expect, test } from 'bun:test';
import {
  errorBodySchema,
  mapErrorToResponse,
  NotFoundError,
  ValidationError,
} from '../src/index.ts';

const parseBody = (body: string) => errorBodySchema.parse(JSON.parse(body));

describe('mapErrorToResponse', () => {
  test('returns the classified status with a JSON body that matches the schema', () => {
    const response = mapErrorToResponse(
      new NotFoundError('Order ord-1 not found'),
      'request-1',
    );

    expect(response.statusCode).toBe(404);
    expect(response.headers).toEqual({ 'content-type': 'application/json' });
    expect(parseBody(response.body)).toEqual({
      errorId: 'request-1',
      code: 'NotFound',
      message: 'Order ord-1 not found',
    });
  });

  test('never returns which fields failed validation', () => {
    const response = mapErrorToResponse(
      new ValidationError([{ path: ['quantity'], message: 'Too small' }]),
      'request-2',
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('quantity');
    expect(parseBody(response.body).message).toBe('Request failed validation');
  });

  test('never returns the message of an unexpected error', () => {
    const response = mapErrorToResponse(
      new Error('ConditionalCheckFailed on orders-table'),
      'request-3',
    );

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('orders-table');
  });
});
