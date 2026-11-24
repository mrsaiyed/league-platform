// League settings → Profile (step 2.125 part 2): how people reach the league, where it
// plays, its clock and whether it is listed in `/find` (U-10). The owner and admins
// change it (U-14); not in an archived or suspended league (U-9: read-only). The name
// and the short name have their own commands (setLeagueName, renameShortName), and who
// plays has setLeagueAudience. The save names the version it started from (T-46).
// S-109 (step 2.243): an age is measured on the league's own today, so a new time zone
// can make someone a day short of 18 a child again; if that is the adult league's first
// child, a confirmed "children in full" goes back to no in the same save.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { leagueProfileChanged } from '../events.ts';
import { mayEditLeague } from '../policy.ts';
import type { LeagueProfileChange, LeaguesTx } from '../ports.ts';
import { namedTimeZone } from '../time-zone.ts';
import { leaguesFirstChildGuard } from './clear-setting.ts';
import { putBackOnFirstChild, watchForFirstChild } from './put-back-on-first-child.ts';

export type SetLeagueProfileError = { readonly code: 'changed-since-read' };

/** A named zone only, kept by its canonical name (time-zone.ts), as createLeague. */
const timeZone = z
  .string()
  .max(64)
  .transform((value, context) => {
    const name = namedTimeZone(value);
    if (name === undefined) {
      context.addIssue({ code: 'custom', message: 'not a named time zone' });
      return z.NEVER;
    }
    return name;
  });

const profileKeys = ['contactEmail', 'city', 'timeZone', 'listed'] as const;

export const setLeagueProfile = defineCommand({
  name: 'leagues.set_profile',
  permission: 'league.settings',
  // The same limits as the leagues table (0003, 0014). Publishing waits for a contact
  // email (P3 §3), so once given it is changed, never emptied; a city left blank is none.
  input: z.object({
    contactEmail: z.email().max(320),
    city: z
      .string()
      .trim()
      .max(100)
      .transform((value) => (value.length === 0 ? null : value)),
    timeZone,
    listed: z.boolean(),
    version: z.number().int().positive(),
  }),
  allowed: (context, _input, tx: LeaguesTx) => mayEditLeague(context, tx),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<{ version: number; clearedChildrenInFull?: true }, SetLeagueProfileError>> => {
    // T-403: the league's row first, before anything is read, so guarded saves take turns.
    await tx.leagues.lockLeague();
    const league = await tx.leagues.currentLeague();
    const before = await tx.leagues.leagueProfile();
    // The policy just read the league in this same transaction.
    if (league === undefined || before === undefined) {
      throw new Error('leagues.set_profile: the league is gone.');
    }
    if (league.version !== input.version) return fail({ code: 'changed-since-read' });
    const next: LeagueProfileChange = {
      contactEmail: input.contactEmail,
      city: input.city,
      timeZone: input.timeZone,
      listed: input.listed,
    };
    const changed = profileKeys.filter((key) => before[key] !== next[key]);
    if (changed.length === 0) return ok({ version: league.version });
    const guard = leaguesFirstChildGuard(tx.leagues);
    const watching = await watchForFirstChild(guard);
    const version = await tx.leagues.setProfile(next, input.version);
    if (version === undefined) return fail({ code: 'changed-since-read' });
    // Which parts changed, not their values (A-6).
    await recordActivity(tx, context, {
      action: 'leagues.set_profile',
      target: { type: 'league', id: context.leagueId },
      details: { changed: changed.join(',') },
    });
    emit({ type: leagueProfileChanged, leagueId: context.leagueId });
    const putBack = await putBackOnFirstChild(guard, tx, context, emit, watching);
    return ok({ version, ...(putBack ? { clearedChildrenInFull: true as const } : {}) });
  },
});
