# Correctness strategy

Correctness comes from automated checks. The agent runs the fast checks before it hands over a change. CI runs them again with the slower checks before merge.

Each check proves one thing. Use the cheapest check that proves it. Run checks from cheapest to most expensive and stop at the first failure.

## Checks

| Check                     | Proves                                                                                                             | Runs                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Lint and format           | The code follows every rule a tool can check, including the layer boundaries and the pure core in ARCHITECTURE.md. | Every change                  |
| Types                     | Shapes agree across every boundary. An unhandled variant fails to compile.                                         | Every change                  |
| Fitness functions         | The names in DOMAIN.md match the code. Every invariant in DOMAIN.md has a property test.                           | Every change                  |
| Property tests            | Every invariant in DOMAIN.md holds for generated commands.                                                         | Every change                  |
| Assertions                | The code fails loudly when a state it rules out occurs.                                                            | Every invocation              |
| Unit tests                | Each specified example produces the expected decision or response.                                                 | Every change                  |
| Infrastructure assertions | The synthesised stack has the resources and settings its tests assert.                                             | Every change                  |
| Mutation tests            | The core's tests fail when the core's behaviour changes.                                                           | Core changes and before merge |
| Integration tests         | The shell works against real cloud services in a disposable environment.                                           | Before merge                  |
| Production signals        | Alarms, failure metrics and SLOs show the system behaves in production.                                            | Continuously                  |

## Rules

- **Test the core with plain data.** State and a command go in. A decision comes out. A core test needs no fakes.
- **Fake only the layer below.** A shell test injects inline fakes for the layer it calls. Integration tests use real services, never local emulators.
- **Name the invariant.** Each property test names the DOMAIN.md invariant it checks. An invariant without a property fails a fitness function.
- **Assert the negative space.** State what must never happen at the start and end of each core function. A failed assertion throws and is never caught to carry on. The gate then persists nothing, so the state stays as it was.
- **Kill the mutants.** A surviving mutant is a change in behaviour that no test notices. Add the test that kills it.
- **Start every bug fix with a failing test.** The test reproduces the bug before the fix lands.
- **Fail with a fix.** A failing check says what broke, which rule it breaks and how to fix it.
- **Treat a flaky test as a failing test.** Fix it or delete it. Never retry it.
- **Set no coverage target.** Each test proves something a cheaper check cannot.
