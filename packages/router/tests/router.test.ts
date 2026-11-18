import { describe, expect, mock, test } from 'bun:test';
import type { Adapter } from '@loyalty/adapters';
import { CapabilityNotSupportedError } from '@loyalty/errors';
import { createRouter, type Registry } from '../src/index.ts';

type Signatures = {
  readonly quote: {
    readonly args: readonly [quantity: number];
    readonly result: { readonly total: number };
  };
  readonly cancel: {
    readonly args: readonly [orderId: string];
    readonly result: { readonly cancelled: string };
  };
};

type Variant = 'acme' | 'globex';

type Deps = { readonly unitPrice: number };

const contextDeps: Deps = { unitPrice: 5 };

const makeAcme = () => {
  const buildContext = mock(async (deps: Deps) => ({ price: deps.unitPrice }));
  const adapter: Adapter<{ readonly price: number }, Deps, Signatures> = {
    buildContext,
    capabilities: {
      quote: async (context, quantity) => ({ total: context.price * quantity }),
      cancel: async (_context, orderId) => ({ cancelled: orderId }),
    },
  };
  return { adapter, buildContext };
};

const makeGlobex = () => {
  const buildContext = mock(async (_deps: Deps) => ({ flatFee: 99 }));
  const adapter: Adapter<{ readonly flatFee: number }, Deps, Signatures> = {
    buildContext,
    capabilities: {
      quote: async (context) => ({ total: context.flatFee }),
    },
  };
  return { adapter, buildContext };
};

const makeRouter = () => {
  const acme = makeAcme();
  const globex = makeGlobex();
  const registry: Registry<Variant, Deps, Signatures> = {
    acme: acme.adapter,
    globex: globex.adapter,
  };
  return { acme, globex, router: createRouter({ registry, contextDeps }) };
};

describe('createRouter', () => {
  test('invokes the capability with the context built from the deps', async () => {
    const { acme, router } = makeRouter();

    expect(await router.invoke('acme', 'quote', 3)).toEqual({ total: 15 });
    expect(acme.buildContext).toHaveBeenCalledWith(contextDeps);
  });

  test('routes each variant to its own adapter', async () => {
    const { acme, globex, router } = makeRouter();

    expect(await router.invoke('globex', 'quote', 3)).toEqual({ total: 99 });
    expect(globex.buildContext).toHaveBeenCalledTimes(1);
    expect(acme.buildContext).not.toHaveBeenCalled();
  });

  test('builds the context once per request', async () => {
    const { acme, router } = makeRouter();

    await router.invoke('acme', 'quote', 1);
    await router.invoke('acme', 'cancel', 'order-1');

    expect(acme.buildContext).toHaveBeenCalledTimes(2);
  });

  test('rejects an absent capability without building a context', async () => {
    const { globex, router } = makeRouter();

    const result = router.invoke('globex', 'cancel', 'order-1');

    await expect(result).rejects.toThrow(CapabilityNotSupportedError);
    await expect(result).rejects.toMatchObject({
      variant: 'globex',
      capability: 'cancel',
    });
    expect(globex.buildContext).not.toHaveBeenCalled();
  });

  test('propagates a failure to build the context', async () => {
    const failure = new Error('Config profile unavailable');
    const adapter: Adapter<never, Deps, Signatures> = {
      buildContext: async () => Promise.reject(failure),
      capabilities: { quote: async () => ({ total: 0 }) },
    };
    const router = createRouter({
      registry: { acme: adapter, globex: makeGlobex().adapter },
      contextDeps,
    });

    await expect(router.invoke('acme', 'quote', 1)).rejects.toBe(failure);
  });

  test('requires an adapter for every variant', () => {
    const { adapter } = makeAcme();

    // @ts-expect-error The registry has no adapter for globex.
    const registry: Registry<Variant, Deps, Signatures> = { acme: adapter };

    expect(registry.acme).toBe(adapter);
  });
});
