import type { ConfigReader } from '@loyalty/config';
import type { AccountGate, AccountRecorded } from '@loyalty/gate';
import type {
  BalanceResponse,
  EarnPointsRequest,
  OpenAccountRequest,
  ReadBalanceRequest,
  SpendPointsRequest,
} from '@loyalty/schema';

// The arguments a capability takes after the adapter's context and what it resolves to.
export type CapabilitySignature = {
  readonly args: readonly unknown[];
  readonly result: unknown;
};

export type SignatureMap = Readonly<Record<string, CapabilitySignature>>;

// A replayed write appended nothing, because the account already holds its idempotency key.
export type RecordedBalance = {
  readonly outcome: AccountRecorded['outcome'];
  readonly balance: BalanceResponse;
};

// One entry per capability, typed from `@loyalty/schema`. An adapter offers any subset of them.
export type CapabilitySignatures = {
  readonly openAccount: {
    readonly args: readonly [request: OpenAccountRequest];
    readonly result: RecordedBalance;
  };
  readonly earnPoints: {
    readonly args: readonly [request: EarnPointsRequest];
    readonly result: RecordedBalance;
  };
  readonly spendPoints: {
    readonly args: readonly [request: SpendPointsRequest];
    readonly result: RecordedBalance;
  };
  readonly readBalance: {
    readonly args: readonly [request: ReadBalanceRequest];
    readonly result: BalanceResponse;
  };
};

// What the router hands to every adapter's buildContext. Built once per container, not per request.
export type ContextDeps = {
  readonly accountGate: AccountGate;
  readonly config: ConfigReader;
  readonly clock: () => Date;
};

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
