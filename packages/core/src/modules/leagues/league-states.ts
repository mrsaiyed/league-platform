// Which state changes a league may make (U-9), as a table. `by` says who: 'owner'
// is whoever runs the league's settings (`league.settings`: the owner and admins,
// O-7), publishing and archiving; 'platform' is our own staff (taking a league down for
// abuse or non-payment, with notice, and putting it back). Nothing here deletes a
// league's history.
//
// Lifting a suspension always puts the league back in draft, whatever it was before:
// only the league's own people publish (U-9), so a league the organizer never
// published can never go live because we lifted a suspension. A league that was live
// is published again by its owner or an admin.
import type { LeagueStatus } from './league-values.ts';

export type Transition = {
  readonly from: LeagueStatus;
  readonly to: LeagueStatus;
  readonly by: 'owner' | 'platform';
};

export const leagueTransitions: readonly Transition[] = [
  { from: 'draft', to: 'live', by: 'owner' },
  { from: 'live', to: 'archived', by: 'owner' },
  { from: 'archived', to: 'live', by: 'owner' },
  { from: 'draft', to: 'suspended', by: 'platform' },
  { from: 'live', to: 'suspended', by: 'platform' },
  { from: 'archived', to: 'suspended', by: 'platform' },
  { from: 'suspended', to: 'draft', by: 'platform' },
];

export function findTransition(from: LeagueStatus, to: LeagueStatus): Transition | undefined {
  return leagueTransitions.find((t) => t.from === from && t.to === to);
}

/**
 * U-9: an archived league is read-only, and a suspended one is too while it is down.
 * Its settings and seasons stay as they are; only its state changes, along the table.
 */
export const readOnlyStatuses: readonly LeagueStatus[] = ['archived', 'suspended'];

export function isReadOnlyStatus(status: LeagueStatus): boolean {
  return readOnlyStatuses.includes(status);
}
