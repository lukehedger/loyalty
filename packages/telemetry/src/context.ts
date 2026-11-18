import type { Telemetry } from './telemetry.ts';

// Every key reaches the wide event. A dimension splits metric series, so only low-cardinality keys earn one.
export type ContextKind = 'dimension' | 'annotation' | 'metadata' | 'log';

export type ContextValue = string | number;

export type Outcome = 'success' | 'client_error' | 'server_error' | 'timeout';

export type RequestContext = {
  readonly route?: string;
  readonly outcome?: Outcome;
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly clientId?: string;
};

export type ContextShape = Readonly<Record<string, ContextValue>> & {
  readonly [Key in keyof RequestContext]?: never;
};

export type ContextRouting<AppContext extends ContextShape> = {
  readonly [Key in keyof AppContext]-?: ContextKind;
};

export type RecordContext<AppContext extends ContextShape> = (
  telemetry: Telemetry,
  context: RequestContext & Partial<AppContext>,
) => void;

const REQUEST_ROUTING: Readonly<Record<keyof RequestContext, ContextKind>> = {
  route: 'dimension',
  outcome: 'dimension',
  statusCode: 'annotation',
  requestId: 'log',
  clientId: 'annotation',
};

const toSnakeCase = (key: string): string =>
  key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export const createContextRecorder = <AppContext extends ContextShape>(
  routing: ContextRouting<AppContext>,
): RecordContext<AppContext> => {
  const kinds: Readonly<Record<string, ContextKind>> = {
    ...routing,
    ...REQUEST_ROUTING,
  };

  return (telemetry, context) => {
    const entries: [string, ContextValue | undefined][] =
      Object.entries(context);
    const recorded = entries.flatMap(([key, value]) =>
      value === undefined
        ? []
        : [{ name: toSnakeCase(key), value, kind: kinds[key] ?? 'log' }],
    );
    if (recorded.length === 0) return;

    for (const { name, value, kind } of recorded) {
      if (kind === 'dimension' || kind === 'annotation') {
        telemetry.tracer.addAnnotation(name, value);
      }
      if (kind === 'metadata') telemetry.tracer.addMetadata(name, value);
    }

    telemetry.logger.appendKeys(
      Object.fromEntries(recorded.map(({ name, value }) => [name, value])),
    );

    const dimensions = recorded.filter(({ kind }) => kind === 'dimension');
    if (dimensions.length > 0) {
      telemetry.metrics.addDimensions(
        Object.fromEntries(
          dimensions.map(({ name, value }) => [name, String(value)]),
        ),
      );
    }
  };
};

export const recordContext: RecordContext<Record<never, never>> =
  createContextRecorder({});

// Powertools keeps logger keys and dimensions in module scope, which outlives one invocation in a warm Lambda.
export const resetTelemetry = (telemetry: Telemetry): void => {
  telemetry.metrics.clearDimensions();
  telemetry.logger.resetKeys();
};
