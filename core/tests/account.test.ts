import { describe, expect, test } from 'bun:test';
import {
  type AccountState,
  AssertionError,
  type Command,
  type Decision,
  decide,
  type Event,
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
} from '../src/index.ts';
import { defined } from './account-arbitraries.ts';

const memberId = defined(parseMemberId('member-1'));
const openedAt = defined(parseTimestamp('2026-01-01T09:30:00.000Z'));
const points = (value: number) => defined(parsePoints(value));

const accountOpened: Event = { type: 'account_opened', memberId, openedAt };

const pointsEarned = (value: number): Event => ({
  type: 'points_earned',
  orderId: defined(parseOrderId('order-1')),
  purchaseAmount: defined(parsePurchaseAmount(value)),
  earnRate: defined(parseEarnRate(100)),
  points: points(value),
});

const pointsSpent = (value: number): Event => ({
  type: 'points_spent',
  spendId: defined(parseSpendId('spend-1')),
  rewardId: defined(parseRewardId('reward-1')),
  points: points(value),
});

const accountWith = (balance: number): AccountState =>
  [accountOpened, pointsEarned(balance)].reduce(evolve, initialState);

const earn = (purchaseAmount: number, earnRate: number): Command => ({
  type: 'earn_points',
  orderId: defined(parseOrderId('order-2')),
  purchaseAmount: defined(parsePurchaseAmount(purchaseAmount)),
  earnRate: defined(parseEarnRate(earnRate)),
});

const spend = (value: number): Command => ({
  type: 'spend_points',
  spendId: defined(parseSpendId('spend-2')),
  rewardId: defined(parseRewardId('reward-2')),
  points: points(value),
});

const rejectedUnder = (invariant: InvariantName): Decision => ({
  outcome: 'rejected',
  rejection: { invariant },
});

describe('parsing', () => {
  test.each([
    ['member ID', parseMemberId],
    ['order ID', parseOrderId],
    ['spend ID', parseSpendId],
    ['reward ID', parseRewardId],
  ])('accepts a %s with at least one character', (_name, parse) => {
    expect<string | undefined>(parse('a')).toBe('a');
    expect(parse('')).toBeUndefined();
  });

  test('accepts an ISO 8601 UTC timestamp with milliseconds only', () => {
    expect<string | undefined>(parseTimestamp('2026-01-01T09:30:00.000Z')).toBe(
      '2026-01-01T09:30:00.000Z',
    );
    for (const value of [
      '2026-01-01T09:30:00Z',
      '2026-01-01T09:30:00.000+01:00',
      ' 2026-01-01T09:30:00.000Z',
      '2026-01-01T09:30:00.000Z ',
      '12026-01-01T09:30:00.000Z',
      '2026-001-01T09:30:00.000Z',
      '2026-01-001T09:30:00.000Z',
      '2026-01-01T009:30:00.000Z',
      '2026-01-01T09:030:00.000Z',
      '2026-01-01T09:30:000.000Z',
      '2026-01-01T09:30:00.0000Z',
      '2026-01-01 09:30:00.000Z',
      '2026/01/01T09:30:00.000Z',
      '2026-01-01T09-30-00.000Z',
      '2026-01-01T09:30:00,000Z',
      'abcd-ef-ghTij:kl:mn.opqZ',
    ]) {
      expect(parseTimestamp(value)).toBeUndefined();
    }
  });

  test('accepts points and purchase amounts that are safe whole numbers of zero or more', () => {
    for (const parse of [parsePoints, parsePurchaseAmount]) {
      expect<number | undefined>(parse(0)).toBe(0);
      expect<number | undefined>(parse(Number.MAX_SAFE_INTEGER)).toBe(
        Number.MAX_SAFE_INTEGER,
      );
      expect(parse(-1)).toBeUndefined();
      expect(parse(1.5)).toBeUndefined();
      expect(parse(Number.MAX_SAFE_INTEGER + 1)).toBeUndefined();
    }
  });

  test('accepts an earn rate that is a whole number of one or more', () => {
    expect<number | undefined>(parseEarnRate(1)).toBe(1);
    expect(parseEarnRate(0)).toBeUndefined();
    expect(parseEarnRate(1.5)).toBeUndefined();
  });
});

describe('decide', () => {
  test('opens an account on an empty stream', () => {
    expect(
      decide(initialState, { type: 'open_account', memberId, openedAt }),
    ).toEqual({ outcome: 'approved', events: [accountOpened] });
  });

  test('rejects a second open under account_opens_once', () => {
    expect(
      decide(accountWith(1), { type: 'open_account', memberId, openedAt }),
    ).toEqual(rejectedUnder('account_opens_once'));
  });

  test('rejects an earn or a spend on an empty stream under points_need_an_account', () => {
    expect(decide(initialState, earn(1000, 1))).toEqual(
      rejectedUnder('points_need_an_account'),
    );
    expect(decide(initialState, spend(1))).toEqual(
      rejectedUnder('points_need_an_account'),
    );
  });

  test('awards floor(purchaseAmount × earnRate / 100) points and records the command', () => {
    expect(decide(accountWith(1), earn(1999, 3))).toEqual({
      outcome: 'approved',
      events: [
        {
          type: 'points_earned',
          orderId: defined(parseOrderId('order-2')),
          purchaseAmount: defined(parsePurchaseAmount(1999)),
          earnRate: defined(parseEarnRate(3)),
          points: points(59),
        },
      ],
    });
  });

  test('awards one point for exactly one pound at one point per pound', () => {
    const decision = decide(accountWith(1), earn(100, 1));
    expect(decision.outcome === 'approved' && decision.events[0]).toMatchObject(
      { points: 1 },
    );
  });

  test('rejects an earn that computes zero points under points_move_in_positive_amounts', () => {
    expect(decide(accountWith(1), earn(99, 1))).toEqual(
      rejectedUnder('points_move_in_positive_amounts'),
    );
  });

  test('rejects a spend of zero points under points_move_in_positive_amounts', () => {
    expect(decide(accountWith(1), spend(0))).toEqual(
      rejectedUnder('points_move_in_positive_amounts'),
    );
  });

  test('spends the whole balance', () => {
    expect(decide(accountWith(5), spend(5))).toEqual({
      outcome: 'approved',
      events: [
        {
          type: 'points_spent',
          spendId: defined(parseSpendId('spend-2')),
          rewardId: defined(parseRewardId('reward-2')),
          points: points(5),
        },
      ],
    });
  });

  test('rejects a spend greater than the balance under balance_never_negative', () => {
    expect(decide(accountWith(5), spend(6))).toEqual(
      rejectedUnder('balance_never_negative'),
    );
  });

  test('fails an assertion when the earned points are beyond a safe whole number', () => {
    expect(() =>
      decide(accountWith(1), earn(Number.MAX_SAFE_INTEGER, 1000)),
    ).toThrow(
      new AssertionError('Earned points are beyond a safe whole number'),
    );
  });

  test('fails an assertion when an earn would take the balance beyond a safe whole number', () => {
    expect(() =>
      decide(accountWith(Number.MAX_SAFE_INTEGER), earn(100, 1)),
    ).toThrow(
      new AssertionError(
        'Balance is beyond a safe whole number after the earn',
      ),
    );
  });
});

describe('evolve', () => {
  test('opens the account with a balance of zero', () => {
    expect(evolve(initialState, accountOpened)).toEqual({
      status: 'open',
      memberId,
      openedAt,
      balance: points(0),
    });
  });

  test('adds earned points and subtracts spent points', () => {
    expect(
      [accountOpened, pointsEarned(7), pointsSpent(3)].reduce(
        evolve,
        initialState,
      ),
    ).toMatchObject({ balance: 4 });
  });

  test.each([
    [
      'an account opened on a stream that has one',
      accountWith(1),
      accountOpened,
      'Account opened on a stream that has one',
    ],
    [
      'points earned on an empty stream',
      initialState,
      pointsEarned(1),
      'Points earned on a stream with no account',
    ],
    [
      'points spent on an empty stream',
      initialState,
      pointsSpent(1),
      'Points spent on a stream with no account',
    ],
    [
      'a spend greater than the balance',
      accountWith(1),
      pointsSpent(2),
      'Balance is negative after the spend',
    ],
    [
      'an earn beyond a safe whole number',
      accountWith(Number.MAX_SAFE_INTEGER),
      pointsEarned(1),
      'Balance is beyond a safe whole number after the earn',
    ],
  ])('fails an assertion on %s', (_name, state, event, message) => {
    expect(() => evolve(state, event)).toThrow(new AssertionError(message));
  });
});
