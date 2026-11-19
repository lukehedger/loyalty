import { describe, expect, test } from 'bun:test';
import { createInMemoryRecordStore, type RecordStore } from '@loyalty/store';
import { createRecordGate, type Transition } from '../index.ts';

type Counter = { readonly status: 'open' | 'closed'; readonly count: number };
type CounterCommand =
  | { readonly type: 'open' }
  | { readonly type: 'increment'; readonly by: number }
  | { readonly type: 'close' };
type CounterRejection = { readonly reason: 'already_opened' | 'not_open' };

const decide = (
  current: Counter | undefined,
  command: CounterCommand,
): Transition<Counter, CounterRejection> => {
  if (command.type === 'open') {
    if (current !== undefined) {
      return { outcome: 'rejected', rejection: { reason: 'already_opened' } };
    }
    return { outcome: 'approved', state: { status: 'open', count: 0 } };
  }
  if (current?.status !== 'open') {
    return { outcome: 'rejected', rejection: { reason: 'not_open' } };
  }
  if (command.type === 'increment') {
    return {
      outcome: 'approved',
      state: { ...current, count: current.count + command.by },
    };
  }
  return { outcome: 'approved', state: { ...current, status: 'closed' } };
};

const clock = (): Date => new Date('2026-01-01T00:00:00.000Z');

const createGate = (recordStore: RecordStore<Counter>) =>
  createRecordGate({ recordStore, decide });

describe('record gate', () => {
  test('writes the state of an approved transition', async () => {
    const recordStore = createInMemoryRecordStore<Counter>({ clock });
    const gate = createGate(recordStore);
    await gate.apply({ id: 'counter-1', command: { type: 'open' } });

    const result = await gate.apply({
      id: 'counter-1',
      command: { type: 'increment', by: 3 },
    });

    expect(result).toEqual({
      outcome: 'approved',
      state: { status: 'open', count: 3 },
    });
    expect((await recordStore.read('counter-1'))?.version).toBe(2);
    expect(await gate.load('counter-1')).toEqual({ status: 'open', count: 3 });
  });

  test('returns a rejection unchanged and writes nothing', async () => {
    const recordStore = createInMemoryRecordStore<Counter>({ clock });

    const result = await createGate(recordStore).apply({
      id: 'counter-1',
      command: { type: 'close' },
    });

    expect(result).toEqual({
      outcome: 'rejected',
      rejection: { reason: 'not_open' },
    });
    expect(await recordStore.read('counter-1')).toBeUndefined();
  });

  test('rejects a repeated create through the core', async () => {
    const recordStore = createInMemoryRecordStore<Counter>({ clock });
    const gate = createGate(recordStore);
    await gate.apply({ id: 'counter-1', command: { type: 'open' } });

    const result = await gate.apply({
      id: 'counter-1',
      command: { type: 'open' },
    });

    expect(result).toEqual({
      outcome: 'rejected',
      rejection: { reason: 'already_opened' },
    });
    expect((await recordStore.read('counter-1'))?.version).toBe(1);
  });

  test('reports a conflict when another write lands after the read', async () => {
    const recordStore = createInMemoryRecordStore<Counter>({ clock });
    await createGate(recordStore).apply({
      id: 'counter-1',
      command: { type: 'open' },
    });
    const racingRecordStore: RecordStore<Counter> = {
      read: async (id) => {
        const stored = await recordStore.read(id);
        if (stored !== undefined) {
          await recordStore.write(
            id,
            { ...stored.value, status: 'closed' },
            { status: stored.value.status, version: stored.version },
          );
        }
        return stored;
      },
      write: recordStore.write,
    };

    const result = await createGate(racingRecordStore).apply({
      id: 'counter-1',
      command: { type: 'increment', by: 1 },
    });

    expect(result).toEqual({ outcome: 'conflict' });
    expect(await createGate(recordStore).load('counter-1')).toEqual({
      status: 'closed',
      count: 0,
    });
  });

  test('loads a missing record as undefined', async () => {
    const recordStore = createInMemoryRecordStore<Counter>({ clock });

    expect(await createGate(recordStore).load('counter-1')).toBeUndefined();
  });
});
