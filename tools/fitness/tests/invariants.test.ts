import { describe, expect, test } from 'bun:test';
import { findUntestedInvariants, propertyNames } from '../invariants.ts';

describe('propertyNames', () => {
  test('reads the name from each invariant call', () => {
    const source = `
      invariant('balance-never-negative', arbitrary, holds);
      invariant(
        "captured-within-authorised",
        arbitrary,
        holds,
      );
    `;
    expect(propertyNames(source)).toEqual([
      'balance-never-negative',
      'captured-within-authorised',
    ]);
  });
});

describe('findUntestedInvariants', () => {
  test('reports each invariant without a property', () => {
    expect(
      findUntestedInvariants(
        ['balance-never-negative', 'captured-within-authorised'],
        new Set(['balance-never-negative']),
      ),
    ).toEqual([
      "Invariant coverage: invariant `captured-within-authorised` has no property test. Add `invariant('captured-within-authorised', ...)` to a test in core/tests.",
    ]);
  });
});
