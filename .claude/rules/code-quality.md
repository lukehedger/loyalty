# Code quality

These rules hold for every change. Several run counter to habit, so do not guess them from experience.

## Reliability

**[MUST]** Reliability is the most important property of the system. Write observable software, just as you write testable software. Treat cost as a measure of architectural efficiency. Know the AWS service limits you depend on. Make fault tolerance a primary concern.

**[MUST]** Availability is the main measure of performance. On critical synchronous paths, keep latency within an agreed budget and track it with an SLO where you can.

## Simplicity and abstractions

**[SHOULD]** Choose the simplest option. Simple can take longer than easy. It pays off later.

**[SHOULD]** Defer abstractions. Start with one of everything and accept repetition. Abstract only when all three hold:

- The same logic exists in three or more places.
- The duplication causes real maintenance pain, such as one bug fix needing several edits.
- You understand every use case well enough to serve them all.

Every abstraction has a cost and can leak. Repetition is debt with a known repayment plan. A premature abstraction is debt with none.

**[CONSIDER]** Defer decisions to the last responsible moment, particularly one-way doors. Ask how likely the thing is to change. Then ask how easily you could change it later.

## Control flow and errors

**[SHOULD]** Put important things at the top of a file. Branch as early as possible: check every condition in the top-level function, then call functions that do the work with few checks of their own.

**[SHOULD]** Return or throw early. The happy path is the last line of the function.

```ts
const completeOrder = (order: Order): Receipt => {
  if (order.items.length === 0) throw new ValidationError('Order has no items');
  if (order.total <= 0) throw new ValidationError('Order total must be positive');

  return issueReceipt(order);
};
```

**[MUST]** Error messages tell the caller what went wrong: `'Capture failed: amount exceeds authorised amount'`, not `'Error'`. A public API error is informative but never leaks internals such as table names, column names or the expected request format.

**[SHOULD]** Give each kind of failure its own error class. Map errors to responses in one place, never by hand in each handler.

## Logging

**[MUST]** Each invocation emits one wide structured event with all the context gathered during the request. Add identifiers to that context. Do not log each step.

**[MUST]** Never log whole objects. Log specific identifiers and values, never customer or card data. Prefer trace annotations for timing detail.

## Naming

**[SHOULD]** Get the nouns and verbs right. A good name gives the reader a crisp mental model and shows you understand the domain. Use the ubiquitous language in `DOMAIN.md`. Do not abbreviate.

Name AWS resources by their role in the data flow: `pending-fraud-analysis-queue`, not `fraud-queue`.

## Comments

Follow the Comments section of `CLAUDE.md`. Write each comment as a sentence, with a space after `//`, a capital letter and a full stop.

## Tests

**[MUST]** Write them. Keep them short, simple and structured. Aim for confidence, not coverage. Tests live in a `tests/` folder at the root of the package under test, with the `.test.ts` suffix.

## Refactoring

**[SHOULD]** Refactor immediately after you create a feature, in small steps (Tidy First). Writing and reviewing are separate passes. Refactor an established feature only for a measurable gain: lower cost, faster responses or a removed bug risk.

## Pipelines

**[MUST]** Keep the system releasable at all times. Keep pipelines simple and fast. A broken or degraded pipeline alerts and becomes the top priority: pause feature work until it is fixed.

## Security and tooling

**[MUST]** Never hard-code tokens or passwords. Treat the supply chain as a threat: every dependency is code you run without reading.

**[SHOULD]** Minimise dependencies. Pin exact versions and keep them current with automated updates.

## Code review

A reviewer checks quality and adherence to these rules. On functionality, the reviewer trusts the author and looks only for clear flaws or missed cases. The reviewer resolves a thread once satisfied. The author never does.

Keep each PR small and inside the scope of its ticket. Use the description to tell the reviewer what changed and why.
