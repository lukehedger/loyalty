import fc from 'fast-check';
import {
  type AccountState,
  type Command,
  type Decision,
  decide,
  evolve,
  initialState,
  parseEarnRate,
  parseMemberId,
  parseOrderId,
  parsePoints,
  parsePurchaseAmount,
  parseRewardId,
  parseSpendId,
  parseTimestamp,
} from '../index.ts';

export const defined = <Value>(value: Value | undefined): Value => {
  if (value === undefined) throw new Error('Test value failed to parse');
  return value;
};

const pad = (value: number, length: number): string =>
  String(value).padStart(length, '0');

const timestamp = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
    fc.integer({ min: 0, max: 86_399_999 }),
  )
  .map(([year, month, day, milliseconds]) =>
    defined(
      parseTimestamp(
        `${year}-${pad(month, 2)}-${pad(day, 2)}T${pad(Math.floor(milliseconds / 3_600_000), 2)}:${pad(Math.floor(milliseconds / 60_000) % 60, 2)}:${pad(Math.floor(milliseconds / 1000) % 60, 2)}.${pad(milliseconds % 1000, 3)}Z`,
      ),
    ),
  );

const openAccount = fc.record({
  type: fc.constant('open_account' as const),
  memberId: fc.uuid().map((value) => defined(parseMemberId(value))),
  openedAt: timestamp,
});

// Small purchase amounts and low rates make zero-point earns common enough to exercise.
const earnPoints = fc.record({
  type: fc.constant('earn_points' as const),
  orderId: fc.uuid().map((value) => defined(parseOrderId(value))),
  purchaseAmount: fc
    .integer({ min: 0, max: 200_000 })
    .map((value) => defined(parsePurchaseAmount(value))),
  earnRate: fc
    .integer({ min: 1, max: 5 })
    .map((value) => defined(parseEarnRate(value))),
});

// Spends reach past a typical balance so that overspends are common.
const spendPoints = fc.record({
  type: fc.constant('spend_points' as const),
  spendId: fc.uuid().map((value) => defined(parseSpendId(value))),
  rewardId: fc.uuid().map((value) => defined(parseRewardId(value))),
  points: fc
    .integer({ min: 0, max: 5_000 })
    .map((value) => defined(parsePoints(value))),
});

const command: fc.Arbitrary<Command> = fc.oneof(
  { arbitrary: openAccount, weight: 1 },
  { arbitrary: earnPoints, weight: 4 },
  { arbitrary: spendPoints, weight: 4 },
);

export const commandSequence: fc.Arbitrary<readonly Command[]> = fc.array(
  command,
  { maxLength: 40 },
);

export type Step = {
  readonly state: AccountState;
  readonly command: Command;
  readonly decision: Decision;
  readonly next: AccountState;
};

// Folds commands the way the gate does: an approved decision evolves the state and a rejection leaves it.
export const runCommands = (commands: readonly Command[]): readonly Step[] =>
  commands.reduce<readonly Step[]>((steps, command) => {
    const state = steps.length === 0 ? initialState : steps.at(-1)?.next;
    const decision = decide(state, command);
    const next =
      decision.outcome === 'approved'
        ? decision.events.reduce(evolve, state)
        : state;
    return [...steps, { state, command, decision, next }];
  }, []);
