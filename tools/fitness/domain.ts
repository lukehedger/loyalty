export type DomainNames = {
  readonly commands: ReadonlySet<string>;
  readonly events: ReadonlySet<string>;
  readonly statuses: ReadonlySet<string>;
  readonly transitionStatuses: ReadonlySet<string>;
  readonly invariants: ReadonlySet<string>;
};

type Kind = keyof DomainNames;

// CRUD transitions name their command in the Action column.
const COLUMN_KINDS: Readonly<Record<string, Kind>> = {
  Action: 'commands',
  Command: 'commands',
  Event: 'events',
  From: 'transitionStatuses',
  Invariant: 'invariants',
  Status: 'statuses',
  To: 'transitionStatuses',
};

const SEPARATOR_ROW = /^\|(\s*:?-+:?\s*\|)+\s*$/;
const NAME = /`([^`]+)`/g;

const cells = (row: string): string[] =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());

const namesIn = (cell: string): string[] =>
  [...cell.matchAll(NAME)].flatMap((match) => (match[1] ? [match[1]] : []));

const withoutCodeAndComments = (markdown: string): string[] =>
  markdown
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^```[\s\S]*?^```/gm, '')
    .split('\n');

export const parseDomain = (markdown: string): DomainNames => {
  const found: Record<Kind, Set<string>> = {
    commands: new Set(),
    events: new Set(),
    invariants: new Set(),
    statuses: new Set(),
    transitionStatuses: new Set(),
  };
  const lines = withoutCodeAndComments(markdown);

  for (let index = 0; index < lines.length; index++) {
    const header = lines[index] ?? '';
    const separator = lines[index + 1] ?? '';
    if (!header.trim().startsWith('|') || !SEPARATOR_ROW.test(separator.trim()))
      continue;

    const kinds = cells(header).map((column) => COLUMN_KINDS[column]);
    index += 2;
    while (lines[index]?.trim().startsWith('|')) {
      cells(lines[index] ?? '').forEach((cell, column) => {
        const kind = kinds[column];
        if (kind) for (const name of namesIn(cell)) found[kind].add(name);
      });
      index++;
    }
  }

  return found;
};
