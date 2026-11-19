import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type {
  ExpectedRecord,
  RecordStore,
  StatusRecord,
  StoredRecord,
  WriteResult,
} from './crud.ts';

const RECORD_SORT_KEY = 'RECORD';

export type RecordStoreClient = {
  readonly send: (
    command: GetCommand | PutCommand,
  ) => Promise<{ readonly Item?: Record<string, unknown> }>;
};

export type DynamoDbRecordStoreDeps<Value extends StatusRecord> = {
  readonly client: RecordStoreClient;
  readonly tableName: string;
  readonly entity: string;
  readonly clock: () => Date;
  readonly parseValue: (value: unknown) => Value;
};

const recordRowSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string(),
  value: z.unknown(),
});

type WriteCondition = {
  readonly ConditionExpression: string;
  readonly ExpressionAttributeNames?: Record<string, string>;
  readonly ExpressionAttributeValues?: Record<string, unknown>;
};

const writeCondition = (expected: ExpectedRecord): WriteCondition => {
  if (expected === undefined) {
    return { ConditionExpression: 'attribute_not_exists(PK)' };
  }

  return {
    ConditionExpression: '#status = :status AND #version = :version',
    ExpressionAttributeNames: { '#status': 'status', '#version': 'version' },
    ExpressionAttributeValues: {
      ':status': expected.status,
      ':version': expected.version,
    },
  };
};

export const createDynamoDbRecordStore = <Value extends StatusRecord>(
  deps: DynamoDbRecordStoreDeps<Value>,
): RecordStore<Value> => {
  const key = (id: string): Record<string, string> => ({
    PK: `${deps.entity}#${id}`,
    SK: RECORD_SORT_KEY,
  });

  const read = async (id: string): Promise<StoredRecord<Value> | undefined> => {
    const { Item } = await deps.client.send(
      new GetCommand({
        TableName: deps.tableName,
        Key: key(id),
        ConsistentRead: true,
      }),
    );
    if (Item === undefined) return undefined;

    const row = recordRowSchema.parse(Item);

    return {
      version: row.version,
      updatedAt: row.updatedAt,
      value: deps.parseValue(row.value),
    };
  };

  const write = async (
    id: string,
    value: Value,
    expected: ExpectedRecord,
  ): Promise<WriteResult> => {
    const version = (expected?.version ?? 0) + 1;

    return deps.client
      .send(
        new PutCommand({
          TableName: deps.tableName,
          // The status sits beside the value so the write condition can read it.
          Item: {
            ...key(id),
            status: value.status,
            version,
            updatedAt: deps.clock().toISOString(),
            value,
          },
          ...writeCondition(expected),
        }),
      )
      .then((): WriteResult => ({ outcome: 'written', version }))
      .catch((error: unknown): WriteResult => {
        if (error instanceof ConditionalCheckFailedException) {
          return { outcome: 'conflict' };
        }
        throw error;
      });
  };

  return { read, write };
};
