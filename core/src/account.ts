import { assert, unreachable } from './assert.ts';
import type { CommandName, EventName, InvariantName } from './vocabulary.ts';

type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type MemberId = Brand<string, 'MemberId'>;
export type OrderId = Brand<string, 'OrderId'>;
export type SpendId = Brand<string, 'SpendId'>;
export type RewardId = Brand<string, 'RewardId'>;
// An ISO 8601 UTC string, because the core is deterministic and cannot use `Date`.
export type Timestamp = Brand<string, 'Timestamp'>;
export type Points = Brand<number, 'Points'>;
export type PurchaseAmount = Brand<number, 'PurchaseAmount'>;
export type EarnRate = Brand<number, 'EarnRate'>;

const isIdentifier = (value: string): boolean => value.length > 0;
const isWholeNumber = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const parseMemberId = (value: string): MemberId | undefined =>
  isIdentifier(value) ? (value as MemberId) : undefined;
export const parseOrderId = (value: string): OrderId | undefined =>
  isIdentifier(value) ? (value as OrderId) : undefined;
export const parseSpendId = (value: string): SpendId | undefined =>
  isIdentifier(value) ? (value as SpendId) : undefined;
export const parseRewardId = (value: string): RewardId | undefined =>
  isIdentifier(value) ? (value as RewardId) : undefined;
export const parseTimestamp = (value: string): Timestamp | undefined =>
  TIMESTAMP.test(value) ? (value as Timestamp) : undefined;
export const parsePoints = (value: number): Points | undefined =>
  isWholeNumber(value) ? (value as Points) : undefined;
export const parsePurchaseAmount = (
  value: number,
): PurchaseAmount | undefined =>
  isWholeNumber(value) ? (value as PurchaseAmount) : undefined;
export const parseEarnRate = (value: number): EarnRate | undefined =>
  isWholeNumber(value) && value > 0 ? (value as EarnRate) : undefined;

export type Account = {
  readonly status: 'open';
  readonly memberId: MemberId;
  readonly openedAt: Timestamp;
  readonly balance: Points;
};

// A stream with no events has no account.
export type AccountState = Account | undefined;

// A missing or extra name is a compile error, so the unions cannot drift from the vocabulary.
type Variants<
  Name extends string,
  Fields extends Record<Name, object> &
    Record<Exclude<keyof Fields, Name>, never>,
> = { [Key in Name]: { readonly type: Key } & Fields[Key] }[Name];

export type Command = Variants<
  CommandName,
  {
    readonly open_account: {
      readonly memberId: MemberId;
      readonly openedAt: Timestamp;
    };
    readonly earn_points: {
      readonly orderId: OrderId;
      readonly purchaseAmount: PurchaseAmount;
      readonly earnRate: EarnRate;
    };
    readonly spend_points: {
      readonly spendId: SpendId;
      readonly rewardId: RewardId;
      readonly points: Points;
    };
  }
>;

export type Event = Variants<
  EventName,
  {
    readonly account_opened: {
      readonly memberId: MemberId;
      readonly openedAt: Timestamp;
    };
    readonly points_earned: {
      readonly orderId: OrderId;
      readonly purchaseAmount: PurchaseAmount;
      readonly earnRate: EarnRate;
      readonly points: Points;
    };
    readonly points_spent: {
      readonly spendId: SpendId;
      readonly rewardId: RewardId;
      readonly points: Points;
    };
  }
>;

export type Rejection = { readonly invariant: InvariantName };

export type Decision =
  | { readonly outcome: 'approved'; readonly events: readonly [Event] }
  | { readonly outcome: 'rejected'; readonly rejection: Rejection };

type CommandOf<Name extends CommandName> = Extract<Command, { type: Name }>;

export const initialState: AccountState = undefined;

export const decide = (state: AccountState, command: Command): Decision => {
  assert(
    state === undefined || isWholeNumber(state.balance),
    'Balance is not a whole number of points before the command',
  );

  switch (command.type) {
    case 'open_account':
      return openAccount(state, command);
    case 'earn_points':
      return earnPoints(state, command);
    case 'spend_points':
      return spendPoints(state, command);
    default:
      return unreachable(command, 'Unhandled account command');
  }
};

export const evolve = (state: AccountState, event: Event): AccountState => {
  switch (event.type) {
    case 'account_opened':
      assert(state === undefined, 'Account opened on a stream that has one');
      return {
        status: 'open',
        memberId: event.memberId,
        openedAt: event.openedAt,
        balance: requirePoints(0, 'Opening balance is not zero'),
      };
    case 'points_earned':
      assert(state !== undefined, 'Points earned on a stream with no account');
      return {
        ...state,
        balance: requirePoints(
          state.balance + event.points,
          'Balance is beyond a safe whole number after the earn',
        ),
      };
    case 'points_spent':
      assert(state !== undefined, 'Points spent on a stream with no account');
      return {
        ...state,
        balance: requirePoints(
          state.balance - event.points,
          'Balance is negative after the spend',
        ),
      };
    default:
      return unreachable(event, 'Unhandled account event');
  }
};

const approve = (event: Event): Decision => ({
  outcome: 'approved',
  events: [event],
});

const reject = (invariant: InvariantName): Decision => ({
  outcome: 'rejected',
  rejection: { invariant },
});

const requirePoints = (value: number, message: string): Points => {
  const points = parsePoints(value);
  assert(points !== undefined, message);
  return points;
};

const openAccount = (
  state: AccountState,
  command: CommandOf<'open_account'>,
): Decision => {
  if (state !== undefined) return reject('account_opens_once');

  return approve({
    type: 'account_opened',
    memberId: command.memberId,
    openedAt: command.openedAt,
  });
};

const earnPoints = (
  state: AccountState,
  command: CommandOf<'earn_points'>,
): Decision => {
  if (state === undefined) return reject('points_need_an_account');

  const points = requirePoints(
    Math.floor((command.purchaseAmount * command.earnRate) / 100),
    'Earned points are beyond a safe whole number',
  );
  if (points === 0) return reject('points_move_in_positive_amounts');
  assert(
    isWholeNumber(state.balance + points),
    'Balance is beyond a safe whole number after the earn',
  );

  return approve({
    type: 'points_earned',
    orderId: command.orderId,
    purchaseAmount: command.purchaseAmount,
    earnRate: command.earnRate,
    points,
  });
};

const spendPoints = (
  state: AccountState,
  command: CommandOf<'spend_points'>,
): Decision => {
  if (state === undefined) return reject('points_need_an_account');
  if (command.points === 0) return reject('points_move_in_positive_amounts');
  if (command.points > state.balance) return reject('balance_never_negative');

  return approve({
    type: 'points_spent',
    spendId: command.spendId,
    rewardId: command.rewardId,
    points: command.points,
  });
};
