import { describe, expect, test } from 'bun:test';
import { createInMemoryEventLog, type EventLog } from '@loyalty/store';
import {
  createEventSourcedGate,
  type Decision,
  type EventSourcedCommand,
} from '../src/index.ts';

type CounterState = {
  readonly status: 'unopened' | 'open' | 'closed';
  readonly count: number;
};
type CounterCommand =
  | { readonly type: 'open' }
  | { readonly type: 'increment'; readonly by: number }
  | { readonly type: 'close' };
type CounterEvent =
  | { readonly type: 'opened' }
  | { readonly type: 'incremented'; readonly by: number }
  | { readonly type: 'closed' };
type CounterRejection = { readonly reason: 'already_opened' | 'not_open' };

const initialState: CounterState = { status: 'unopened', count: 0 };

const decide = (
  state: CounterState,
  command: CounterCommand,
): Decision<CounterEvent, CounterRejection> => {
  if (command.type === 'open') {
    if (state.status !== 'unopened') {
      return { outcome: 'rejected', rejection: { reason: 'already_opened' } };
    }
    return { outcome: 'approved', events: [{ type: 'opened' }] };
  }
  if (state.status !== 'open') {
    return { outcome: 'rejected', rejection: { reason: 'not_open' } };
  }
  if (command.type === 'increment') {
    return {
      outcome: 'approved',
      events: [{ type: 'incremented', by: command.by }],
    };
  }
  return { outcome: 'approved', events: [{ type: 'closed' }] };
};

const evolve = (state: CounterState, event: CounterEvent): CounterState => {
  if (event.type === 'opened') return { ...state, status: 'open' };
  if (event.type === 'incremented') {
    return { ...state, count: state.count + event.by };
  }
  return { ...state, status: 'closed' };
};

const clock = (): Date => new Date('2026-01-01T00:00:00.000Z');

const createGate = (eventLog: EventLog<CounterEvent>) =>
  createEventSourcedGate({ eventLog, initialState, decide, evolve });

describe('event-sourced gate', () => {
  test('appends the events of an approved decision', async () => {
    const eventLog = createInMemoryEventLog<CounterEvent>({ clock });
    const gate = createGate(eventLog);
    await gate.apply({ streamId: 'counter-1', command: { type: 'open' } });

    const result = await gate.apply({
      streamId: 'counter-1',
      command: { type: 'increment', by: 2 },
    });

    expect(result).toEqual({
      outcome: 'approved',
      state: { status: 'open', count: 2 },
      events: [{ type: 'incremented', by: 2 }],
    });
    expect((await eventLog.read('counter-1')).version).toBe(2);
    expect(await gate.load('counter-1')).toEqual({ status: 'open', count: 2 });
  });

  test('returns a rejection unchanged and appends nothing', async () => {
    const eventLog = createInMemoryEventLog<CounterEvent>({ clock });

    const result = await createGate(eventLog).apply({
      streamId: 'counter-1',
      command: { type: 'increment', by: 1 },
    });

    expect(result).toEqual({
      outcome: 'rejected',
      rejection: { reason: 'not_open' },
    });
    expect((await eventLog.read('counter-1')).version).toBe(0);
  });

  test('replays a repeated idempotency key as a no-op', async () => {
    const eventLog = createInMemoryEventLog<CounterEvent>({ clock });
    const gate = createGate(eventLog);
    await gate.apply({ streamId: 'counter-1', command: { type: 'open' } });
    const increment: EventSourcedCommand<CounterCommand> = {
      streamId: 'counter-1',
      command: { type: 'increment', by: 5 },
      idempotencyKey: 'request-1',
    };
    await gate.apply(increment);

    const result = await gate.apply(increment);

    expect(result).toEqual({
      outcome: 'replayed',
      state: { status: 'open', count: 5 },
    });
    expect((await eventLog.read('counter-1')).version).toBe(2);
  });

  test('reports a conflict when another write lands after the read', async () => {
    const eventLog = createInMemoryEventLog<CounterEvent>({ clock });
    await createGate(eventLog).apply({
      streamId: 'counter-1',
      command: { type: 'open' },
    });
    const racingEventLog: EventLog<CounterEvent> = {
      read: async (streamId) => {
        const stream = await eventLog.read(streamId);
        await eventLog.append(streamId, {
          expectedVersion: stream.version,
          idempotencyKey: undefined,
          events: [{ type: 'closed' }],
        });
        return stream;
      },
      append: eventLog.append,
    };

    const result = await createGate(racingEventLog).apply({
      streamId: 'counter-1',
      command: { type: 'increment', by: 1 },
    });

    expect(result).toEqual({ outcome: 'conflict' });
    expect(await createGate(eventLog).load('counter-1')).toEqual({
      status: 'closed',
      count: 0,
    });
  });

  test('loads an empty stream as undefined', async () => {
    const eventLog = createInMemoryEventLog<CounterEvent>({ clock });

    expect(await createGate(eventLog).load('counter-1')).toBeUndefined();
  });
});
