import { subscribe } from 'node:diagnostics_channel';
import { ClientRequest } from 'node:http';

export type OpenCall = {
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly target?: string;
  readonly open_ms: number;
};

type StartedCall = Omit<OpenCall, 'open_ms'> & { readonly startedAt: number };

type FetchRequest = {
  readonly origin: string;
  readonly method: string;
  readonly path: string;
};

// Keyed on the request object each channel publishes, so the closing event finds its own call.
const started = new Map<object, StartedCall>();
let tracking = false;

// A query string can carry a session token, so only the path is kept.
const withoutQuery = (path: string): string => path.split('?', 1)[0] ?? path;

const requestOf = (message: unknown): unknown =>
  typeof message === 'object' && message !== null && 'request' in message
    ? message.request
    : undefined;

const isFetchRequest = (request: unknown): request is FetchRequest =>
  typeof request === 'object' &&
  request !== null &&
  'origin' in request &&
  typeof request.origin === 'string' &&
  'method' in request &&
  typeof request.method === 'string' &&
  'path' in request &&
  typeof request.path === 'string';

const trackNodeRequest = (message: unknown): void => {
  const request = requestOf(message);
  if (!(request instanceof ClientRequest)) return;

  const target = request.getHeader('x-amz-target');
  started.set(request, {
    method: request.method,
    host: request.host,
    path: withoutQuery(request.path),
    ...(typeof target === 'string' && { target }),
    startedAt: Date.now(),
  });
  request.once('close', () => started.delete(request));
};

const trackFetch = (message: unknown): void => {
  const request = requestOf(message);
  if (!isFetchRequest(request)) return;

  started.set(request, {
    method: request.method,
    host: new URL(request.origin).hostname,
    path: withoutQuery(request.path),
    startedAt: Date.now(),
  });
};

const settleFetch = (message: unknown): void => {
  const request = requestOf(message);
  if (typeof request === 'object' && request !== null) started.delete(request);
};

// The AWS SDK calls out through `node:https` and `fetch` through undici.
export const trackOpenCalls = (): void => {
  if (tracking) return;
  tracking = true;

  subscribe('http.client.request.start', trackNodeRequest);
  subscribe('undici:request:create', trackFetch);
  subscribe('undici:request:trailers', settleFetch);
  subscribe('undici:request:error', settleFetch);
};

export const openCalls = (): readonly OpenCall[] => {
  const now = Date.now();

  return [...started.values()].map(({ startedAt, ...call }) => ({
    ...call,
    open_ms: now - startedAt,
  }));
};
