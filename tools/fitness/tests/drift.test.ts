import { describe, expect, test } from 'bun:test';
import type { DomainNames } from '../domain.ts';
import { findDrift, type Vocabulary } from '../drift.ts';

const domain = (names: Partial<Record<keyof DomainNames, string[]>>) => ({
  commands: new Set(names.commands),
  events: new Set(names.events),
  invariants: new Set(names.invariants),
  statuses: new Set(names.statuses),
  transitionStatuses: new Set(names.transitionStatuses),
});

const vocabulary = (names: Partial<Vocabulary>): Vocabulary => ({
  commands: [],
  events: [],
  invariants: [],
  statuses: [],
  ...names,
});

describe('findDrift', () => {
  test('passes when DOMAIN.md and the vocabulary agree', () => {
    expect(
      findDrift(
        domain({ commands: ['Open'], statuses: ['open'] }),
        vocabulary({ commands: ['Open'], statuses: ['open'] }),
      ),
    ).toEqual([]);
  });

  test('reports a name DOMAIN.md defines but the vocabulary does not', () => {
    const [finding] = findDrift(
      domain({ invariants: ['balance-never-negative'] }),
      vocabulary({}),
    );
    expect(finding).toContain(
      'DOMAIN.md defines invariant `balance-never-negative`',
    );
  });

  test('reports a name the vocabulary declares but DOMAIN.md does not', () => {
    const [finding] = findDrift(domain({}), vocabulary({ events: ['Opened'] }));
    expect(finding).toContain('declares event `Opened` but DOMAIN.md');
  });

  test('reports a transition status missing from the status table', () => {
    const findings = findDrift(
      domain({ statuses: ['open'], transitionStatuses: ['open', 'closed'] }),
      vocabulary({ statuses: ['open'] }),
    );
    expect(findings).toEqual([
      'Domain drift: a DOMAIN.md transition uses status `closed` but the status table does not list it. Add it to the status table.',
    ]);
  });
});
