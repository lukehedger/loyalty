import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type {
  Append,
  AppendResult,
  EventLog,
  EventStream,
  StoredEvent,
} from './event-sourcing.ts';

// TransactWriteItems accepts at most 100 items in one call.
const MAX_EVENTS_PER_APPEND = 100;

export type EventLogClient = {
  readonly send: (
    command: PutCommand | QueryCommand | TransactWriteCommand,
  ) => Promise<{
    readonly Items?: readonly Record<string, unknown>[];
    readonly LastEvaluatedKey?: Record<string, unknown>;
  }>;
};

export type DynamoDbEventLogDeps<Event> = {
  readonly client: EventLogClient;
  readonly tableName: string;
  readonly entity: string;
  readonly clock: () => Date;
  readonly parseEvent: (value: unknown) => Event;
};

type EventPut = {
  readonly TableName: string;
  readonly Item: Record<string, unknown>;
  readonly ConditionExpression: string;
};

const eventRowSchema = z.object({
  sequence: z.number().int().positive(),
  recordedAt: z.string(),
  idempotencyKey: z.string().optional(),
  event: z.unknown(),
});

// Zero-padded so the sort key orders events by sequence.
const eventSortKey = (sequence: number): string =>
  `EVENT#${String(sequence).padStart(12, '0')}`;

const isConflict = (error: unknown): boolean => {
  if (error instanceof ConditionalCheckFailedException) return true;
  if (!(error instanceof TransactionCanceledException)) return false;

  return (error.CancellationReasons ?? []).some(
    ({ Code }) =>
      Code === 'ConditionalCheckFailed' || Code === 'TransactionConflict',
  );
};

// One event takes a plain put, which costs half the write capacity of a transaction.
const writeCommand = (
  puts: readonly EventPut[],
): PutCommand | TransactWriteCommand => {
  const [first, ...rest] = puts;
  if (first !== undefined && rest.length === 0) return new PutCommand(first);

  return new TransactWriteCommand({
    TransactItems: puts.map((Put) => ({ Put })),
  });
};

export const createDynamoDbEventLog = <Event>(
  deps: DynamoDbEventLogDeps<Event>,
): EventLog<Event> => {
  const partitionKey = (streamId: string): string =>
    `${deps.entity}#${streamId}`;

  const readItems = async (
    streamId: string,
    exclusiveStartKey: Record<string, unknown> | undefined,
  ): Promise<readonly Record<string, unknown>[]> => {
    const page = await deps.client.send(
      new QueryCommand({
        TableName: deps.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :event)',
        ExpressionAttributeValues: {
          ':pk': partitionKey(streamId),
          ':event': 'EVENT#',
        },
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    const items = page.Items ?? [];
    if (page.LastEvaluatedKey === undefined) return items;

    return [...items, ...(await readItems(streamId, page.LastEvaluatedKey))];
  };

  const toStoredEvent = (item: Record<string, unknown>): StoredEvent<Event> => {
    const row = eventRowSchema.parse(item);

    return {
      sequence: row.sequence,
      recordedAt: row.recordedAt,
      idempotencyKey: row.idempotencyKey,
      event: deps.parseEvent(row.event),
    };
  };

  const read = async (streamId: string): Promise<EventStream<Event>> => {
    const events = (await readItems(streamId, undefined)).map(toStoredEvent);

    return { version: events.at(-1)?.sequence ?? 0, events };
  };

  const append = async (
    streamId: string,
    { expectedVersion, idempotencyKey, events }: Append<Event>,
  ): Promise<AppendResult> => {
    if (events.length === 0) {
      return { outcome: 'appended', version: expectedVersion };
    }
    if (events.length > MAX_EVENTS_PER_APPEND) {
      throw new Error(
        `Append failed: ${events.length} events exceed the limit of ${MAX_EVENTS_PER_APPEND} per append`,
      );
    }

    const recordedAt = deps.clock().toISOString();
    const puts = events.map((event, index): EventPut => {
      const sequence = expectedVersion + index + 1;

      return {
        TableName: deps.tableName,
        Item: {
          PK: partitionKey(streamId),
          SK: eventSortKey(sequence),
          sequence,
          recordedAt,
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          event,
        },
        ConditionExpression: 'attribute_not_exists(SK)',
      };
    });

    return deps.client
      .send(writeCommand(puts))
      .then(
        (): AppendResult => ({
          outcome: 'appended',
          version: expectedVersion + events.length,
        }),
      )
      .catch((error: unknown): AppendResult => {
        if (isConflict(error)) return { outcome: 'conflict' };
        throw error;
      });
  };

  return { read, append };
};
