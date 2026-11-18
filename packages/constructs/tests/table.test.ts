import { describe, test } from 'bun:test';
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AttributeType } from 'aws-cdk-lib/aws-dynamodb';
import { Table } from '../src/index.ts';

const synth = (deletionProtection: boolean): Template => {
  const stack = new Stack(new App(), 'TestStack');
  new Table(stack, 'OrderEventsTable', {
    deletionProtection,
    partitionKey: { name: 'pk', type: AttributeType.STRING },
    sortKey: { name: 'sk', type: AttributeType.STRING },
    tableName: 'order-events',
  });
  return Template.fromStack(stack);
};

describe('Table', () => {
  test('applies on-demand billing, recovery and encryption', () => {
    synth(true).hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      Replicas: [
        {
          DeletionProtectionEnabled: true,
          PointInTimeRecoverySpecification: {
            PointInTimeRecoveryEnabled: true,
          },
          Region: { Ref: 'AWS::Region' },
        },
      ],
      SSESpecification: { SSEEnabled: true, SSEType: 'KMS' },
      TableName: 'order-events',
    });
  });

  test('retains a protected table when the stack is deleted', () => {
    synth(true).hasResource('AWS::DynamoDB::GlobalTable', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  test('deletes an unprotected table with its stack', () => {
    synth(false).hasResource('AWS::DynamoDB::GlobalTable', {
      DeletionPolicy: 'Delete',
    });
  });
});
