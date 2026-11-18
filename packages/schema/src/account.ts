import { z } from 'zod';
import { jsonBody } from './json-body.ts';

// The caps keep every earn and every balance far inside Number.MAX_SAFE_INTEGER, so no request can fail a core assertion.
export const MAX_IDENTIFIER_LENGTH = 128;
export const MAX_PURCHASE_AMOUNT = 100_000_000;
export const MAX_SPEND_POINTS = 100_000_000;

const identifierSchema = z.string().min(1).max(MAX_IDENTIFIER_LENGTH);

// Zero is a valid shape. The core rejects a zero earn or spend under points_move_in_positive_amounts.
const purchaseAmountSchema = z.int().min(0).max(MAX_PURCHASE_AMOUNT);
const spendPointsSchema = z.int().min(0).max(MAX_SPEND_POINTS);

const memberPathSchema = z.object({ memberId: identifierSchema });

export const openAccountBodySchema = z.strictObject({
  memberId: identifierSchema,
});

export const earnPointsBodySchema = z.strictObject({
  orderId: identifierSchema,
  purchaseAmount: purchaseAmountSchema,
});

export const spendPointsBodySchema = z.strictObject({
  spendId: identifierSchema,
  rewardId: identifierSchema,
  points: spendPointsSchema,
});

// The request schemas parse the API Gateway event, so a handler parses the event before anything else.
export const openAccountRequestSchema = z
  .object({ body: jsonBody(openAccountBodySchema) })
  .transform(({ body }) => body);

export const earnPointsRequestSchema = z
  .object({
    pathParameters: memberPathSchema,
    body: jsonBody(earnPointsBodySchema),
  })
  .transform(({ pathParameters, body }) => ({ ...pathParameters, ...body }));

export const spendPointsRequestSchema = z
  .object({
    pathParameters: memberPathSchema,
    body: jsonBody(spendPointsBodySchema),
  })
  .transform(({ pathParameters, body }) => ({ ...pathParameters, ...body }));

export const readBalanceRequestSchema = z
  .object({ pathParameters: memberPathSchema })
  .transform(({ pathParameters }) => pathParameters);

export const balanceResponseSchema = z.strictObject({
  memberId: z.string(),
  balance: z.int().min(0),
});

export type OpenAccountRequest = z.output<typeof openAccountRequestSchema>;
export type EarnPointsRequest = z.output<typeof earnPointsRequestSchema>;
export type SpendPointsRequest = z.output<typeof spendPointsRequestSchema>;
export type ReadBalanceRequest = z.output<typeof readBalanceRequestSchema>;
export type BalanceResponse = z.infer<typeof balanceResponseSchema>;
