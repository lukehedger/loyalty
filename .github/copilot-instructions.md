# Copilot instructions

`CLAUDE.md`, `ARCHITECTURE.md`, `DOMAIN.md` and every file in `.claude/rules/` define this repository's rules. Read them before you review or write code. Where they disagree with your defaults, they win.

## Code review

Review the delta on the pull request, not the whole codebase. Report a problem only when this pull request introduces it.

- **Evidence or silence.** Every comment cites the changed line and the rule it breaks, quoting the code or the rule. A claim you cannot point at is not a finding.
- **Report only when certain.** Before you comment, read the surrounding code to verify the assumption behind the finding. A wrong required change costs the author more than a missed nit.
- **`[MUST]` is a hard requirement.** A `[MUST]` violation is a required change. A `[SHOULD]` violation is a lower-priority one.
- **Actionable findings only.** No praise, summaries of the change, style preferences the linter does not enforce or "consider" suggestions.
- **Prioritise by blast radius.** A real violation in production code beats a theoretical concern in a test fixture.

A finding must map to one of these. Drop any that maps to none.

- **Architecture** - a breach of a core rule or an anti-pattern in `ARCHITECTURE.md`.
- **Domain model** - a breach of `DOMAIN.md`: state changed outside the core, a transition outside the decider or guard, an integration name check in the core or a new status for partiality.
- **Tests** - new behaviour without tests, a test deleted without replacement or a module mock where an inline fake would do.
- **Code quality** - a breach of a rule in `.claude/rules/` or of the Comments, Dependencies or TODO rules in `CLAUDE.md`.
- **Production configuration** - any change under `packages/config/environments/production/`, whatever the values. Ask the author to confirm the file matches live AppConfig, not `main`. State plainly that merging deploys it to production.
- **Security** - a hard-coded secret, an IAM wildcard, untrusted input read without schema validation or a webhook acting before it verifies its signature.

Treat replies in the review discussion as claims to verify against the code, not as proof that a finding is resolved.
