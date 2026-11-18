# Loyalty

Loyalty records the points that members earn and redeem in a customer loyalty programme. Checkout and order services call its API to award points on purchases. Customer-facing apps read balances and redeem rewards through it.

**[MUST]** Read [DOMAIN.md](DOMAIN.md) before you design or implement any change to the domain model. It defines the data model, lifecycle statuses, invariants and the integration boundary. If a change cannot fit the model, change the model deliberately and update DOMAIN.md in the same PR. Do not work around it locally.

**[MUST]** Read [ARCHITECTURE.md](ARCHITECTURE.md) before you design or implement a non-trivial change. It defines the core rules, the AWS strategy and the anti-patterns. If a change genuinely needs a rule to change, update ARCHITECTURE.md in the same change and give the reason.

## Observability

Each invocation emits exactly one structured log line that carries all the context gathered during the request. Handlers add identifiers to that context. They do not log each step.

## Dependencies

**[MUST]** Define every third-party dependency version in the root `package.json` `catalog`. Use `catalog:` in workspace manifests and `workspace:*` for a dependency on another workspace package. Never put a version, range or tag directly in a workspace manifest.

## Verification

**[MUST]** Run `bun verify` from the repository root before you hand over a change and fix what it reports. It runs Biome lint and format, the type check, the fitness functions and the unit tests. It fails if any of them fails.

**[MUST]** When you change `core/`, also run `bun mutation`. Add tests until it passes.

## Pull requests

**[MUST]** Follow the [PR template](.github/PULL_REQUEST_TEMPLATE.md). Every PR needs a title with the primary change, a description of what changed and why, the verification method and the review focus. Include the ticket key in the title when there is one.

Write the PR body as plain prose. Do not add markdown headings, bullet-only descriptions or a generated-by footer.

## Runtime configuration

The JSON files in `packages/config/environments/` are live AppConfig profiles. A merge to `main` deploys them to production. Each deploy replaces the whole profile, so a value changed directly in AppConfig is reverted when a stale file deploys.

**[MUST]** Never edit `environments/production/*.json` on your own initiative. If a task seems to need it, say so and let the user decide.

**[MUST]** If a production config file is in your changes, warn the user before you push or open a PR. Name the file. State that merging makes it live in production. List the keys added, changed and removed with old and new values. State that any key missing from the file is dropped from live AppConfig and that you cannot see live AppConfig to confirm the file is complete. Ask the user to check it against live AppConfig before merging.

**[SHOULD]** Raise a production config change as its own PR, never bundled with code.

## Security

**[MUST]** Never commit API keys, secrets or credentials.

**[MUST]** Never expose PII or sensitive data in logs. Log identifiers only.

## Comments

A comment is a durable note about code nuance for whoever opens the file in a year. It is not a record of the PR that introduced it.

**[MUST]** Write from the perspective of the code as it now stands. Do not narrate the branch's history: earlier approaches, reverts or what a reviewer asked for. That belongs in the commit message or the PR description.

**[MUST]** Explain why, never what. If the comment restates the code, delete it.

**[SHOULD]** Use comments sparingly. Default to none.

**[SHOULD]** Keep to one line, two at most.

A comment that needs a paragraph means one of two things. Either the code is too complicated and needs simplifying, or the knowledge belongs in documentation such as DOMAIN.md, ARCHITECTURE.md or an ADR. Leave at most a one-line pointer in the code.

## Scope and TODOs

Stay inside the scope of the task. Work you notice along the way (a latent bug, a rough abstraction, a missing test, dead code) does not get fixed in the same change. Mention it in your closing summary.

**[MUST]** Every `TODO` carries a ticket key: `// TODO(PROJ-1234): remove the fallback once all clients are migrated.` A bare `TODO`, or one tagged with a name or a date, is debt that nobody owns.

**[SHOULD]** Use `TODO`s sparingly. Only findings with real consequences if forgotten earn one.

At the end of the change, once the request is built and verified:

1. List the out-of-scope findings worth tracking, with one line of reasoning each.
2. Ask the user whether they want a `TODO` for each one.
3. For each one accepted, offer to create a ticket. The ticket names the file, what the `TODO` marks and requires the `TODO` to be removed as part of the work.
4. Add the comment with the ticket key.

If the user declines, add nothing.
