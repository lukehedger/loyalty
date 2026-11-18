// Every name DOMAIN.md defines. The domain drift fitness function fails when the two disagree.
export const vocabulary = {
  commands: ['open_account', 'earn_points', 'spend_points'],
  events: ['account_opened', 'points_earned', 'points_spent'],
  statuses: ['open'],
  invariants: [
    'balance_never_negative',
    'balance_matches_history',
    'earn_matches_rate',
    'points_move_in_positive_amounts',
    'account_opens_once',
    'points_need_an_account',
  ],
} as const;

export type CommandName = (typeof vocabulary.commands)[number];
export type EventName = (typeof vocabulary.events)[number];
export type StatusName = (typeof vocabulary.statuses)[number];
export type InvariantName = (typeof vocabulary.invariants)[number];
