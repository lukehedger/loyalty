import type { EventLog, StoredEvent } from '@loyalty/store';

export type Decision<Event, Rejection> =
  | { readonly outcome: 'approved'; readonly events: readonly Event[] }
  | { readonly outcome: 'rejected'; readonly rejection: Rejection };

export type EventSourcedGateDeps<State, Command, Event, Rejection> = {
  readonly eventLog: EventLog<Event>;
  readonly initialState: State;
  readonly decide: (
    state: State,
    command: Command,
  ) => Decision<Event, Rejection>;
  readonly evolve: (state: State, event: Event) => State;
};

export type EventSourcedCommand<Command> = {
  readonly streamId: string;
  readonly command: Command;
  // A key the stream already holds makes the command a no-op, so a retry appends nothing.
  readonly idempotencyKey?: string;
};

export type EventSourcedResult<State, Event, Rejection> =
  | {
      readonly outcome: 'approved';
      readonly state: State;
      readonly events: readonly Event[];
    }
  | { readonly outcome: 'replayed'; readonly state: State }
  | { readonly outcome: 'rejected'; readonly rejection: Rejection }
  | { readonly outcome: 'conflict' };

export type EventSourcedGate<State, Command, Event, Rejection> = {
  readonly apply: (
    input: EventSourcedCommand<Command>,
  ) => Promise<EventSourcedResult<State, Event, Rejection>>;
  readonly load: (streamId: string) => Promise<State | undefined>;
};

export const createEventSourcedGate = <State, Command, Event, Rejection>(
  deps: EventSourcedGateDeps<State, Command, Event, Rejection>,
): EventSourcedGate<State, Command, Event, Rejection> => {
  const project = (state: State, events: readonly Event[]): State =>
    events.reduce((current, event) => deps.evolve(current, event), state);

  const replay = (stored: readonly StoredEvent<Event>[]): State =>
    project(
      deps.initialState,
      stored.map(({ event }) => event),
    );

  const load = async (streamId: string): Promise<State | undefined> => {
    const stream = await deps.eventLog.read(streamId);
    if (stream.events.length === 0) return undefined;

    return replay(stream.events);
  };

  const apply = async ({
    streamId,
    command,
    idempotencyKey,
  }: EventSourcedCommand<Command>): Promise<
    EventSourcedResult<State, Event, Rejection>
  > => {
    const stream = await deps.eventLog.read(streamId);
    const state = replay(stream.events);

    const isReplay =
      idempotencyKey !== undefined &&
      stream.events.some((stored) => stored.idempotencyKey === idempotencyKey);
    if (isReplay) return { outcome: 'replayed', state };

    const decision = deps.decide(state, command);
    if (decision.outcome === 'rejected') return decision;

    // A conflict means the decision was made on stale state. The caller may retry.
    const appended = await deps.eventLog.append(streamId, {
      expectedVersion: stream.version,
      idempotencyKey,
      events: decision.events,
    });
    if (appended.outcome === 'conflict') return appended;

    return {
      outcome: 'approved',
      state: project(state, decision.events),
      events: decision.events,
    };
  };

  return { apply, load };
};
