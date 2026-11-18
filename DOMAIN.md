# Loyalty Domain

This document defines the points ledger for a customer loyalty programme. Each member has one account. The account is an append-only stream of earns and spends. An append-only stream gives an audit trail for every point. It also lets the balance be rebuilt from history at any time. The model holds only accounts, earns and spends. Every other concern stays with the system that owns it.

The code is the source of truth. Where this document and the code disagree, this document is stale and must be fixed. The authoritative definitions live in `core/src/account.ts`.

If a feature cannot be expressed within the model, change the model deliberately and update this document in the same change.

Every name in backticks in the command, event, transition, status and invariant tables must match `core/src/vocabulary.ts` exactly. The domain drift fitness function fails when a name exists on one side only.

---

## 1. What the domain is

Loyalty owns member accounts and the points on them. It records every earn and every spend. It also holds the earn rate.

Loyalty does not own member identity, orders, payments or rewards. The identity system owns the member. The order service owns the order and its payment. The rewards system owns the reward catalogue and fulfilment.

The central boundary is that Loyalty owns points and nothing else. Other systems refer to a member, an order or a reward by their own IDs. Loyalty stores those IDs and never reads the state behind them.

### Ubiquitous language

Use these terms exactly. Do not introduce synonyms.

- **Member** - a customer enrolled in the programme. The identity system issues the member ID.
- **Account** - the record of a member in Loyalty. Each member has exactly one account.
- **Points** - the unit of value. Points are always a whole number.
- **Balance** - the points on an account that the member can spend. The balance never goes below zero.
- **Earn** - an award of points for a purchase. Loyalty computes the points from the purchase amount and the earn rate.
- **Purchase amount** - the value of an order in minor units (pence) that the order service sends.
- **Earn rate** - the points awarded per major currency unit, such as 1 point per £1. It is a whole number of one or more. AppConfig holds it.
- **Spend** - a deduction of points for a reward that the caller names by reward ID.

---

## 2. The data model

### 2.1 The account

Each account is one append-only event stream. The stream ID is the member ID. `account_opened` starts the stream and fixes the immutable context. `points_earned` and `points_spent` follow it. The current state is the fold of the events through evolve. Loyalty never stores state and never changes an event.

### 2.2 State

```ts
type Account = {
  readonly status: 'open';
  readonly memberId: MemberId;
  readonly openedAt: Timestamp;
  readonly balance: Points;
};

// A stream with no events has no account.
type AccountState = Account | undefined;
```

The balance is the only quantity that matters. `points_earned` adds to it. `points_spent` subtracts from it. No other event changes it. `Points` is a branded integer that is zero or more. `Timestamp` is a branded ISO 8601 UTC string, because the core is deterministic and cannot use `Date`.

### 2.3 Immutable context

`account_opened` fixes the member ID and the opening time. No later event changes them.

### 2.4 Idempotency

An earn is keyed by its order ID, so one order earns at most once. A spend is keyed by a spend ID that the caller generates. The gate compares the key with the keys the stream already holds. A repeated earn or spend appends nothing and returns the current state. `open_account` takes no key. A second `open_account` is rejected under `account_opens_once`.

### 2.5 Persistence

| Key | Format               |
| --- | -------------------- |
| PK  | `ACCOUNT#{memberId}` |
| SK  | `EVENT#{sequence}`   |

The sequence is zero-padded to 12 digits, so the sort key orders events. The only access pattern is a read of one stream by member ID. There are no secondary indexes. A new access pattern goes behind the store interface.

---

## 3. The engine

```
Command ──▶ Decider ──▶ Event(s) ──▶ Evolve ──▶ State
```

### 3.1 Commands and events

A command is an imperative verb phrase. An event is the same phrase in the past tense. Each command produces exactly one event when the decider accepts it.

| Command        | Event            |
| -------------- | ---------------- |
| `open_account` | `account_opened` |
| `earn_points`  | `points_earned`  |
| `spend_points` | `points_spent`   |

- `open_account` carries the member ID and the opening time.
- `earn_points` carries the order ID, the purchase amount and the earn rate. The shell reads the earn rate from AppConfig and passes it in as data. `points_earned` records all three with the points awarded, so a replay never depends on the current config.
- `spend_points` carries the spend ID, the reward ID and the points. `points_spent` records all three.

### 3.2 Creation

`open_account` is the only command the decider accepts on an empty stream. It sets the balance to zero. Every other command on an empty stream is rejected under `points_need_an_account`.

### 3.3 Decider

```ts
decide(state: AccountState, command: Command): Decision
```

The decider is a pure function. It returns an accepted decision with one event or a rejection that names the invariant it protects.

- `open_account` on an existing account is rejected under `account_opens_once`.
- `earn_points` computes the points as `floor(purchaseAmount × earnRate / 100)`. The purchase amount is in pence. The earn rate is points per pound. An earn that computes zero points is rejected under `points_move_in_positive_amounts`.
- `spend_points` with zero points is rejected under `points_move_in_positive_amounts`. A spend greater than the balance is rejected under `balance_never_negative`.

### 3.4 Evolve

```ts
evolve(state: AccountState, event: Event): AccountState
```

- `account_opened` creates the account with status `open` and a balance of zero.
- `points_earned` adds the points to the balance.
- `points_spent` subtracts the points from the balance.

Evolve asserts that the event fits the state. For example, `points_spent` on an empty stream fails an `assert`.

---

## 4. Lifecycle statuses

```
(no account) ── open_account ──▶ open
```

| Status | Meaning                                          |
| ------ | ------------------------------------------------ |
| `open` | The account exists and accepts earns and spends. |

An empty stream means the account does not exist. It is the absence of state, so it has no status. No status is terminal. An account stays open for as long as it exists.

---

## 5. Invariants

| Invariant                         | Meaning                                                                   |
| --------------------------------- | ------------------------------------------------------------------------- |
| `balance_never_negative`          | No sequence of commands makes the balance negative.                       |
| `balance_matches_history`         | The balance equals the points earned minus the points spent.              |
| `earn_matches_rate`               | Each earn awards exactly `floor(purchaseAmount × earnRate / 100)` points. |
| `points_move_in_positive_amounts` | Each earn and each spend moves at least one point.                        |
| `account_opens_once`              | `open_account` on an existing account is rejected.                        |
| `points_need_an_account`          | Earns and spends on an empty stream are rejected.                         |

`core/src/vocabulary.ts` declares every invariant name. A rejection names the invariant it protects. Each invariant has a property test, declared with the `invariant` helper in `core/tests/`, that holds for every generated sequence of commands. Only the core enforces invariants. The shell may validate shapes at the boundary, but it never decides whether a command is allowed.

---

## 6. The integration boundary

Loyalty has no outbound integrations. The core knows nothing about the callers. The earn rate enters the core as data in the command. It never comes from a lookup inside the core.

The order service and the rewards system call the API. Each request names the member ID. The handler resolves the member ID to the account stream and sends the command along the same path as every other write. A future integration, such as a second earn source, gets an adapter behind the adapter interface. The core does not change.

---

## 7. Contracts with the outside

- **API schemas.** Zod schemas in `packages/schema/` define each request and each response. They are the only contract and they produce the OpenAPI spec. The API offers four operations: open an account, earn points, spend points and read the balance.
- **Shared identifiers.** The member ID comes from the identity system. The order ID comes from the order service. The reward ID comes from the rewards system. The spend ID comes from the caller. Loyalty stores these IDs and never reads the state behind them.
- **Config.** The earn rate is a schema-validated value in an AppConfig profile in `packages/config/environments/`.
- **Published events.** None.

A contract changes only in ways that existing callers can absorb. You can add an optional field. To remove or rename a field, or to change its meaning, add a new version of the operation and retire the old one when no caller uses it.

---

## 8. Checklist for a new feature

- [ ] Does the feature use only the terms in the ubiquitous language?
- [ ] Is every new command, event, status and invariant in the tables above and in `core/src/vocabulary.ts`?
- [ ] Does every state change go through `decide` and `evolve`?
- [ ] Does every new invariant have a property test?
- [ ] Does the balance still change only through `points_earned` and `points_spent`?
- [ ] Does every new write carry an idempotency key, or is a repeat rejected?
- [ ] Does every value from config or from another system enter the core as data in a command?
- [ ] Does every change to an API schema keep existing callers working?

---

## 9. Open questions

- **Currency.** The model assumes one currency, pounds sterling. A second currency needs a currency on each earn and an earn rate for each currency.
- **Reversals.** A refunded order keeps the points it earned. Reversals are out of scope for now.
- **Account lifecycle.** Accounts cannot be suspended or closed. Both are out of scope for now.
- **Earn rate config.** The earn rate has no AppConfig profile yet. The first build adds one. A production profile needs your approval, because a merge to `main` makes it live.
