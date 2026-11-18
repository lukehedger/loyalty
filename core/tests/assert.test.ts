import { describe, expect, test } from 'bun:test';
import { AssertionError, assert, unreachable } from '../src/index.ts';

describe('assert', () => {
  test('returns when the condition holds', () => {
    expect(() => assert(true, 'Never thrown')).not.toThrow();
  });

  test('throws an AssertionError when the condition fails', () => {
    const fails = () => assert(false, 'Balance is negative');
    expect(fails).toThrow(AssertionError);
    expect(fails).toThrow('Balance is negative');
  });
});

describe('unreachable', () => {
  test('throws an AssertionError', () => {
    const fails = () => unreachable('closed' as never, 'Unhandled status');
    expect(fails).toThrow(AssertionError);
    expect(fails).toThrow('Unhandled status');
  });
});

describe('AssertionError', () => {
  test('carries its own name so the shell can tell it from a rejection', () => {
    expect(new AssertionError('Broken').name).toBe('AssertionError');
  });
});
