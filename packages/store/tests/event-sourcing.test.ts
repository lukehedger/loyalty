import { describe, expect, test } from 'bun:test';
import { createInMemoryEventLog } from '../src/index.ts';

type CounterEvent = { readonly type: 'incremented'; readonly by: number };

const clock = (): Date => new Date('2026-01-01T00:00:00.000Z');

describe('in-memory event log', () => {
  test('reads an unknown stream as empty at version 0', async () => {
    const log = createInMemoryEventLog<CounterEvent>({ clock });

    expect(await log.read('counter-1')).toEqual({ version: 0, events: [] });
  });

  test('appends events in sequence and stamps them with the clock', async () => {
    const log = createInMemoryEventLog<CounterEvent>({ clock });

    const result = await log.append('counter-1', {
      expectedVersion: 0,
      idempotencyKey: 'request-1',
      events: [
        { type: 'incremented', by: 1 },
        { type: 'incremented', by: 2 },
      ],
    });

    expect(result).toEqual({ outcome: 'appended', version: 2 });
    expect(await log.read('counter-1')).toEqual({
      version: 2,
      events: [
        {
          sequence: 1,
          recordedAt: '2026-01-01T00:00:00.000Z',
          idempotencyKey: 'request-1',
          event: { type: 'incremented', by: 1 },
        },
        {
          sequence: 2,
          recordedAt: '2026-01-01T00:00:00.000Z',
          idempotencyKey: 'request-1',
          event: { type: 'incremented', by: 2 },
        },
      ],
    });
  });

  test('rejects an append at a stale version and keeps the stream', async () => {
    const log = createInMemoryEventLog<CounterEvent>({ clock });
    await log.append('counter-1', {
      expectedVersion: 0,
      idempotencyKey: undefined,
      events: [{ type: 'incremented', by: 1 }],
    });

    const result = await log.append('counter-1', {
      expectedVersion: 0,
      idempotencyKey: undefined,
      events: [{ type: 'incremented', by: 5 }],
    });

    expect(result).toEqual({ outcome: 'conflict' });
    expect((await log.read('counter-1')).version).toBe(1);
  });

  test('writes nothing and checks no version for an empty append', async () => {
    const log = createInMemoryEventLog<CounterEvent>({ clock });

    const result = await log.append('counter-1', {
      expectedVersion: 3,
      idempotencyKey: undefined,
      events: [],
    });

    expect(result).toEqual({ outcome: 'appended', version: 3 });
    expect(await log.read('counter-1')).toEqual({ version: 0, events: [] });
  });

  test('keeps streams apart', async () => {
    const log = createInMemoryEventLog<CounterEvent>({ clock });
    await log.append('counter-1', {
      expectedVersion: 0,
      idempotencyKey: undefined,
      events: [{ type: 'incremented', by: 1 }],
    });

    expect(await log.read('counter-2')).toEqual({ version: 0, events: [] });
  });
});
