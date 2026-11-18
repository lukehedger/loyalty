import { earnRateProfile } from '@loyalty/config';
import { NotFoundError } from '@loyalty/errors';
import type { AccountRecorded } from '@loyalty/gate';
import type { Adapter, ContextDeps, RecordedBalance } from './adapter.ts';

type DirectContext = ContextDeps;

const toRecordedBalance = ({
  outcome,
  account,
}: AccountRecorded): RecordedBalance => ({
  outcome,
  balance: { memberId: account.memberId, balance: account.balance },
});

// Loyalty's own API. The request already carries every value the command needs except the time and the earn rate.
export const direct: Adapter<DirectContext> = {
  buildContext: async (deps) => deps,
  capabilities: {
    openAccount: async (context, request) =>
      toRecordedBalance(
        await context.accountGate.apply({
          memberId: request.memberId,
          command: {
            type: 'open_account',
            memberId: request.memberId,
            openedAt: context.clock().toISOString(),
          },
        }),
      ),
    // Read per earn, so a spend or a balance read never waits on AppConfig.
    earnPoints: async (context, request) => {
      const { earnRate } = await context.config.read(earnRateProfile);

      return toRecordedBalance(
        await context.accountGate.apply({
          memberId: request.memberId,
          command: {
            type: 'earn_points',
            orderId: request.orderId,
            purchaseAmount: request.purchaseAmount,
            earnRate,
          },
        }),
      );
    },
    spendPoints: async (context, request) =>
      toRecordedBalance(
        await context.accountGate.apply({
          memberId: request.memberId,
          command: {
            type: 'spend_points',
            spendId: request.spendId,
            rewardId: request.rewardId,
            points: request.points,
          },
        }),
      ),
    readBalance: async (context, request) => {
      const account = await context.accountGate.load(request.memberId);
      if (account === undefined) throw new NotFoundError('Account not found');

      return { memberId: account.memberId, balance: account.balance };
    },
  },
};
