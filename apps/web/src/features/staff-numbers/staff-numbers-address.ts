// Where a public page asks for the numbers it leaves out (step 2.46): the league's own
// endpoint address, built by the one helper (leagueApiUrl, T-34), and the page's question.
// The question names only what the page already shows (its season, team or game): never a
// person, never a number.
import { leagueApiUrl } from '@srleagues/core';

/** The address parts of the endpoint, under the league's (server/staff-numbers-endpoint.ts). */
export const staffNumbersParts = ['staff-numbers'] as const;

export type StaffNumbersAsk =
  | { readonly page: 'stats'; readonly season: string; readonly by: 'average' | 'total' }
  | { readonly page: 'team'; readonly season: string; readonly team: string }
  | { readonly page: 'game'; readonly game: string };

export function staffNumbersAddress(league: { readonly id: string }, ask: StaffNumbersAsk): string {
  const query = new URLSearchParams(Object.entries(ask));
  return `${leagueApiUrl(league, staffNumbersParts)}?${query.toString()}`;
}
