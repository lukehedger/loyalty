import { describe, expect, test } from 'bun:test';
import { variantSchema, variants } from '../index.ts';

describe('variantSchema', () => {
  test('accepts every supported variant', () => {
    for (const variant of variants) {
      expect(variantSchema.safeParse(variant).success).toBe(true);
    }
  });

  test('rejects a variant that is not supported', () => {
    expect(variantSchema.safeParse('unsupported-variant').success).toBe(false);
  });
});
