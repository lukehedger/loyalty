import { describe, expect, test } from 'bun:test';
import type { Adapter } from '../src/index.ts';

type Signatures = {
  readonly quote: {
    readonly args: readonly [quantity: number];
    readonly result: { readonly total: number };
  };
};

type Deps = { readonly unitPrice: number };

const acme: Adapter<{ readonly price: number }, Deps, Signatures> = {
  buildContext: async (deps) => ({ price: deps.unitPrice }),
  capabilities: {
    quote: async (context, quantity) => ({ total: context.price * quantity }),
  },
};

describe('Adapter', () => {
  test('fits a registry slot whatever its context type', () => {
    const slot: Adapter<unknown, Deps, Signatures> = acme;

    expect(slot).toBe(acme);
  });

  test('offers no capability outside the signatures', () => {
    const adapter: Adapter<undefined, Deps, Signatures> = {
      buildContext: async () => undefined,
      capabilities: {
        // @ts-expect-error refund is not a declared capability.
        refund: async () => ({ refunded: true }),
      },
    };

    expect(Object.keys(adapter.capabilities)).toEqual(['refund']);
  });

  test('omits a capability it does not support', () => {
    const adapter: Adapter<undefined, Deps, Signatures> = {
      buildContext: async () => undefined,
      capabilities: {},
    };

    expect(adapter.capabilities.quote).toBeUndefined();
  });
});
