export type StoredEvent<Event> = {
  readonly sequence: number;
  readonly recordedAt: string;
  readonly idempotencyKey: string | undefined;
  readonly event: Event;
};

// The version is the sequence of the last event, or 0 for an empty stream.
export type EventStream<Event> = {
  readonly version: number;
  readonly events: readonly StoredEvent<Event>[];
};

// An empty append writes nothing and checks no version.
export type Append<Event> = {
  readonly expectedVersion: number;
  readonly idempotencyKey: string | undefined;
  readonly events: readonly Event[];
};

export type AppendResult =
  | { readonly outcome: 'appended'; readonly version: number }
  | { readonly outcome: 'conflict' };

export type EventLog<Event> = {
  readonly read: (streamId: string) => Promise<EventStream<Event>>;
  readonly append: (
    streamId: string,
    append: Append<Event>,
  ) => Promise<AppendResult>;
};

export type InMemoryEventLogDeps = {
  readonly clock: () => Date;
};

export const createInMemoryEventLog = <Event>(
  deps: InMemoryEventLogDeps,
): EventLog<Event> => {
  const streams = new Map<string, EventStream<Event>>();
  const emptyStream: EventStream<Event> = { version: 0, events: [] };

  const read = async (streamId: string): Promise<EventStream<Event>> =>
    streams.get(streamId) ?? emptyStream;

  const append = async (
    streamId: string,
    { expectedVersion, idempotencyKey, events }: Append<Event>,
  ): Promise<AppendResult> => {
    if (events.length === 0) {
      return { outcome: 'appended', version: expectedVersion };
    }

    const current = await read(streamId);
    if (current.version !== expectedVersion) return { outcome: 'conflict' };

    const recordedAt = deps.clock().toISOString();
    const appended = events.map((event, index) => ({
      sequence: expectedVersion + index + 1,
      recordedAt,
      idempotencyKey,
      event,
    }));
    const version = expectedVersion + events.length;
    streams.set(streamId, {
      version,
      events: [...current.events, ...appended],
    });

    return { outcome: 'appended', version };
  };

  return { read, append };
};
