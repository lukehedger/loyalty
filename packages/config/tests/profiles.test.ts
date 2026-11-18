import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { profiles, toDeployableProfile } from '../src/index.ts';

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
