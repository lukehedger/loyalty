import {
  type Account,
  assert,
  type Command,
  type CommandName,
  decide,
  type Event,
  type EventName,
  evolve,
  type InvariantName,
  initialState,
  parseEarnRate,
  parseMemberId,
  parseOrderId,
  parsePoints,
  parsePurchaseAmount,
  parseRewardId,
  parseSpendId,
  parseTimestamp,
  unreachable,
} from '@loyalty/core';
import {
  ConflictError,
  DecisionRejectedError,
  ValidationError,
} from '@loyalty/errors';
import {
  createDocumentClient,
  createDynamoDbEventLog,
  type EventLog,
} from '@loyalty/store';
import { z } from 'zod';
import { createEventSourcedGate } from './event-sourcing.ts';

// The core's parse function stays the one constructor of each brand.
const branded =
  <Input, Output>(
    parse: (value: Input) => Output | undefined,
    message: string,
  ) =>
  (value: Input, context: z.RefinementCtx): Output => {
    const parsed = parse(value);
    if (parsed !== undefined) return parsed;

    context.addIssue({ code: 'custom', message });
    return z.NEVER;
  };

const memberIdSchema = z
  .string()
  .transform(branded(parseMemberId, 'Member ID is empty'));
const orderIdSchema = z
  .string()
  .transform(branded(parseOrderId, 'Order ID is empty'));
const spendIdSchema = z
  .string()
  .transform(branded(parseSpendId, 'Spend ID is empty'));
const rewardIdSchema = z
  .string()
  .transform(branded(parseRewardId, 'Reward ID is empty'));
const timestampSchema = z
  .string()
  .transform(branded(parseTimestamp, 'Timestamp is not an ISO 8601 UTC time'));
const pointsSchema = z
  .number()
  .transform(branded(parsePoints, 'Points are not a whole number'));
const purchaseAmountSchema = z
  .number()
  .transform(
    branded(parsePurchaseAmount, 'Purchase amount is not a whole number'),
  );
const earnRateSchema = z
  .number()
  .transform(branded(parseEarnRate, 'Earn rate is not a whole number above 0'));

type Variant<Union, Name> = Extract<Union, { readonly type: Name }>;

// Keyed by the vocabulary, so a command or event the core adds without a schema fails to compile.
const commandSchemas = {
  open_account: z.object({
    type: z.literal('open_account'),
    memberId: memberIdSchema,
    openedAt: timestampSchema,
  }),
  earn_points: z.object({
    type: z.literal('earn_points'),
    orderId: orderIdSchema,
    purchaseAmount: purchaseAmountSchema,
    earnRate: earnRateSchema,
  }),
  spend_points: z.object({
    type: z.literal('spend_points'),
    spendId: spendIdSchema,
    rewardId: rewardIdSchema,
    points: pointsSchema,
  }),
} satisfies { [Name in CommandName]: z.ZodType<Variant<Command, Name>> };

const eventSchemas = {
  account_opened: z.object({
    type: z.literal('account_opened'),
    memberId: memberIdSchema,
    openedAt: timestampSchema,
  }),
  points_earned: z.object({
    type: z.literal('points_earned'),
    orderId: orderIdSchema,
    purchaseAmount: purchaseAmountSchema,
    earnRate: earnRateSchema,
    points: pointsSchema,
  }),
  points_spent: z.object({
    type: z.literal('points_spent'),
    spendId: spendIdSchema,
    rewardId: rewardIdSchema,
    points: pointsSchema,
  }),
} satisfies { [Name in EventName]: z.ZodType<Variant<Event, Name>> };

const accountCommandSchema = z.discriminatedUnion('type', [
  commandSchemas.open_account,
  commandSchemas.earn_points,
  commandSchemas.spend_points,
]);

const accountEventSchema = z.discriminatedUnion('type', [
  eventSchemas.account_opened,
  eventSchemas.points_earned,
  eventSchemas.points_spent,
]);

const applySchema = z.object({
  memberId: memberIdSchema,
  command: accountCommandSchema,
});

const REJECTION_MESSAGES: Readonly<Record<InvariantName, string>> = {
  account_opens_once: 'The member already has an account',
  balance_matches_history: 'The command does not match the account history',
  balance_never_negative: 'The spend is greater than the balance',
  earn_matches_rate: 'The earn does not match the earn rate',
  points_move_in_positive_amounts: 'The earn or spend moves no points',
  points_need_an_account: 'The member has no account',
};

const CONFLICT_MESSAGE =
  'The account changed while the request ran. Retry the request';

// The command with plain values. The gate checks each value into its core brand.
export type AccountCommand = z.input<typeof accountCommandSchema>;

export type AccountApply = {
  readonly memberId: string;
  readonly command: AccountCommand;
};

// A replay appended nothing because the stream already holds the command's idempotency key.
export type AccountRecorded = {
  readonly outcome: 'approved' | 'replayed';
  readonly account: Account;
};

// Resolves to the account or throws a classified error from @loyalty/errors.
export type AccountGate = {
  readonly apply: (input: AccountApply) => Promise<AccountRecorded>;
  readonly load: (memberId: string) => Promise<Account | undefined>;
};

export type AccountGateDeps = {
  readonly eventLog: EventLog<Event>;
};

export type DynamoDbAccountGateDeps = {
  readonly tableName: string;
  readonly clock: () => Date;
};

// Serialisation drops the brands, so every event read back is checked into them again.
export const parseAccountEvent = (value: unknown): Event =>
  accountEventSchema.parse(value);

// Prefixed by kind, so an order ID and a spend ID with the same value never collide on one stream.
const idempotencyKeyOf = (command: Command): string | undefined => {
  switch (command.type) {
    case 'open_account':
      return undefined;
    case 'earn_points':
      return `ORDER#${command.orderId}`;
    case 'spend_points':
      return `SPEND#${command.spendId}`;
    default:
      return unreachable(command, 'Unhandled account command');
  }
};

const parseApply = (input: AccountApply): z.output<typeof applySchema> => {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(parsed.error.issues);

  return parsed.data;
};

export const createAccountGate = (deps: AccountGateDeps): AccountGate => {
  const gate = createEventSourcedGate({
    eventLog: deps.eventLog,
    initialState,
    decide,
    evolve,
  });

  const apply = async (input: AccountApply): Promise<AccountRecorded> => {
    const { memberId, command } = parseApply(input);
    assert(
      command.type !== 'open_account' || command.memberId === memberId,
      'Account opened on the stream of another member',
    );

    const result = await gate.apply({
      streamId: memberId,
      command,
      idempotencyKey: idempotencyKeyOf(command),
    });

    switch (result.outcome) {
      case 'approved':
      case 'replayed':
        assert(
          result.state !== undefined,
          'A recorded command left no account',
        );
        return { outcome: result.outcome, account: result.state };
      case 'rejected':
        throw new DecisionRejectedError(
          result.rejection.invariant,
          REJECTION_MESSAGES[result.rejection.invariant],
        );
      case 'conflict':
        throw new ConflictError(CONFLICT_MESSAGE);
      default:
        return unreachable(result, 'Unhandled gate outcome');
    }
  };

  const load = async (memberId: string): Promise<Account | undefined> => {
    const parsed = memberIdSchema.safeParse(memberId);
    if (!parsed.success) throw new ValidationError(parsed.error.issues);

    return gate.load(parsed.data);
  };

  return { apply, load };
};

export const createDynamoDbAccountGate = (
  deps: DynamoDbAccountGateDeps,
): AccountGate =>
  createAccountGate({
    eventLog: createDynamoDbEventLog({
      client: createDocumentClient(),
      tableName: deps.tableName,
      entity: 'ACCOUNT',
      clock: deps.clock,
      parseEvent: parseAccountEvent,
    }),
  });
