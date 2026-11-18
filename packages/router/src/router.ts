import type { Adapter, SignatureMap } from '@loyalty/adapters';
import { CapabilityNotSupportedError } from '@loyalty/errors';

export type Registry<
  TVariant extends string,
  TDeps,
  TSignatures extends SignatureMap,
> = Readonly<Record<TVariant, Adapter<unknown, TDeps, TSignatures>>>;

export type RouterDeps<
  TVariant extends string,
  TDeps,
  TSignatures extends SignatureMap,
> = {
  readonly registry: Registry<TVariant, TDeps, TSignatures>;
  readonly contextDeps: TDeps;
};

export type Router<
  TVariant extends string,
  TSignatures extends SignatureMap,
> = {
  readonly invoke: <TCapability extends keyof TSignatures & string>(
    variant: TVariant,
    capability: TCapability,
    ...args: TSignatures[TCapability]['args']
  ) => Promise<TSignatures[TCapability]['result']>;
};

export const createRouter = <
  TVariant extends string,
  TDeps,
  TSignatures extends SignatureMap,
>(
  deps: RouterDeps<TVariant, TDeps, TSignatures>,
): Router<TVariant, TSignatures> => ({
  invoke: async (variant, capability, ...args) => {
    const adapter = deps.registry[variant];
    const run = adapter.capabilities[capability];
    // Checked before buildContext, so an unsupported request does no I/O.
    if (!run) throw new CapabilityNotSupportedError(variant, capability);

    const context = await adapter.buildContext(deps.contextDeps);

    return run(context, ...args);
  },
});
