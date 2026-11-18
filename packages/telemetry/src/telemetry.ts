import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import type { MetricUnit } from '@aws-lambda-powertools/metrics/types';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Segment } from 'aws-xray-sdk-core';

export type { MetricUnit };

export type TelemetryLogger = {
  readonly appendKeys: (keys: Readonly<Record<string, unknown>>) => void;
  readonly resetKeys: () => void;
  readonly info: (message: string) => void;
  readonly error: (message: string, error: Error) => void;
};

export type TelemetryMetrics = {
  readonly addDimensions: (
    dimensions: Readonly<Record<string, string>>,
  ) => void;
  readonly addMetric: (
    name: string,
    unit: MetricUnit,
    value: number,
    dimensions?: Readonly<Record<string, string>>,
  ) => void;
  readonly clearDimensions: () => void;
  readonly flush: () => void;
};

export type TelemetryTracer = {
  readonly addAnnotation: (key: string, value: string | number) => void;
  readonly addMetadata: (key: string, value: unknown) => void;
  readonly annotateColdStart: () => void;
  readonly trace: <Result>(
    name: string,
    work: () => Promise<Result>,
  ) => Promise<Result>;
};

export type Telemetry = {
  readonly logger: TelemetryLogger;
  readonly metrics: TelemetryMetrics;
  readonly tracer: TelemetryTracer;
};

export type TelemetryConfig = {
  readonly serviceName: string;
  readonly namespace: string;
};

const createLogger = (serviceName: string): TelemetryLogger => {
  const logger = new Logger({ serviceName });

  return {
    appendKeys: (keys) => logger.appendKeys(keys),
    resetKeys: () => logger.resetKeys(),
    info: (message) => logger.info(message),
    error: (message, error) => logger.error(message, error),
  };
};

const createMetrics = (
  serviceName: string,
  namespace: string,
): TelemetryMetrics => {
  const metrics = new Metrics({ serviceName, namespace });

  return {
    addDimensions: (dimensions) => metrics.addDimensions({ ...dimensions }),
    addMetric: (name, unit, value, dimensions) => {
      if (dimensions === undefined || Object.keys(dimensions).length === 0) {
        metrics.addMetric(name, unit, value);
        return;
      }

      // A single metric publishes at once with only these dimensions, not the sets the request recorded.
      const single = metrics.singleMetric();
      single.addDimensions({ ...dimensions });
      single.addMetric(name, unit, value);
    },
    clearDimensions: () => metrics.clearDimensions(),
    flush: () => {
      if (metrics.hasStoredMetrics()) metrics.publishStoredMetrics();
    },
  };
};

const createTracer = (serviceName: string): TelemetryTracer => {
  const tracer = new Tracer({ serviceName });

  // Powertools refuses writes to the immutable Lambda facade segment and warns on each attempt.
  const subsegmentIsOpen = (): boolean => {
    const segment = tracer.provider.getSegment();
    return segment !== undefined && !(segment instanceof Segment);
  };

  return {
    addAnnotation: (key, value) => {
      if (subsegmentIsOpen()) tracer.putAnnotation(key, value);
    },
    addMetadata: (key, value) => {
      if (subsegmentIsOpen()) tracer.putMetadata(key, value);
    },
    annotateColdStart: () => tracer.annotateColdStart(),
    trace: <Result>(
      name: string,
      work: () => Promise<Result>,
    ): Promise<Result> => {
      if (!tracer.isTracingEnabled()) return work();

      // captureAsyncFunc returns its callback's value untyped, so the result travels through this promise.
      return new Promise<Result>((resolve, reject) => {
        tracer.provider.captureAsyncFunc(name, (subsegment) => {
          if (subsegment === undefined) return work().then(resolve, reject);

          // captureAsyncFunc does not always carry the subsegment across awaits, so bind it.
          tracer.provider.setSegment(subsegment);

          // Unlike captureFunc, captureAsyncFunc leaves the subsegment open.
          return work().then(
            (result) => {
              subsegment.close();
              resolve(result);
            },
            (error: unknown) => {
              if (error instanceof Error) subsegment.addError(error);
              subsegment.close();
              reject(error);
            },
          );
        });
      });
    },
  };
};

export const createTelemetry = (config: TelemetryConfig): Telemetry => ({
  logger: createLogger(config.serviceName),
  metrics: createMetrics(config.serviceName, config.namespace),
  tracer: createTracer(config.serviceName),
});
