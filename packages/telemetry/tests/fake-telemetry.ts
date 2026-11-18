import type { Telemetry } from '../src/index.ts';

type WideEvent = {
  readonly level: 'info' | 'error';
  readonly message: string;
  readonly keys: Readonly<Record<string, unknown>>;
  readonly error?: Error;
};

// Records what reaches each sink. Like Powertools, it drops tracer writes made outside an open trace.
export const fakeTelemetry = () => {
  const keys = new Map<string, unknown>();
  const events: WideEvent[] = [];
  const annotations = new Map<string, string | number>();
  const metadata = new Map<string, unknown>();
  const dimensionSets: Record<string, string>[] = [];
  const state = { flushes: 0, openTraces: 0 };

  const telemetry: Telemetry = {
    logger: {
      appendKeys: (appended) => {
        for (const [key, value] of Object.entries(appended)) {
          keys.set(key, value);
        }
      },
      resetKeys: () => keys.clear(),
      info: (message) =>
        events.push({ level: 'info', message, keys: Object.fromEntries(keys) }),
      error: (message, error) =>
        events.push({
          level: 'error',
          message,
          keys: Object.fromEntries(keys),
          error,
        }),
    },
    metrics: {
      addDimensions: (dimensions) => dimensionSets.push({ ...dimensions }),
      addMetric: () => {},
      clearDimensions: () => dimensionSets.splice(0),
      flush: () => {
        state.flushes += 1;
      },
    },
    tracer: {
      addAnnotation: (key, value) => {
        if (state.openTraces > 0) annotations.set(key, value);
      },
      addMetadata: (key, value) => {
        if (state.openTraces > 0) metadata.set(key, value);
      },
      annotateColdStart: () => {},
      trace: async (_name, work) => {
        state.openTraces += 1;
        try {
          return await work();
        } finally {
          state.openTraces -= 1;
        }
      },
    },
  };

  return {
    telemetry,
    keys,
    events,
    annotations,
    metadata,
    dimensionSets,
    flushes: () => state.flushes,
    inTrace: <Result>(work: () => Result): Promise<Result> =>
      telemetry.tracer.trace('test', async () => work()),
  };
};
