import type { DomainNames } from './domain.ts';

export type Vocabulary = {
  readonly commands: readonly string[];
  readonly events: readonly string[];
  readonly statuses: readonly string[];
  readonly invariants: readonly string[];
};

const KINDS = [
  ['commands', 'command'],
  ['events', 'event'],
  ['statuses', 'status'],
  ['invariants', 'invariant'],
] as const;

const VOCABULARY_FILE = 'core/src/vocabulary.ts';

export const findDrift = (
  domain: DomainNames,
  vocabulary: Vocabulary,
): string[] => {
  const findings: string[] = [];

  for (const [kind, noun] of KINDS) {
    const documented = domain[kind];
    const declared = new Set(vocabulary[kind]);

    for (const name of documented) {
      if (!declared.has(name))
        findings.push(
          `Domain drift: DOMAIN.md defines ${noun} \`${name}\` but ${VOCABULARY_FILE} does not declare it. Declare it in the vocabulary or remove it from DOMAIN.md.`,
        );
    }
    for (const name of declared) {
      if (!documented.has(name))
        findings.push(
          `Domain drift: ${VOCABULARY_FILE} declares ${noun} \`${name}\` but DOMAIN.md does not define it. Define it in DOMAIN.md or remove it from the vocabulary.`,
        );
    }
  }

  for (const name of domain.transitionStatuses) {
    if (!domain.statuses.has(name))
      findings.push(
        `Domain drift: a DOMAIN.md transition uses status \`${name}\` but the status table does not list it. Add it to the status table.`,
      );
  }

  return findings;
};
