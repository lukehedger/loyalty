import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  createSecretReader,
  type FetchSecret,
  SecretInvalidError,
} from '../src/index.ts';

const credentials = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
});

const fetchReturning = (secret: unknown) => {
  const calls: Parameters<FetchSecret>[] = [];
  const fetchSecret: FetchSecret = async (...args) => {
    calls.push(args);
    return secret;
  };

  return { calls, fetchSecret };
};

describe('createSecretReader', () => {
  test('reads a JSON secret parsed against its schema', async () => {
    const { calls, fetchSecret } = fetchReturning(
      '{"clientId":"id","clientSecret":"shh"}',
    );
    const secrets = createSecretReader({ fetchSecret });

    const result = await secrets.read('partner/credentials', credentials);

    expect(result).toEqual({ clientId: 'id', clientSecret: 'shh' });
    expect(calls).toEqual([
      ['partner/credentials', { maxAge: 300, forceFetch: false }],
    ]);
  });

  test('bypasses the cache when asked, for a secret that has rotated', async () => {
    const { calls, fetchSecret } = fetchReturning(
      '{"clientId":"id","clientSecret":"rotated"}',
    );
    const secrets = createSecretReader({ maxAgeSeconds: 60, fetchSecret });

    await secrets.read('partner/credentials', credentials, {
      forceFetch: true,
    });

    expect(calls).toEqual([
      ['partner/credentials', { maxAge: 60, forceFetch: true }],
    ]);
  });

  test('rejects a JSON secret that does not match its schema', async () => {
    const { fetchSecret } = fetchReturning('{"clientId":"id"}');
    const secrets = createSecretReader({ fetchSecret });

    await expect(
      secrets.read('partner/credentials', credentials),
    ).rejects.toThrow(new SecretInvalidError('partner/credentials'));
  });

  test('rejects a secret that is not JSON without quoting its value', async () => {
    const { fetchSecret } = fetchReturning('not-json-shh');
    const secrets = createSecretReader({ fetchSecret });

    const error = await secrets
      .read('partner/credentials', credentials)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SecretInvalidError);
    expect(String(error)).not.toContain('shh');
    expect(error).not.toHaveProperty('cause');
  });

  test('reads a string secret as it is stored', async () => {
    const { fetchSecret } = fetchReturning('-----BEGIN CERTIFICATE-----\n');
    const secrets = createSecretReader({ fetchSecret });

    expect(await secrets.readString('partner/certificate')).toBe(
      '-----BEGIN CERTIFICATE-----\n',
    );
  });

  test('rejects a binary secret where a string is expected', async () => {
    const { fetchSecret } = fetchReturning(new Uint8Array([1, 2, 3]));
    const secrets = createSecretReader({ fetchSecret });

    await expect(secrets.readString('partner/certificate')).rejects.toThrow(
      SecretInvalidError,
    );
  });
});
