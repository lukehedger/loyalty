import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  ConfigProfileInvalidError,
  createConfigReader,
  type FetchProfile,
  toDeployableProfile,
} from '../index.ts';

const featureFlags = {
  name: 'feature-flags',
  schema: z.object({ instantRefunds: z.boolean() }),
};

const fetchReturning = (content: unknown) => {
  const calls: Parameters<FetchProfile>[] = [];
  const fetchProfile: FetchProfile = async (...args) => {
    calls.push(args);
    return content;
  };

  return { calls, fetchProfile };
};

describe('createConfigReader', () => {
  test('fetches the profile from the application default environment', async () => {
    const { calls, fetchProfile } = fetchReturning({ instantRefunds: true });
    const config = createConfigReader({ application: 'orders', fetchProfile });

    await config.read(featureFlags);

    expect(calls).toEqual([
      [
        'feature-flags',
        { application: 'orders', environment: 'default', maxAge: 60 },
      ],
    ]);
  });

  test('uses a custom cache age', async () => {
    const { calls, fetchProfile } = fetchReturning({ instantRefunds: true });
    const config = createConfigReader({
      application: 'orders',
      maxAgeSeconds: 300,
      fetchProfile,
    });

    await config.read(featureFlags);

    expect(calls[0]?.[1].maxAge).toBe(300);
  });

  test('returns the profile parsed against its schema', async () => {
    const { fetchProfile } = fetchReturning({ instantRefunds: false });
    const config = createConfigReader({ application: 'orders', fetchProfile });

    expect(await config.read(featureFlags)).toEqual({ instantRefunds: false });
  });

  test('rejects a profile that does not match its schema', async () => {
    const { fetchProfile } = fetchReturning({ instantRefunds: 'yes' });
    const config = createConfigReader({ application: 'orders', fetchProfile });

    await expect(config.read(featureFlags)).rejects.toThrow(
      new ConfigProfileInvalidError('feature-flags'),
    );
  });
});

describe('toDeployableProfile', () => {
  test('pairs the content with the JSON Schema AppConfig validates against', () => {
    const content = '{ "instantRefunds": true }';

    expect(toDeployableProfile(featureFlags, content)).toEqual({
      name: 'feature-flags',
      content,
      jsonSchema: z.toJSONSchema(featureFlags.schema),
    });
  });

  test('fails at synth when the content does not match the schema', () => {
    expect(() => toDeployableProfile(featureFlags, '{}')).toThrow(
      ConfigProfileInvalidError,
    );
  });
});
