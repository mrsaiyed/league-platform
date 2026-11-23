// The answer to a public page's signed-in request for the numbers it leaves out (step
// 2.46), as the page's script reads it: nothing more, or which page it is for, the note to
// show above it, and the page's numbers as the server worded them for this person. One read,
// with the device's own sign-in, never kept by any cache (the answer says private, no-store
// too); a read that fails is "nothing more", so the page stays as everyone gets it.
import { z } from 'zod';

const notice = z.object({ title: z.string(), text: z.string() });

/**
 * The view is the server's own (stats-tables-view.ts, team-stats-view.ts,
 * game-numbers-view.ts), from this site only: it is checked here for its kind, and drawn by
 * the same pieces that draw the page.
 */
export const staffNumbersReply = z.object({
  more: z
    .discriminatedUnion('page', [
      z.object({
        page: z.literal('stats'),
        notice,
        view: z.object({ kind: z.literal('tables') }).loose(),
      }),
      z.object({
        page: z.literal('team'),
        notice,
        view: z.object({ kind: z.literal('numbers') }).loose(),
      }),
      z.object({ page: z.literal('game'), notice, view: z.object({}).loose() }),
    ])
    .nullable(),
});
export type StaffNumbersPage = 'stats' | 'team' | 'game';
export type StaffNotice = z.infer<typeof notice>;
export type ParsedMore = NonNullable<z.infer<typeof staffNumbersReply>['more']>;

/** One read from the page at `address`: what it says, or null for nothing more. */
export type ReadStaffNumbers = (address: string) => Promise<ParsedMore | null>;

export const browserReadStaffNumbers: ReadStaffNumbers = async (address) => {
  try {
    const response = await fetch(address, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const parsed = staffNumbersReply.safeParse(await response.json());
    return parsed.success ? parsed.data.more : null;
  } catch {
    return null;
  }
};
