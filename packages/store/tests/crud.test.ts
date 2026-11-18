import { describe, expect, test } from 'bun:test';
import { createInMemoryRecordStore } from '../src/index.ts';

type Counter = { readonly status: 'open' | 'closed'; readonly count: number };

const clock = (): Date => new Date('2026-01-01T00:00:00.000Z');

describe('in-memory record store', () => {
  test('reads an unknown record as undefined', async () => {
    const store = createInMemoryRecordStore<Counter>({ clock });

    expect(await store.read('counter-1')).toBeUndefined();
  });

  test('creates a record at version 1 and stamps it with the clock', async () => {
    const store = createInMemoryRecordStore<Counter>({ clock });

    const result = await store.write(
      'counter-1',
      { status: 'open', count: 0 },
      undefined,
    );

    expect(result).toEqual({ outcome: 'written', version: 1 });
    expect(await store.read('counter-1')).toEqual({
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
      value: { status: 'open', count: 0 },
    });
  });

  test('updates a record that matches the expected status and version', async () => {
    const store = createInMemoryRecordStore<Counter>({ clock });
    await store.write('counter-1', { status: 'open', count: 0 }, undefined);

    const result = await store.write(
      'counter-1',
      { status: 'closed', count: 0 },
      { status: 'open', version: 1 },
    );

    expect(result).toEqual({ outcome: 'written', version: 2 });
    expect((await store.read('counter-1'))?.value.status).toBe('closed');
  });

  test('rejects a create when the record exists', async () => {
    const store = createInMemoryRecordStore<Counter>({ clock });
    await store.write('counter-1', { status: 'open', count: 0 }, undefined);

    const result = await store.write(
      'counter-1',
      { status: 'open', count: 9 },
      undefined,
    );

    expect(result).toEqual({ outcome: 'conflict' });
    expect((await store.read('counter-1'))?.value.count).toBe(0);
  });

  test('rejects an update at a stale version', async () => {
    const store = createInMemoryRecordStore<Counter>({ clock });
    await store.write('counter-1', { status: 'open', count: 0 }, undefined);
    await store.write(
      'counter-1',
      { status: 'open', count: 1 },
      { status: 'open', version: 1 },
    );

    const result = await store.write(
      'counter-1',
      { status: 'open', count: 2 },
      { status: 'open', version: 1 },
    );

    expect(result).toEqual({ outcome: 'conflict' });
  });

  test('rejects an update from a different status', async () => {
    const store = createInMemoryRecordStore<Counter>({ clock });
    await store.write('counter-1', { status: 'open', count: 0 }, undefined);

    const result = await store.write(
      'counter-1',
      { status: 'open', count: 1 },
      { status: 'closed', version: 1 },
    );

    expect(result).toEqual({ outcome: 'conflict' });
  });

  test('rejects an update of a missing record', async () => {
    const store = createInMemoryRecordStore<Counter>({ clock });

    const result = await store.write(
      'counter-1',
      { status: 'open', count: 1 },
      { status: 'open', version: 1 },
    );

    expect(result).toEqual({ outcome: 'conflict' });
  });
});
