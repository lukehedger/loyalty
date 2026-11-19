import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Create it once per container. Each new client resolves credentials and opens connections again.
export const createDocumentClient = (): DynamoDBDocumentClient =>
  DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
