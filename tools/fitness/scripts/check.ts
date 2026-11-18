import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { vocabulary } from '@loyalty/core';
import { Glob } from 'bun';
import { parseDomain } from '../domain.ts';
import { findDrift } from '../drift.ts';
import { findUntestedInvariants, propertyNames } from '../invariants.ts';

const root = join(import.meta.dirname, '../../..');

const domain = parseDomain(await readFile(join(root, 'DOMAIN.md'), 'utf8'));

const tested = new Set<string>();
for await (const path of new Glob('core/tests/**/*.test.ts').scan(root)) {
  for (const name of propertyNames(await readFile(join(root, path), 'utf8')))
    tested.add(name);
}

const findings = [
  ...findDrift(domain, vocabulary),
  ...findUntestedInvariants(vocabulary.invariants, tested),
];

for (const finding of findings) console.error(finding);
if (findings.length > 0) process.exit(1);

console.info('Fitness functions pass.');
