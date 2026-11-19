export type StatusRecord = { readonly status: string };

export type StoredRecord<Value extends StatusRecord> = {
  readonly version: number;
  readonly updatedAt: string;
  readonly value: Value;
};

// Undefined means the record must not exist yet.
export type ExpectedRecord =
  | { readonly status: string; readonly version: number }
  | undefined;

export type WriteResult =
  | { readonly outcome: 'written'; readonly version: number }
  | { readonly outcome: 'conflict' };

export type RecordStore<Value extends StatusRecord> = {
  readonly read: (id: string) => Promise<StoredRecord<Value> | undefined>;
  readonly write: (
    id: string,
    value: Value,
    expected: ExpectedRecord,
  ) => Promise<WriteResult>;
};

export type InMemoryRecordStoreDeps = {
  readonly clock: () => Date;
};

export const createInMemoryRecordStore = <Value extends StatusRecord>(
  deps: InMemoryRecordStoreDeps,
): RecordStore<Value> => {
  const records = new Map<string, StoredRecord<Value>>();

  const read = async (id: string): Promise<StoredRecord<Value> | undefined> =>
    records.get(id);

  const write = async (
    id: string,
    value: Value,
    expected: ExpectedRecord,
  ): Promise<WriteResult> => {
    const current = records.get(id);
    const isExpected =
      current?.value.status === expected?.status &&
      current?.version === expected?.version;
    if (!isExpected) return { outcome: 'conflict' };

    const version = (expected?.version ?? 0) + 1;
    records.set(id, { version, updatedAt: deps.clock().toISOString(), value });

    return { outcome: 'written', version };
  };

  return { read, write };
};
