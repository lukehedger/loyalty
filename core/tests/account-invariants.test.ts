import { describe } from 'bun:test';
import type { Event, InvariantName } from '../index.ts';
import {
  commandSequence,
  runCommands,
  type Step,
} from './account-arbitraries.ts';
import { invariant } from './invariant.ts';

const approvedEvents = (steps: readonly Step[]): readonly Event[] =>
  steps.flatMap(({ decision }) =>
    decision.outcome === 'approved' ? decision.events : [],
  );

const isRejectedUnder = (step: Step, name: InvariantName): boolean =>
  step.decision.outcome === 'rejected' &&
  step.decision.rejection.invariant === name &&
  step.next === step.state;

const pointsFor = (purchaseAmount: number, earnRate: number): number =>
  Math.floor((purchaseAmount * earnRate) / 100);

describe('account invariants', () => {
  invariant('balance_never_negative', commandSequence, (commands) =>
    runCommands(commands).every(
      ({ next }) =>
        next === undefined ||
        (Number.isSafeInteger(next.balance) && next.balance >= 0),
    ),
  );

  invariant('balance_matches_history', commandSequence, (commands) =>
    runCommands(commands).every((step, index, steps) => {
      const history = approvedEvents(steps.slice(0, index + 1));
      const earned = history.reduce(
        (sum, event) =>
          event.type === 'points_earned' ? sum + event.points : sum,
        0,
      );
      const spent = history.reduce(
        (sum, event) =>
          event.type === 'points_spent' ? sum + event.points : sum,
        0,
      );
      return step.next === undefined
        ? history.length === 0
        : step.next.balance === earned - spent;
    }),
  );

  invariant('earn_matches_rate', commandSequence, (commands) =>
    runCommands(commands).every((step) => {
      const { state, command, decision } = step;
      if (state === undefined || command.type !== 'earn_points') return true;

      const expected = pointsFor(command.purchaseAmount, command.earnRate);
      if (expected === 0)
        return isRejectedUnder(step, 'points_move_in_positive_amounts');

      const [event] = decision.outcome === 'approved' ? decision.events : [];
      return (
        event?.type === 'points_earned' &&
        event.points === expected &&
        event.orderId === command.orderId &&
        event.purchaseAmount === command.purchaseAmount &&
        event.earnRate === command.earnRate
      );
    }),
  );

  invariant('points_move_in_positive_amounts', commandSequence, (commands) => {
    const steps = runCommands(commands);
    const movesPositive = approvedEvents(steps).every(
      (event) => event.type === 'account_opened' || event.points >= 1,
    );
    const rejectsZero = steps.every((step) => {
      const { state, command } = step;
      if (state === undefined) return true;
      if (command.type === 'earn_points')
        return (
          pointsFor(command.purchaseAmount, command.earnRate) > 0 ||
          isRejectedUnder(step, 'points_move_in_positive_amounts')
        );
      if (command.type === 'spend_points')
        return (
          command.points > 0 ||
          isRejectedUnder(step, 'points_move_in_positive_amounts')
        );
      return true;
    });
    return movesPositive && rejectsZero;
  });

  invariant('account_opens_once', commandSequence, (commands) => {
    const steps = runCommands(commands);
    const opened = approvedEvents(steps).filter(
      (event) => event.type === 'account_opened',
    );
    const rejectsReopen = steps.every(
      (step) =>
        step.command.type !== 'open_account' ||
        step.state === undefined ||
        isRejectedUnder(step, 'account_opens_once'),
    );
    return opened.length <= 1 && rejectsReopen;
  });

  invariant('points_need_an_account', commandSequence, (commands) =>
    runCommands(commands).every((step) =>
      step.state !== undefined || step.command.type === 'open_account'
        ? true
        : isRejectedUnder(step, 'points_need_an_account'),
    ),
  );
});
