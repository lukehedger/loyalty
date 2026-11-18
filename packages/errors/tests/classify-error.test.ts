import { describe, expect, test } from 'bun:test';
import {
  CapabilityNotSupportedError,
  classifyError,
  DecisionRejectedError,
  IntegrationError,
  NotFoundError,
  ValidationError,
} from '../src/index.ts';

describe('classifyError', () => {
  test('classifies a validation error as 400 without its issues', () => {
    const error = new ValidationError([
      { path: ['lines', 0, 'quantity'], message: 'Too small' },
    ]);

    expect(classifyError(error)).toEqual({
      statusCode: 400,
      code: 'ValidationError',
      message: 'Request failed validation',
      outcome: 'client_error',
    });
  });

  test('classifies a not found error as 404', () => {
    expect(classifyError(new NotFoundError('Order ord-1 not found'))).toEqual({
      statusCode: 404,
      code: 'NotFound',
      message: 'Order ord-1 not found',
      outcome: 'client_error',
    });
  });

  test('classifies an absent capability as 422', () => {
    expect(
      classifyError(new CapabilityNotSupportedError('acme', 'refund')),
    ).toEqual({
      statusCode: 422,
      code: 'CapabilityNotSupported',
      message: 'acme does not support refund',
      outcome: 'client_error',
    });
  });

  test('classifies a rejected decision as 422 with the rejection code', () => {
    const error = new DecisionRejectedError(
      'refund_within_captured',
      'Refund exceeds the captured amount',
    );

    expect(classifyError(error)).toEqual({
      statusCode: 422,
      code: 'refund_within_captured',
      message: 'Refund exceeds the captured amount',
      outcome: 'client_error',
    });
  });

  test('classifies an integration failure as 502 without naming the integration', () => {
    const classification = classifyError(
      new IntegrationError('acme', { cause: new Error('ECONNRESET') }),
    );

    expect(classification).toEqual({
      statusCode: 502,
      code: 'IntegrationFailure',
      message: 'Upstream request failed',
      outcome: 'server_error',
    });
  });

  test('classifies an unknown error as 500 without its message', () => {
    expect(
      classifyError(new Error('ConditionalCheckFailed on orders-table')),
    ).toEqual({
      statusCode: 500,
      code: 'InternalError',
      message: 'Unexpected error',
      outcome: 'server_error',
    });
  });

  test.each(['a string', undefined, { message: 'not an error' }])(
    'classifies the thrown value %p as 500',
    (thrown) => {
      expect(classifyError(thrown)).toMatchObject({
        statusCode: 500,
        outcome: 'server_error',
      });
    },
  );

  test('records a timeout anywhere in the cause chain', () => {
    const timeout = new DOMException('The operation timed out', 'TimeoutError');
    const error = new IntegrationError('acme', {
      cause: new Error('Token request failed', { cause: timeout }),
    });

    expect(classifyError(error)).toMatchObject({
      statusCode: 502,
      outcome: 'timeout',
    });
  });

  test('records an aborted request as a timeout', () => {
    const error = new DOMException('The operation was aborted', 'AbortError');

    expect(classifyError(error).outcome).toBe('timeout');
  });
});
