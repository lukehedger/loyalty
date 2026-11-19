import { describe, expect, test } from 'bun:test';
import { direct } from '@loyalty/adapters';
import { variants } from '@loyalty/schema';
import { registry } from '../index.ts';

describe('registry', () => {
  test('routes the direct variant to the direct adapter', () => {
    expect(registry.direct).toBe(direct);
  });

  test('has an adapter for every variant', () => {
    for (const variant of variants) expect(registry[variant]).toBeDefined();
  });
});
