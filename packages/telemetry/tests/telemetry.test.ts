import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { createTelemetry, recordContext } from '../src/index.ts';

const config = { serviceName: 'orders-create', namespace: 'Orders' };

let stdout: ReturnType<typeof spyOn<typeof process.stdout, 'write'>>;

const linesWritten = (): string[] =>
  stdout.mock.calls.map(([chunk]) => String(chunk).trim());

const emfRecordsFor = (metricName: string): unknown[] =>
  linesWritten()
    .filter(
      (line) =>
        line.startsWith('{"_aws"') && line.includes(`"Name":"${metricName}"`),
    )
    .map((line): unknown => JSON.parse(line));

beforeEach(() => {
  stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdout.mockRestore();
});

describe('createTelemetry metrics', () => {
  const recordLayeredContext = (
    telemetry: ReturnType<typeof createTelemetry>,
  ) => {
    recordContext(telemetry, { route: 'POST /orders' });
    recordContext(telemetry, { outcome: 'success' });
  };

  test('a metric with explicit dimensions has one dimension set, whatever the request recorded', () => {
    const telemetry = createTelemetry(config);
    recordLayeredContext(telemetry);

    telemetry.metrics.addMetric('OrderCreated', 'Count', 1, {
      channel: 'web',
    });
    telemetry.metrics.flush();

    expect(emfRecordsFor('OrderCreated')).toMatchObject([
      {
        _aws: { CloudWatchMetrics: [{ Dimensions: [['service', 'channel']] }] },
      },
    ]);
  });

  test('a metric without explicit dimensions inherits one dimension set per recorded context', () => {
    const telemetry = createTelemetry(config);
    recordLayeredContext(telemetry);

    telemetry.metrics.addMetric('OrderForwarded', 'Count', 1);
    telemetry.metrics.flush();

    expect(emfRecordsFor('OrderForwarded')).toMatchObject([
      {
        _aws: {
          CloudWatchMetrics: [
            {
              Dimensions: [
                ['service', 'route'],
                ['service', 'outcome'],
              ],
            },
          ],
        },
      },
    ]);
  });

  test('flush publishes nothing when no metric was added', () => {
    const telemetry = createTelemetry(config);

    telemetry.metrics.flush();

    expect(linesWritten().filter((line) => line.startsWith('{"_aws"'))).toEqual(
      [],
    );
  });
});

describe('createTelemetry logger', () => {
  test('writes the appended keys on one structured line', () => {
    const { logger } = createTelemetry(config);

    logger.appendKeys({ route: 'POST /orders', status_code: 201 });
    logger.info('invocation');

    const [line] = linesWritten();
    expect(JSON.parse(line ?? '{}')).toMatchObject({
      level: 'INFO',
      message: 'invocation',
      service: 'orders-create',
      route: 'POST /orders',
      status_code: 201,
    });
  });

  test('resetKeys drops the keys of the previous invocation', () => {
    const { logger } = createTelemetry(config);

    logger.appendKeys({ order_id: 'order-1' });
    logger.resetKeys();
    logger.info('invocation');

    const [line] = linesWritten();
    expect(JSON.parse(line ?? '{}')).not.toHaveProperty('order_id');
  });
});

describe('createTelemetry tracer', () => {
  test('trace returns the work result when tracing is off', async () => {
    const { tracer } = createTelemetry(config);

    expect(await tracer.trace('create-order', async () => 'created')).toBe(
      'created',
    );
  });

  test('trace rethrows what the work throws', async () => {
    const { tracer } = createTelemetry(config);

    await expect(
      tracer.trace('create-order', async () => {
        throw new Error('Order store unavailable');
      }),
    ).rejects.toThrow('Order store unavailable');
  });
});
