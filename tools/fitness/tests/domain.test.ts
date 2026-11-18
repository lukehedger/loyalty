import { describe, expect, test } from 'bun:test';
import { parseDomain } from '../domain.ts';

const domain = `
## 3. The engine

| Command | Event |
| ------- | ----- |
| \`OpenAccount\` | \`AccountOpened\` |
| \`Deposit\` | \`DepositRequested\`, \`DepositFailed\` |

| From | Action | To |
| ---- | ------ | -- |
| \`pending\` | \`Approve\` | \`approved\` |

## 4. Lifecycle statuses

\`\`\`
| Status |
| ------ |
| \`ignored\` |
\`\`\`

| Status | Meaning |
| ------ | ------- |
| \`pending\` | Waiting for approval |

<!--
| Invariant | Meaning |
| --------- | ------- |
| \`ignored\` | |
-->

| Invariant | Meaning |
| --------- | ------- |
| \`balance-never-negative\` | The balance never drops below zero |
| | |
`;

describe('parseDomain', () => {
  const names = parseDomain(domain);

  test('reads commands from the Command and Action columns', () => {
    expect([...names.commands]).toEqual(['OpenAccount', 'Deposit', 'Approve']);
  });

  test('reads every event in a cell', () => {
    expect([...names.events]).toEqual([
      'AccountOpened',
      'DepositRequested',
      'DepositFailed',
    ]);
  });

  test('separates listed statuses from statuses used in transitions', () => {
    expect([...names.statuses]).toEqual(['pending']);
    expect([...names.transitionStatuses]).toEqual(['pending', 'approved']);
  });

  test('reads invariants and skips empty rows', () => {
    expect([...names.invariants]).toEqual(['balance-never-negative']);
  });

  test('ignores tables inside code blocks and comments', () => {
    expect(names.statuses.has('ignored')).toBe(false);
    expect(names.invariants.has('ignored')).toBe(false);
  });

  test('finds nothing in an unfilled template', () => {
    const empty = parseDomain(
      '| Invariant | Meaning |\n| --- | --- |\n| | |\n',
    );
    expect(empty.invariants.size).toBe(0);
  });
});
