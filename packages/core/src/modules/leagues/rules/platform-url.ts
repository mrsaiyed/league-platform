// T-34 for our own pages: the platform's addresses (`/signin`, `/account`...) are
// built here, not written by hand, beside leagueUrl. Moving leagues to their own
// hosts (U-13, U-2) makes these absolute to the platform's host; callers stay.
// Every first word here is one of our own words (blocked-short-names.ts), so no
// league can ever take it.

/** Every page of the platform itself, by name: its path. */
export const platformPages = {
  home: [],
  find: ['find'],
  start: ['start'],
  signin: ['signin'],
  account: ['account'],
  inbox: ['account', 'inbox'],
  help: ['help'],
  contact: ['contact'],
  status: ['status'],
  privacy: ['privacy'],
  terms: ['terms'],
} as const satisfies Record<string, readonly string[]>;

export type PlatformPage = keyof typeof platformPages;

/** The address of one of our own pages: `platformUrl('signin')` is `/signin`. */
export function platformUrl(page: PlatformPage): string {
  return `/${platformPages[page].join('/')}`;
}
