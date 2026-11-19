import type { RecordStore, StatusRecord } from '@loyalty/store';

export type Transition<State, Rejection> =
  | { readonly outcome: 'approved'; readonly state: State }
  | { readonly outcome: 'rejected'; readonly rejection: Rejection };

export type RecordGateDeps<State extends StatusRecord, Command, Rejection> = {
  readonly recordStore: RecordStore<State>;
  // The state is undefined until an approved transition creates the record.
  readonly decide: (
    current: State | undefined,
    command: Command,
  ) => Transition<State, Rejection>;
};

export type RecordCommand<Command> = {
  readonly id: string;
  readonly command: Command;
};

export type RecordResult<State, Rejection> =
  | { readonly outcome: 'approved'; readonly state: State }
  | { readonly outcome: 'rejected'; readonly rejection: Rejection }
  | { readonly outcome: 'conflict' };

export type RecordGate<State, Command, Rejection> = {
  readonly apply: (
    input: RecordCommand<Command>,
  ) => Promise<RecordResult<State, Rejection>>;
  readonly load: (id: string) => Promise<State | undefined>;
};

export const createRecordGate = <
  State extends StatusRecord,
  Command,
  Rejection,
>(
  deps: RecordGateDeps<State, Command, Rejection>,
): RecordGate<State, Command, Rejection> => {
  const load = async (id: string): Promise<State | undefined> =>
    (await deps.recordStore.read(id))?.value;

  const apply = async ({
    id,
    command,
  }: RecordCommand<Command>): Promise<RecordResult<State, Rejection>> => {
    const stored = await deps.recordStore.read(id);

    const transition = deps.decide(stored?.value, command);
    if (transition.outcome === 'rejected') return transition;

    // A conflict means the transition was decided on stale state. The caller may retry.
    const written = await deps.recordStore.write(
      id,
      transition.state,
      stored === undefined
        ? undefined
        : { status: stored.value.status, version: stored.version },
    );
    if (written.outcome === 'conflict') return written;

    return { outcome: 'approved', state: transition.state };
  };

  return { apply, load };
};
