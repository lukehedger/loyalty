# @loyalty/telemetry

Logging, tracing and metrics for Lambda handlers through Powertools. Each invocation emits one wide structured event that carries all the context gathered during the request. Handlers record context. They do not log each step.

## Public API

- `createTelemetry({ serviceName, namespace })` - a `Telemetry` (logger, tracer and metrics) backed by Powertools. Metrics publish to the CloudWatch `namespace` in Embedded Metric Format.
- `instrument(telemetry, handler, { deadlineMarginMs? })` - wraps an API Gateway handler. It resets the context a warm container kept, traces the invocation in a `handler` subsegment, records `route`, `request_id`, `client_id` (from the Cognito authorizer claim only), `status_code` and `outcome`, then writes the wide event as `invocation` and flushes metrics. With `deadlineMarginMs` it writes the wide event that long before the Lambda timeout, with `outcome: timeout` and the outbound calls still open in `open_calls`.
- `recordContext(telemetry, context)` - records the request keys.
- `createContextRecorder<AppContext>(routing)` - returns a recorder for the request keys plus the app's own keys. `routing` declares a kind for every app key, so a key without one fails to compile.
- `resetTelemetry(telemetry)` - clears logger keys and metric dimensions, for a shell that does not use `instrument`.
- Types: `Telemetry`, `TelemetryLogger`, `TelemetryTracer`, `TelemetryMetrics`, `TelemetryConfig`, `MetricUnit`, `RequestContext`, `Outcome`, `ContextKind`, `ContextRouting`, `ContextShape`, `ContextValue`, `RecordContext`, `ApiHandler` and `InstrumentOptions`.

Every recorded key reaches the wide event in snake case. Its kind decides where else it goes:

| Kind         | Wide event | X-Ray      | Metric dimension |
| ------------ | ---------- | ---------- | ---------------- |
| `dimension`  | yes        | annotation | yes              |
| `annotation` | yes        | annotation | no               |
| `metadata`   | yes        | metadata   | no               |
| `log`        | yes        | no         | no               |

Give `dimension` only to low-cardinality keys, since each value is a new metric series. `route` and `outcome` are dimensions, `status_code` and `client_id` are annotations and `request_id` is log only.

`outcome` is `success`, `client_error`, `server_error` or `timeout`. `instrument` derives it from the response status: 4xx is a client error, 504 a timeout and any other 5xx a server error. A thrown error is a server error unless it is a timeout or abort.

A metric added without dimensions carries one dimension set for each recorded context that had a dimension, so its series cannot be summed. Pass explicit dimensions to `addMetric` to emit it once with only those.

X-Ray writes land only inside an open `tracer.trace()` subsegment. Elsewhere they are skipped, while the wide event key and metric dimension still land.

## Example

```ts
import {
  createContextRecorder,
  createTelemetry,
  instrument,
} from '@loyalty/telemetry';

type OrderContext = {
  readonly orderId: string;
  readonly channel: 'web' | 'store';
};

const recordOrderContext = createContextRecorder<OrderContext>({
  orderId: 'annotation',
  channel: 'dimension',
});

const telemetry = createTelemetry({
  serviceName: 'orders-create',
  namespace: 'Orders',
});

export const handler = instrument(telemetry, async () => {
  recordOrderContext(telemetry, { orderId: 'order-1', channel: 'web' });
  telemetry.metrics.addMetric('OrderCreated', 'Count', 1, { channel: 'web' });

  return { statusCode: 201, body: '{}' };
});
```
