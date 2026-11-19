import {
  type CapabilitySignatures,
  createContextDeps,
  type DirectContextDeps,
} from '@loyalty/adapters';
import type { Variant } from '@loyalty/schema';
import { registry } from './registry.ts';
import { createRouter, type Router } from './router.ts';

export type AccountRouter = Router<Variant, CapabilitySignatures>;

// The narrowest router a handler needs, so its test fakes one capability.
export type CapabilityRouter<TCapability extends keyof CapabilitySignatures> = {
  readonly invoke: (
    variant: Variant,
    capability: TCapability,
    ...args: CapabilitySignatures[TCapability]['args']
  ) => Promise<CapabilitySignatures[TCapability]['result']>;
};

export type AccountRouterDeps = DirectContextDeps;

// The handler cannot reach the adapters, so the router builds their context deps. Call it once per container.
export const createAccountRouter = (deps: AccountRouterDeps): AccountRouter =>
  createRouter({ registry, contextDeps: createContextDeps(deps) });
