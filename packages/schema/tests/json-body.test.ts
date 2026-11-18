import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { jsonBody } from '../src/index.ts';

const requestSchema = jsonBody(
  z.object({ quantity: z.number().int().positive() }),
);

describe('jsonBody', () => {
  test('parses and validates a JSON body', () => {
    const result = requestSchema.safeParse('{"quantity":2}');

    expect(result.data).toEqual({ quantity: 2 });
  });

  test('rejects a missing body', () => {
    const result = requestSchema.safeParse(null);

    expect(result.error?.issues).toMatchObject([
      { path: [], message: 'Request body is required' },
    ]);
  });

  test('rejects a body that is not JSON', () => {
    const result = requestSchema.safeParse('{"quantity":');

    expect(result.error?.issues).toMatchObject([
      { path: [], message: 'Request body is not valid JSON' },
    ]);
  });

  test('reports the path of a field that fails the schema', () => {
    const result = requestSchema.safeParse('{"quantity":0}');

    expect(result.error?.issues).toMatchObject([{ path: ['quantity'] }]);
  });
});
