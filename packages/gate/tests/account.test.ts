import { describe, expect, test } from 'bun:test';
import {
  type Account,
  AssertionError,
  type Event,
  parseMemberId,
  parsePoints,
  parseTimestamp,
} from '@loyalty/core';
import {
  ConflictError,
  DecisionRejectedError,
  ValidationError,
} from '@loyalty/errors';
import {
  createDynamoDbEventLog,
  createInMemoryEventLog,
  type EventLog,
  type EventLogClient,
} from '@loyalty/store';
import {
  type AccountCommand,
  createAccountGate,
  parseAccountEvent,
} from '../index.ts';

const clock = (): Date => new Date('2026-01-01T00:00:00.000Z');

const defined = <Value>(value: Value | undefined): Value => {
  if (value === undefined) throw new Error('Test value failed to parse');
  return value;
};

const points = (value: number) => defined(parsePoints(value));

const accountWith = (balance: number): Account => ({
  status: 'open',
  memberId: defined(parseMemberId('member-1')),
  openedAt: defined(parseTimestamp('2026-01-01T09:30:00.000Z')),
  balance: points(balance),
});

const openAccount: AccountCommand = {
  type: 'open_account',
  memberId: 'member-1',
  openedAt: '2026-01-01T09:30:00.000Z',
};

const earnPoints = (
  orderId: string,
  purchaseAmount: number,
): AccountCommand => ({
  type: 'earn_points',
  orderId,
  purchaseAmount,
  earnRate: 2,
});

const spendPoints = (spendId: string, points: number): AccountCommand => ({
  type: 'spend_points',
  spendId,
  rewardId: 'reward-1',
  points,
});

const createOpenAccount = async () => {
  const eventLog = createInMemoryEventLog<Event>({ clock });
  const gate = createAccountGate({ eventLog });
  await gate.apply({ memberId: 'member-1', command: openAccount });

  return { eventLog, gate };
};

describe('account gate', () => {
  test('opens an account with a zero balance', async () => {
    const gate = createAccountGate({
      eventLog: createInMemoryEventLog<Event>({ clock }),
    });

    expect(
      await gate.apply({ memberId: 'member-1', command: openAccount }),
    ).toEqual({ outcome: 'approved', account: accountWith(0) });
  });

  test('earns the points the earn rate gives and spends from the balance', async () => {
    const { gate } = await createOpenAccount();

    const earned = await gate.apply({
      memberId: 'member-1',
      command: earnPoints('order-1', 1050),
    });
    const spent = await gate.apply({
      memberId: 'member-1',
      command: spendPoints('spend-1', 5),
    });

    expect(earned.account.balance).toBe(points(21));
    expect(spent.account.balance).toBe(points(16));
    expect(await gate.load('member-1')).toEqual(accountWith(16));
  });

  test('replays a repeated order or spend without appending', async () => {
    const { eventLog, gate } = await createOpenAccount();
    await gate.apply({
      memberId: 'member-1',
      command: earnPoints('order-1', 500),
    });
    await gate.apply({
      memberId: 'member-1',
      command: spendPoints('spend-1', 4),
    });

    const earn = await gate.apply({
      memberId: 'member-1',
      command: earnPoints('order-1', 500),
    });
    const spend = await gate.apply({
      memberId: 'member-1',
      command: spendPoints('spend-1', 4),
    });

    expect(earn).toMatchObject({
      outcome: 'replayed',
      account: { balance: 6 },
    });
    expect(spend).toMatchObject({
      outcome: 'replayed',
      account: { balance: 6 },
    });
    expect((await eventLog.read('member-1')).version).toBe(3);
  });

  test('keys an earn and a spend apart when their IDs are equal', async () => {
    const { gate } = await createOpenAccount();
    await gate.apply({
      memberId: 'member-1',
      command: earnPoints('id-1', 500),
    });

    const spend = await gate.apply({
      memberId: 'member-1',
      command: spendPoints('id-1', 4),
    });

    expect(spend).toMatchObject({
      outcome: 'approved',
      account: { balance: 6 },
    });
  });

  test('throws a rejection as a decision error that names the invariant', async () => {
    const { gate } = await createOpenAccount();

    const spend = gate.apply({
      memberId: 'member-1',
      command: spendPoints('spend-1', 1),
    });

    await expect(spend).rejects.toThrow(DecisionRejectedError);
    await expect(spend).rejects.toMatchObject({
      code: 'balance_never_negative',
    });
  });

  test('throws a conflict when another write lands after the read', async () => {
    const { eventLog } = await createOpenAccount();
    const racingEventLog: EventLog<Event> = {
      read: async (streamId) => {
        const stream = await eventLog.read(streamId);
        await createAccountGate({ eventLog }).apply({
          memberId: 'member-1',
          command: earnPoints('order-2', 100),
        });
        return stream;
      },
      append: eventLog.append,
    };

    const earn = createAccountGate({ eventLog: racingEventLog }).apply({
      memberId: 'member-1',
      command: earnPoints('order-1', 100),
    });

    await expect(earn).rejects.toThrow(ConflictError);
  });

  test('throws a validation error for a value outside its brand', async () => {
    const { gate } = await createOpenAccount();

    const earn = gate.apply({
      memberId: 'member-1',
      command: earnPoints('order-1', -1),
    });

    await expect(earn).rejects.toThrow(ValidationError);
    await expect(gate.load('')).rejects.toThrow(ValidationError);
  });

  test('refuses to open an account on the stream of another member', async () => {
    const gate = createAccountGate({
      eventLog: createInMemoryEventLog<Event>({ clock }),
    });

    const open = gate.apply({ memberId: 'member-2', command: openAccount });

    await expect(open).rejects.toThrow(AssertionError);
  });

  test('loads a member with no account as undefined', async () => {
    const gate = createAccountGate({
      eventLog: createInMemoryEventLog<Event>({ clock }),
    });

    expect(await gate.load('member-1')).toBeUndefined();
  });
});

const eventRow = (
  sequence: number,
  event: unknown,
): Record<string, unknown> => ({
  PK: 'ACCOUNT#member-1',
  SK: `EVENT#${String(sequence).padStart(12, '0')}`,
  sequence,
  recordedAt: '2026-01-01T00:00:00.000Z',
  event,
});

const gateReading = (items: readonly Record<string, unknown>[]) => {
  const client: EventLogClient = { send: async () => ({ Items: items }) };

  return createAccountGate({
    eventLog: createDynamoDbEventLog({
      client,
      tableName: 'state-table',
      entity: 'ACCOUNT',
      clock,
      parseEvent: parseAccountEvent,
    }),
  });
};

describe('account events read back from DynamoDB', () => {
  test('replays parsed events into the account', async () => {
    const gate = gateReading([
      eventRow(1, {
        type: 'account_opened',
        memberId: 'member-1',
        openedAt: '2026-01-01T09:30:00.000Z',
      }),
      eventRow(2, {
        type: 'points_earned',
        orderId: 'order-1',
        purchaseAmount: 1000,
        earnRate: 1,
        points: 10,
      }),
    ]);

    expect(await gate.load('member-1')).toEqual(accountWith(10));
  });

  test.each([
    ['an unknown type', { type: 'points_doubled' }],
    [
      'negative points',
      { type: 'points_spent', spendId: 's', rewardId: 'r', points: -5 },
    ],
    [
      'a zero earn rate',
      {
        type: 'points_earned',
        orderId: 'o',
        purchaseAmount: 1,
        earnRate: 0,
        points: 0,
      },
    ],
  ])('fails loudly on an event with %s', async (_name, event) => {
    const gate = gateReading([eventRow(1, event)]);

    await expect(gate.load('member-1')).rejects.toThrow();
  });
});
