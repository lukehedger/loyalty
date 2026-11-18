const PROPERTY = /\binvariant\(\s*(['"`])([^'"`]+)\1/g;

export const propertyNames = (source: string): string[] =>
  [...source.matchAll(PROPERTY)].flatMap((match) =>
    match[2] ? [match[2]] : [],
  );

export const findUntestedInvariants = (
  invariants: readonly string[],
  tested: ReadonlySet<string>,
): string[] =>
  invariants
    .filter((name) => !tested.has(name))
    .map(
      (name) =>
        `Invariant coverage: invariant \`${name}\` has no property test. Add \`invariant('${name}', ...)\` to a test in core/tests.`,
    );
