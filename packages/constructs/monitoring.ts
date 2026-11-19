import { Duration } from 'aws-cdk-lib';
import {
  Alarm,
  AlarmRule,
  ComparisonOperator,
  CompositeAlarm,
  Dashboard,
  GraphWidget,
  type IMetric,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import type { ITopic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import type { Api } from './api.ts';

const PERIOD = Duration.minutes(5);

export type MonitoringProps = {
  readonly alarmTopic: ITopic;
  readonly api: Api;
  readonly functions: readonly IFunction[];
  readonly name: string;
};

export class Monitoring extends Construct {
  public readonly dashboard: Dashboard;
  public readonly errorAlarm: CompositeAlarm;

  constructor(scope: Construct, id: string, props: MonitoringProps) {
    super(scope, id);

    const { restApi } = props.api;

    const serverErrorAlarm = new Alarm(this, 'ApiServerErrorAlarm', {
      alarmDescription: `The ${props.name} API returned at least five 5XX responses in each of three five-minute periods`,
      alarmName: `${props.name}-api-server-errors`,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      evaluationPeriods: 3,
      metric: restApi.metricServerError({ period: PERIOD, statistic: 'Sum' }),
      threshold: 5,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });

    const functionErrorAlarms = props.functions.map(
      (fn) =>
        new Alarm(this, `${fn.node.id}ErrorAlarm`, {
          alarmDescription: `${fn.functionName} failed at least five invocations in each of three five-minute periods`,
          alarmName: `${fn.functionName}-errors`,
          comparisonOperator:
            ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          evaluationPeriods: 3,
          metric: fn.metricErrors({ period: PERIOD, statistic: 'Sum' }),
          threshold: 5,
          treatMissingData: TreatMissingData.NOT_BREACHING,
        }),
    );

    this.errorAlarm = new CompositeAlarm(this, 'ErrorAlarm', {
      alarmDescription: `${props.name} is failing requests or invocations. The child alarm in ALARM names the source`,
      alarmRule: AlarmRule.anyOf(serverErrorAlarm, ...functionErrorAlarms),
      compositeAlarmName: `${props.name}-errors`,
    });
    const notify = new SnsAction(props.alarmTopic);
    this.errorAlarm.addAlarmAction(notify);
    this.errorAlarm.addOkAction(notify);

    const graph = (title: string, metrics: readonly IMetric[]): GraphWidget =>
      new GraphWidget({ left: [...metrics], title, width: 8 });
    const perFunction = (
      metric: (fn: IFunction) => IMetric,
    ): readonly IMetric[] => props.functions.map(metric);

    this.dashboard = new Dashboard(this, 'Dashboard', {
      dashboardName: props.name,
      widgets: [
        [
          graph('API requests', [
            restApi.metricCount({ period: PERIOD, statistic: 'Sum' }),
          ]),
          graph('API errors', [
            restApi.metricServerError({ period: PERIOD, statistic: 'Sum' }),
            restApi.metricClientError({ period: PERIOD, statistic: 'Sum' }),
          ]),
          graph('API latency', [
            restApi.metricLatency({ period: PERIOD, statistic: 'p50' }),
            restApi.metricLatency({ period: PERIOD, statistic: 'p99' }),
          ]),
        ],
        [
          graph(
            'Function invocations',
            perFunction((fn) =>
              fn.metricInvocations({
                label: fn.functionName,
                period: PERIOD,
                statistic: 'Sum',
              }),
            ),
          ),
          graph(
            'Function errors',
            perFunction((fn) =>
              fn.metricErrors({
                label: fn.functionName,
                period: PERIOD,
                statistic: 'Sum',
              }),
            ),
          ),
          graph(
            'Function duration p99',
            perFunction((fn) =>
              fn.metricDuration({
                label: fn.functionName,
                period: PERIOD,
                statistic: 'p99',
              }),
            ),
          ),
        ],
      ],
    });
  }
}
