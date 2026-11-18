import { describe, expect, test } from 'bun:test';
import {
  balanceResponseSchema,
  earnPointsRequestSchema,
  MAX_IDENTIFIER_LENGTH,
  MAX_PURCHASE_AMOUNT,
  MAX_SPEND_POINTS,
  openAccountRequestSchema,
  readBalanceRequestSchema,
  spendPointsRequestSchema,
} from '../src/index.ts';

const event = (body: unknown, memberId = 'member-1') => ({
  pathParameters: { memberId },
  body: JSON.stringify(body),
});

describe('openAccountRequestSchema', () => {
  test('reads the member ID from the body', () => {
    expect(
      openAccountRequestSchema.parse({
        body: JSON.stringify({ memberId: 'member-1' }),
      }),
    ).toEqual({ memberId: 'member-1' });
  });

  test.each([
    ['no body', { body: null }],
    ['an empty member ID', { body: JSON.stringify({ memberId: '' }) }],
    [
      'an overlong member ID',
      {
        body: JSON.stringify({
          memberId: 'm'.repeat(MAX_IDENTIFIER_LENGTH + 1),
        }),
      },
    ],
    ['an unknown field', { body: JSON.stringify({ memberId: 'm', x: 1 }) }],
  ])('rejects %s', (_name, value) => {
    expect(openAccountRequestSchema.safeParse(value).success).toBe(false);
  });
});

describe('earnPointsRequestSchema', () => {
  test('joins the member ID from the path to the body', () => {
    expect(
      earnPointsRequestSchema.parse(
        event({ orderId: 'order-1', purchaseAmount: 1250 }),
      ),
    ).toEqual({
      memberId: 'member-1',
      orderId: 'order-1',
      purchaseAmount: 1250,
    });
  });

  test.each([0, MAX_PURCHASE_AMOUNT])(
    'accepts a purchase amount of %p',
    (purchaseAmount) => {
      expect(
        earnPointsRequestSchema.safeParse(
          event({ orderId: 'o', purchaseAmount }),
        ).success,
      ).toBe(true);
    },
  );

  test.each([-1, 12.5, MAX_PURCHASE_AMOUNT + 1, Number.MAX_SAFE_INTEGER])(
    'rejects a purchase amount of %p',
    (purchaseAmount) => {
      expect(
        earnPointsRequestSchema.safeParse(
          event({ orderId: 'o', purchaseAmount }),
        ).success,
      ).toBe(false);
    },
  );

  test('rejects a request with no member ID in the path', () => {
    expect(
      earnPointsRequestSchema.safeParse({
        pathParameters: null,
        body: JSON.stringify({ orderId: 'o', purchaseAmount: 1 }),
      }).success,
    ).toBe(false);
  });
});

describe('spendPointsRequestSchema', () => {
  test('joins the member ID from the path to the body', () => {
    expect(
      spendPointsRequestSchema.parse(
        event({ spendId: 'spend-1', rewardId: 'reward-1', points: 40 }),
      ),
    ).toEqual({
      memberId: 'member-1',
      spendId: 'spend-1',
      rewardId: 'reward-1',
      points: 40,
    });
  });

  test.each([-1, 0.5, MAX_SPEND_POINTS + 1])('rejects %p points', (points) => {
    expect(
      spendPointsRequestSchema.safeParse(
        event({ spendId: 's', rewardId: 'r', points }),
      ).success,
    ).toBe(false);
  });
});

describe('readBalanceRequestSchema', () => {
  test('reads the member ID from the path', () => {
    expect(
      readBalanceRequestSchema.parse({
        pathParameters: { memberId: 'member-1' },
      }),
    ).toEqual({ memberId: 'member-1' });
  });
});

describe('balanceResponseSchema', () => {
  test('rejects a negative balance', () => {
    expect(
      balanceResponseSchema.safeParse({ memberId: 'member-1', balance: -1 })
        .success,
    ).toBe(false);
  });
});
