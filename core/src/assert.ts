// Thrown when the core reaches a state it rules out. Never catch it to carry on.
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

// A function declaration, because TypeScript only accepts an `asserts` signature on an explicitly typed function.
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AssertionError(message);
}

// The message never includes the value, so customer data cannot reach a log.
export function unreachable(_value: never, message: string): never {
  throw new AssertionError(message);
}
