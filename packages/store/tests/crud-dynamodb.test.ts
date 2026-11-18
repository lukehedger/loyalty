import { describe, expect, test } from 'bun:test';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  ProvisionedThroughputExceededException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  type GetCommand,
  type PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import {
  createDynamoDbRecordStore,
  type RecordStoreClient,
} from '../src/index.ts';

const counterSchema = z.object({
  status: z.enum(['open', 'closed']),
  count: z.number(),
});

type Counter = z.infer<typeof counterSchema>;
type SentCommand = GetCommand | PutCommand;
type Response = Awaited<ReturnType<RecordStoreClient['send']>>;

const clock = (): Date => new Date('2026-01-01T00:00:00.000Z');

const createFakeClient = (
  respond: (command: SentCommand) => Promise<Response>,
): { readonly client: RecordStoreClient; readonly sent: SentCommand[] } => {
  const sent: SentCommand[] = [];
  const client: RecordStoreClient = {
    send: async (command) => {
      sent.push(command);
      return respond(command);
    },
  };

  return { client, sent };
};

const createStore = (client: RecordStoreClient) =>
  createDynamoDbRecordStore<Counter>({
    client,
    tableName: 'state-table',
    entity: 'COUNTER',
    clock,
    parseValue: (value) => counterSchema.parse(value),
  });

describe('DynamoDB record store', () => {
  test('accepts a DynamoDB document client', () => {
    const client: RecordStoreClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: 'eu-west-1' }),
    );

    expect(client.send).toBeFunction();
  });

  test('reads a record with a consistent get', async () => {
    const { client, sent } = createFakeClient(async () => ({
      Item: {
        PK: 'COUNTER#counter-1',
        SK: 'RECORD',
        status: 'open',
        version: 3,
        updatedAt: '2026-01-01T00:00:00.000Z',
        value: { status: 'open', count: 7 },
      },
    }));

    const record = await createStore(client).read('counter-1');

    expect(record).toEqual({
      version: 3,
      updatedAt: '2026-01-01T00:00:00.000Z',
      value: { status: 'open', count: 7 },
    });
    expect(sent[0]?.input).toEqual({
      TableName: 'state-table',
      Key: { PK: 'COUNTER#counter-1', SK: 'RECORD' },
      ConsistentRead: true,
    });
  });

  test('reads a missing record as undefined', async () => {
    const { client } = createFakeClient(async () => ({}));

    expect(await createStore(client).read('counter-1')).toBeUndefined();
  });

  test('creates a record only when none exists', async () => {
    const { client, sent } = createFakeClient(async () => ({}));

    const result = await createStore(client).write(
      'counter-1',
      { status: 'open', count: 0 },
      undefined,
    );

    expect(result).toEqual({ outcome: 'written', version: 1 });
    expect(sent[0]?.input).toEqual({
      TableName: 'state-table',
      Item: {
        PK: 'COUNTER#counter-1',
        SK: 'RECORD',
        status: 'open',
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        value: { status: 'open', count: 0 },
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    });
  });

  test('updates a record on the expected status and version', async () => {
    const { client, sent } = createFakeClient(async () => ({}));

    const result = await createStore(client).write(
      'counter-1',
      { status: 'closed', count: 4 },
      { status: 'open', version: 2 },
    );

    expect(result).toEqual({ outcome: 'written', version: 3 });
    expect(sent[0]?.input).toMatchObject({
      Item: { status: 'closed', version: 3 },
      ConditionExpression: '#status = :status AND #version = :version',
      ExpressionAttributeNames: { '#status': 'status', '#version': 'version' },
      ExpressionAttributeValues: { ':status': 'open', ':version': 2 },
    });
  });

  test('reports a failed condition as a conflict', async () => {
    const { client } = createFakeClient(async () => {
      throw new ConditionalCheckFailedException({
        message: 'The conditional request failed',
        $metadata: {},
      });
    });

    const result = await createStore(client).write(
      'counter-1',
      { status: 'closed', count: 4 },
      { status: 'open', version: 2 },
    );

    expect(result).toEqual({ outcome: 'conflict' });
  });

  test('rethrows any other write failure', async () => {
    const throttled = new ProvisionedThroughputExceededException({
      message: 'Throughput exceeded',
      $metadata: {},
    });
    const { client } = createFakeClient(async () => {
      throw throttled;
    });

    const write = createStore(client).write(
      'counter-1',
      { status: 'open', count: 0 },
      undefined,
    );

    await expect(write).rejects.toBe(throttled);
  });
});
