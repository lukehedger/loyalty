// The arguments a capability takes after the adapter's context and what it resolves to.
export type CapabilitySignature = {
  readonly args: readonly unknown[];
  readonly result: unknown;
};

export type SignatureMap = Readonly<Record<string, CapabilitySignature>>;

// One entry per capability, typed from `@loyalty/schema`. An adapter offers any subset of them.
export type CapabilitySignatures = Readonly<Record<never, CapabilitySignature>>;

// What the router hands to every adapter's buildContext, such as the gate and config.
export type ContextDeps = Readonly<Record<never, never>>;

// Method syntax keeps the context parameter bivariant, so adapters with different contexts share one registry.
export type Capability<TContext, TSignature extends CapabilitySignature> = {
  run(
    context: TContext,
    ...args: TSignature['args']
  ): Promise<TSignature['result']>;
}['run'];

export type Capabilities<
  TContext,
  TSignatures extends SignatureMap = CapabilitySignatures,
> = {
  readonly [K in keyof TSignatures]?: Capability<TContext, TSignatures[K]>;
};

export type Adapter<
  TContext,
  TDeps = ContextDeps,
  TSignatures extends SignatureMap = CapabilitySignatures,
> = {
  readonly buildContext: (deps: TDeps) => Promise<TContext>;
  readonly capabilities: Capabilities<TContext, TSignatures>;
};
