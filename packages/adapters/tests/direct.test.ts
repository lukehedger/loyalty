import { describe, expect, test } from 'bun:test';
import type { ConfigReader } from '@loyalty/config';
import { NotFoundError } from '@loyalty/errors';
import {
  type AccountApply,
  type AccountGate,
  type AccountGateDeps,
  createAccountGate,
} from '@loyalty/gate';
import { type ContextDeps, direct } from '../src/index.ts';

type EventLog = AccountGateDeps['eventLog'];
type StoredEvents = Awaited<ReturnType<EventLog['read']>>['events'];

const inlineEventLog = (): EventLog => {
  const streams = new Map<string, StoredEvents>();

  return {
    read: async (streamId) => {
      const events = streams.get(streamId) ?? [];
      return { version: events.length, events };
    },
    append: async (streamId, { idempotencyKey, events }) => {
      const stored = streams.get(streamId) ?? [];
      const appended = events.map((event, index) => ({
        sequence: stored.length + index + 1,
        recordedAt: '2026-01-01T00:00:00.000Z',
        idempotencyKey,
        event,
      }));
      streams.set(streamId, [...stored, ...appended]);
      return { outcome: 'appended', version: stored.length + events.length };
    },
  };
};

const recordingGate = () => {
  const applied: AccountApply[] = [];
  const gate = createAccountGate({ eventLog: inlineEventLog() });
  const accountGate: AccountGate = {
    apply: (input) => {
      applied.push(input);
      return gate.apply(input);
    },
    load: gate.load,
  };

  return { accountGate, applied };
};

const configWithEarnRate = (earnRate: number): ConfigReader => ({
  read: async (profile) => profile.schema.parse({ earnRate }),
});

const createContext = async () => {
  const { accountGate, applied } = recordingGate();
  const deps: ContextDeps = {
    accountGate,
    config: configWithEarnRate(3),
    clock: () => new Date('2026-01-01T09:30:00.000Z'),
  };

  return { applied, context: await direct.buildContext(deps) };
};

const capabilities = () => {
  const { openAccount, earnPoints, spendPoints, readBalance } =
    direct.capabilities;
  if (!openAccount || !earnPoints || !spendPoints || !readBalance) {
    throw new Error('The direct adapter offers every account capability');
  }

  return { openAccount, earnPoints, spendPoints, readBalance };
};

describe('direct adapter', () => {
  test('opens an account at the time the clock gives', async () => {
    const { applied, context } = await createContext();

    const opened = await capabilities().openAccount(context, {
      memberId: 'member-1',
    });

    expect(opened).toEqual({
      outcome: 'approved',
      balance: { memberId: 'member-1', balance: 0 },
    });
    expect(applied[0]?.command).toEqual({
      type: 'open_account',
      memberId: 'member-1',
      openedAt: '2026-01-01T09:30:00.000Z',
    });
  });

  test('earns at the earn rate read from config', async () => {
    const { applied, context } = await createContext();
    const { openAccount, earnPoints } = capabilities();
    await openAccount(context, { memberId: 'member-1' });

    const earned = await earnPoints(context, {
      memberId: 'member-1',
      orderId: 'order-1',
      purchaseAmount: 1000,
    });

    expect(earned).toEqual({
      outcome: 'approved',
      balance: { memberId: 'member-1', balance: 30 },
    });
    expect(applied[1]?.command).toEqual({
      type: 'earn_points',
      orderId: 'order-1',
      purchaseAmount: 1000,
      earnRate: 3,
    });
  });

  test('spends from the balance and reports a replay', async () => {
    const { context } = await createContext();
    const { openAccount, earnPoints, spendPoints } = capabilities();
    await openAccount(context, { memberId: 'member-1' });
    await earnPoints(context, {
      memberId: 'member-1',
      orderId: 'order-1',
      purchaseAmount: 1000,
    });
    const spend = {
      memberId: 'member-1',
      spendId: 'spend-1',
      rewardId: 'reward-1',
      points: 12,
    };

    expect(await spendPoints(context, spend)).toEqual({
      outcome: 'approved',
      balance: { memberId: 'member-1', balance: 18 },
    });
    expect(await spendPoints(context, spend)).toEqual({
      outcome: 'replayed',
      balance: { memberId: 'member-1', balance: 18 },
    });
  });

  test('reads the balance of an account', async () => {
    const { context } = await createContext();
    const { openAccount, readBalance } = capabilities();
    await openAccount(context, { memberId: 'member-1' });

    expect(await readBalance(context, { memberId: 'member-1' })).toEqual({
      memberId: 'member-1',
      balance: 0,
    });
  });

  test('reports a member with no account as not found', async () => {
    const { context } = await createContext();

    await expect(
      capabilities().readBalance(context, { memberId: 'member-1' }),
    ).rejects.toThrow(NotFoundError);
  });
});
