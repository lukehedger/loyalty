import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  earnRateProfile,
  MAX_EARN_RATE,
  profiles,
  toDeployableProfile,
} from '../index.ts';

const environments = ['test', 'production'] as const;

describe('profiles', () => {
  for (const environment of environments) {
    for (const profile of profiles) {
      test(`${environment}/${profile.name}.json matches its schema`, () => {
        const content = readFileSync(
          join(
            import.meta.dirname,
            '../environments',
            environment,
            `${profile.name}.json`,
          ),
          'utf8',
        );

        expect(() => toDeployableProfile(profile, content)).not.toThrow();
      });
    }
  }
});

describe('earnRateProfile', () => {
  test.each([1, MAX_EARN_RATE])('accepts an earn rate of %p', (earnRate) => {
    expect(earnRateProfile.schema.safeParse({ earnRate }).success).toBe(true);
  });

  test.each([0, 1.5, MAX_EARN_RATE + 1])(
    'rejects an earn rate of %p',
    (earnRate) => {
      expect(earnRateProfile.schema.safeParse({ earnRate }).success).toBe(
        false,
      );
    },
  );
});
