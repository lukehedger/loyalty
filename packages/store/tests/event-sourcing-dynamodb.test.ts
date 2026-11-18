import { describe, expect, test } from 'bun:test';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  ProvisionedThroughputExceededException,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { createDynamoDbEventLog, type EventLogClient } from '../src/index.ts';

type CounterEvent = { readonly type: 'incremented'; readonly by: number };
type SentCommand = PutCommand | QueryCommand | TransactWriteCommand;
type Response = Awaited<ReturnType<EventLogClient['send']>>;

const clock = (): Date => new Date('2026-01-01T00:00:00.000Z');

const counterEventSchema = z.object({
  type: z.literal('incremented'),
  by: z.number(),
});

const parseEvent = (value: unknown): CounterEvent =>
  counterEventSchema.parse(value);

const createFakeClient = (
  respond: (command: SentCommand) => Promise<Response>,
): { readonly client: EventLogClient; readonly sent: SentCommand[] } => {
  const sent: SentCommand[] = [];
  const client: EventLogClient = {
    send: async (command) => {
      sent.push(command);
      return respond(command);
    },
  };

  return { client, sent };
};

const createLog = (client: EventLogClient) =>
  createDynamoDbEventLog<CounterEvent>({
    client,
    tableName: 'state-table',
    entity: 'COUNTER',
    clock,
    parseEvent,
  });

const eventRow = (sequence: number, by: number): Record<string, unknown> => ({
  PK: 'COUNTER#counter-1',
  SK: `EVENT#${String(sequence).padStart(12, '0')}`,
  sequence,
  recordedAt: '2026-01-01T00:00:00.000Z',
  event: { type: 'incremented', by },
});

describe('DynamoDB event log', () => {
  test('accepts a DynamoDB document client', () => {
    const client: EventLogClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: 'eu-west-1' }),
    );

    expect(client.send).toBeFunction();
  });

  test('reads every page of the stream with a consistent query', async () => {
    const { client, sent } = createFakeClient(async (command) => {
      if (!(command instanceof QueryCommand)) throw new Error('Unexpected');
      if (command.input.ExclusiveStartKey === undefined) {
        return { Items: [eventRow(1, 1)], LastEvaluatedKey: { PK: 'next' } };
      }
      return { Items: [eventRow(2, 4)] };
    });

    const stream = await createLog(client).read('counter-1');

    expect(stream).toEqual({
      version: 2,
      events: [
        {
          sequence: 1,
          recordedAt: '2026-01-01T00:00:00.000Z',
          idempotencyKey: undefined,
          event: { type: 'incremented', by: 1 },
        },
        {
          sequence: 2,
          recordedAt: '2026-01-01T00:00:00.000Z',
          idempotencyKey: undefined,
          event: { type: 'incremented', by: 4 },
        },
      ],
    });
    expect(sent[0]?.input).toEqual({
      TableName: 'state-table',
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :event)',
      ExpressionAttributeValues: {
        ':pk': 'COUNTER#counter-1',
        ':event': 'EVENT#',
      },
      ConsistentRead: true,
      ExclusiveStartKey: undefined,
    });
    expect(sent[1]?.input).toMatchObject({ ExclusiveStartKey: { PK: 'next' } });
  });

  test('appends one event with a conditional put', async () => {
    const { client, sent } = createFakeClient(async () => ({}));

    const result = await createLog(client).append('counter-1', {
      expectedVersion: 2,
      idempotencyKey: 'request-1',
      events: [{ type: 'incremented', by: 3 }],
    });

    expect(result).toEqual({ outcome: 'appended', version: 3 });
    expect(sent[0]).toBeInstanceOf(PutCommand);
    expect(sent[0]?.input).toEqual({
      TableName: 'state-table',
      Item: {
        PK: 'COUNTER#counter-1',
        SK: 'EVENT#000000000003',
        sequence: 3,
        recordedAt: '2026-01-01T00:00:00.000Z',
        idempotencyKey: 'request-1',
        event: { type: 'incremented', by: 3 },
      },
      ConditionExpression: 'attribute_not_exists(SK)',
    });
  });

  test('appends several events in one transaction', async () => {
    const { client, sent } = createFakeClient(async () => ({}));

    const result = await createLog(client).append('counter-1', {
      expectedVersion: 0,
      idempotencyKey: undefined,
      events: [
        { type: 'incremented', by: 1 },
        { type: 'incremented', by: 2 },
      ],
    });

    expect(result).toEqual({ outcome: 'appended', version: 2 });
    expect(sent[0]).toBeInstanceOf(TransactWriteCommand);
    expect(sent[0]?.input).toMatchObject({
      TransactItems: [
        {
          Put: {
            Item: { SK: 'EVENT#000000000001', sequence: 1 },
            ConditionExpression: 'attribute_not_exists(SK)',
          },
        },
        {
          Put: {
            Item: { SK: 'EVENT#000000000002', sequence: 2 },
            ConditionExpression: 'attribute_not_exists(SK)',
          },
        },
      ],
    });
  });

  test('sends nothing for an empty append', async () => {
    const { client, sent } = createFakeClient(async () => ({}));

    const result = await createLog(client).append('counter-1', {
      expectedVersion: 4,
      idempotencyKey: undefined,
      events: [],
    });

    expect(result).toEqual({ outcome: 'appended', version: 4 });
    expect(sent).toEqual([]);
  });

  test('reports a failed put condition as a conflict', async () => {
    const { client } = createFakeClient(async () => {
      throw new ConditionalCheckFailedException({
        message: 'The conditional request failed',
        $metadata: {},
      });
    });

    const result = await createLog(client).append('counter-1', {
      expectedVersion: 0,
      idempotencyKey: undefined,
      events: [{ type: 'incremented', by: 1 }],
    });

    expect(result).toEqual({ outcome: 'conflict' });
  });

  test('reports a cancelled transaction as a conflict', async () => {
    const { client } = createFakeClient(async () => {
      throw new TransactionCanceledException({
        message: 'Transaction cancelled',
        $metadata: {},
        CancellationReasons: [
          { Code: 'None' },
          { Code: 'ConditionalCheckFailed' },
        ],
      });
    });

    const result = await createLog(client).append('counter-1', {
      expectedVersion: 0,
      idempotencyKey: undefined,
      events: [
        { type: 'incremented', by: 1 },
        { type: 'incremented', by: 2 },
      ],
    });

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

    const append = createLog(client).append('counter-1', {
      expectedVersion: 0,
      idempotencyKey: undefined,
      events: [{ type: 'incremented', by: 1 }],
    });

    await expect(append).rejects.toBe(throttled);
  });
});
