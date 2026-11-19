import type { ConfigReader } from '@loyalty/config';
import { createDynamoDbAccountGate } from '@loyalty/gate';
import type { ContextDeps } from './adapter.ts';

export type DirectContextDeps = {
  readonly tableName: string;
  readonly config: ConfigReader;
  readonly clock: () => Date;
};

// Call it once per container, so every request shares one gate and one DynamoDB client.
export const createContextDeps = (deps: DirectContextDeps): ContextDeps => ({
  accountGate: createDynamoDbAccountGate({
    tableName: deps.tableName,
    clock: deps.clock,
  }),
  config: deps.config,
  clock: deps.clock,
});
