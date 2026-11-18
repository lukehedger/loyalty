import { test } from 'bun:test';
import fc from 'fast-check';
import type { InvariantName } from '../src/index.ts';

// The test name carries the invariant so the fitness functions can trace every DOMAIN.md invariant to its property.
export const invariant = <T>(
  name: InvariantName,
  arbitrary: fc.Arbitrary<T>,
  holds: (value: T) => boolean,
): void => {
  test(`invariant: ${name}`, () => {
    fc.assert(fc.property(arbitrary, holds));
  });
};
