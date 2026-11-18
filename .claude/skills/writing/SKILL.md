---
name: writing
description: How to write prose. Apply to every artefact that leaves the session as words - documentation, README files, PR descriptions, PR review comments, tickets, issues, ADRs and commit message bodies. Use when drafting or editing any of those. Also use it when asked to "rewrite this", "tighten this", "check the wording" or "make this read better". Covers simplified technical English, punctuation (no em dashes, no Oxford comma), British spelling and the phrasings to avoid.
---

# Writing

This governs every artefact you produce in words. Draft first, then run the self-check at the bottom before you publish.

## Scope

Applies to documentation, README files, PR descriptions, PR review comments, tickets, issues, ADRs and commit message bodies.

Out of scope:

- **Chat replies.** Keep these concise and conversational.
- **Code identifiers, log keys, config values and quoted error strings.** Reproduce them exactly. A symbol you tidied up in prose sends the reader to a grep that finds nothing.
- **Code comments.** `CLAUDE.md` governs those. The register rules below still hold.
- **PR titles and commit subjects.** Use a conventional-commit prefix, such as `feat: Add DLQ to the webhook consumer`.

## Length

Say each thing once, in the fewest words that keep it clear. Cut anything the diff, the ticket or a linked document already says.

**A PR description is 150 words or fewer.** Write what changed and why in one or two sentences. Write verification in one or two sentences. Add one review focus line and the `Closes` line. Mention a known limit only when a reviewer must act on it.

**Verification states the result.** "Tests, types and lint pass." is enough. Do not name test suites, count tests or list the cases they cover. Add evidence only when it goes beyond the standard checks, such as a manual run in a test account.

Example PR description:

```
This PR moves webhook processing to a durable function. The handler now stores the raw delivery and returns 200. The durable function replays it through the core with retries bounded by the execution timeout.

Tests, types and lint pass. A replay of a captured delivery in a test account produced the same events as before.

**Please focus on the retry bound in `async/webhook.ts`.**

Closes #123
```

## Sentence shape and rhythm

The structure below comes from ASD-STE100 Simplified Technical English, the controlled language aerospace maintenance manuals use so that a tired reader with imperfect English cannot misread a step. The full standard is free at https://asd-ste100.org. We take its structural discipline. We skip its word-count limits and its approved-word list.

**One idea per sentence.** Two ideas joined by a conjunction hide which one matters.

**Active voice. Name the actor.**

- Passive: "The request is rejected when the status is closed."
- Active: "The decider rejects the request when the account is closed."

**Simple present or simple past.** "The handler reads the cache" beats "the handler will be reading the cache".

**Keep the articles.** "Handler reads config from cache" is a telegram. "The handler reads the config from the cache" is a sentence.

**Split any sentence that needs two commas to stand up.**

- One sentence: "Because the deploy replaces the whole profile, a stale file reverts anything changed directly in the console, which is why the checked-in copy is only correct when it matches what is live."
- Two: "The deploy replaces the whole profile. A stale file therefore reverts anything changed directly in the console."

**Three words maximum in a noun cluster.** A longer cluster makes the reader guess which noun modifies which.

- "adapter config schema validation failure" becomes "the config schema for the adapter failed validation".

**Prefer the single verb over the phrasal verb.** "configure" over "set up", "install" over "put in place", "reduce" over "cut down on", "determine" over "find out".

**No semicolons.** A semicolon joins two sentences that should be two sentences.

**One word, one meaning.** Pick one term per concept, then repeat it. A synonym reads as a second thing. Use the terms in the ubiquitous language of `DOMAIN.md` and never vary them.

**No em dashes. No spaced-hyphen asides.** Replace both with a full stop, a comma, a colon, parentheses or a rewrite.

- Em dash: `The deploy has no gate—it goes straight to prod.`
- Spaced hyphen: `The deploy has no gate - it goes straight to prod.`
- Rewrite: `The deploy has no gate. It goes straight to prod.`

## Punctuation

**No Oxford comma.** Match this consistently.

- "test, deliver, recover and observe"
- "highly-available, low-latency and in a constant state"

**No `, and`.** Never a comma followed by "and", including when it joins two independent clauses. Split into two sentences or drop the comma.

- Before: "The queue is not a retry mechanism, and treating it like one hides failures."
- After: "The queue is not a retry mechanism. Treating it like one hides failures."

## Register

**Declarative.** State the point, then explain it. The first sentence of a paragraph carries the claim. The rest earn it.

**Strong verbs.** "The hook denies the call" beats "the hook is responsible for the denial of the call".

**No filler, no hedging, no pleasantries.** "It is worth noting that", "essentially", "please note", "as you may know", "I would suggest that", "arguably", "somewhat". Delete each one and the sentence improves.

**British English.** optimise, behaviour, favour, artefact, sanitised, initialise, catalogue, licence as the noun. American spelling stays untouched inside code, config keys and quoted third-party text: the `Authorization` header, the `color` property.

**Clarity outranks every rule above.** Where a rule would leave a sentence ambiguous, break it and say the thing plainly.

## Things to avoid

**Contrastive negation.** No "not X, but Y". No "it's not X, it's Y". No "not just X, Y". These read as a tell of AI-generated prose. State Y directly, with no X set up to knock down.

- "It's not about coverage, it's about confidence" becomes "You are aiming for confidence to ship."

**Marketing speak.** unlock, leverage as a verb outside finance and physics, best-in-class, robust, seamless, game changer, blazing fast, first-class. Each asserts quality while showing none.

- "a robust retry mechanism" becomes "the retry gives up after three attempts and sends the message to the DLQ".

**Vague claims.** Every assertion you keep carries one of four things: a concrete example, a code snippet, a cited source or a named failure mode. Cut a claim the reader does not need rather than add evidence to it.

- Vague: "this improves cold start performance".
- Concrete: "this cuts the cold start from 1.2s to 400ms by constructing the SDK client outside the handler".

## Words that die on sight

| Instead of                 | Write                                                                     |
| -------------------------- | ------------------------------------------------------------------------- |
| load-bearing               | Name the consequence: "delete this and every write skips the guard"       |
| sentinel, sentinel-wrapped | marker lines, or name them: "between `FOO_BEGIN` and `FOO_END`"           |
| rotting, decaying, bit rot | going stale, drifting apart, losing coherence                             |
| utilise                    | use                                                                       |
| in order to                | to                                                                        |

Add a row whenever a reviewer flags a term. The general move: prefer the concrete noun over the term of art. Never rename a mechanism the code or the doc has already named.

## Self-check

Run this on the draft before you publish. Every item is a mechanical scan.

1. Search for an em dash. Zero allowed.
2. Search for `-` used as an aside. Rewrite each hit. List bullets and table cells are fine.
3. Search for `, and`. Zero allowed.
4. Read every list of three or more items. Delete the comma before the final "and" or "or".
5. Search for American spellings: `-ize`, `-ization`, `-yze`, `color`, `behavior`, `favor`.
6. Search for "not ... but", "it's not" and "not just". Rewrite each as a direct statement.
7. Scan the ban table above.
8. Take every claim in the draft and point at the example, snippet, source or failure mode backing it. Cut or evidence the ones with nothing.
9. Read the first sentence of each paragraph on its own. Together they should carry the argument.
10. Delete every sentence the reader would not miss, including anything the diff already shows.
11. Count the words in a PR description. Cut to 150 or fewer.
