import { RemovalPolicy } from 'aws-cdk-lib';
import {
  Billing,
  TableEncryptionV2,
  type TablePropsV2,
  TableV2,
} from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

export type TableProps = Pick<
  TablePropsV2,
  'globalSecondaryIndexes' | 'partitionKey' | 'sortKey' | 'timeToLiveAttribute'
> & {
  readonly deletionProtection: boolean;
  readonly tableName: string;
};

export class Table extends TableV2 {
  constructor(scope: Construct, id: string, props: TableProps) {
    super(scope, id, {
      ...props,
      billing: Billing.onDemand(),
      encryption: TableEncryptionV2.awsManagedKey(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      // A protected table outlives its stack. An unprotected one is deleted with its disposable environment.
      removalPolicy: props.deletionProtection
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
    });
  }
}
