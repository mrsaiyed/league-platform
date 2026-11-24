// "Who plays" in League settings → Profile (step 2.125 part 2): adults, under-18s or
// both, which no screen could change once the league was made. Moving toward adults
// asks for the confirmation (R-14); a change that brings children into an adult league
// clears a saved, confirmed "children in full" back to no in the same step, and the
// result says so (R-14, R-29). What the change does is worked out by audienceChange,
// which the screen reads first so it can say it before the save. The owner and admins
// change it (U-14); not in an archived or suspended league (U-9).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { leagueAudienceChanged, leagueSettingChanged } from '../events.ts';
import { audiences, type Audience } from '../league-values.ts';
import { mayEditLeague } from '../policy.ts';
import type { LeaguesTx, StoredSettingRow } from '../ports.ts';
import { audienceChange } from '../rules/audience-change.ts';
import { clearLeagueValueInside } from './clear-setting.ts';
import { childrenInFullConfirmed } from '../settings/declarations.ts';

export type SetLeagueAudienceError = {
  readonly code: 'changed-since-read' | 'confirmation-needed';
};

export type LeagueAudienceSaved = {
  readonly audience: Audience;
  readonly version: number;
  /** The confirmed "children in full" was cleared back to no by this change. */
  readonly clearedChildrenInFull: boolean;
};

/** The league's own saved "children in full" row when it says yes, else undefined. */
async function confirmedChildrenInFull(tx: LeaguesTx): Promise<StoredSettingRow | undefined> {
  const rows = await tx.leagues.settingRows(childrenInFullConfirmed.key, {});
  return rows.find((row) => {
    if (row.level !== 'league') return false;
    const document = row.document;
    return typeof document === 'object' && document !== null && 'value' in document
      ? document.value === true
      : false;
  });
}

/** Whether the league holds a saved, confirmed "children in full" (for the screen). */
export async function holdsChildrenInFull(tx: LeaguesTx): Promise<boolean> {
  return (await confirmedChildrenInFull(tx)) !== undefined;
}

export const setLeagueAudience = defineCommand({
  name: 'leagues.set_audience',
  permission: 'league.settings',
  input: z.object({
    audience: z.enum(audiences),
    /** The admin ticked the confirmation a move toward adults asks for (R-14). */
    confirmed: z.boolean().optional(),
    version: z.number().int().positive(),
  }),
  allowed: (context, _input, tx: LeaguesTx) => mayEditLeague(context, tx),
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<LeagueAudienceSaved, SetLeagueAudienceError>> => {
    const league = await tx.leagues.currentLeague();
    const profile = await tx.leagues.leagueProfile();
    if (league === undefined || profile === undefined) {
      throw new Error('leagues.set_audience: the league is gone.');
    }
    if (league.version !== input.version) return fail({ code: 'changed-since-read' });
    if (profile.audience === input.audience) {
      return ok({
        audience: input.audience,
        version: league.version,
        clearedChildrenInFull: false,
      });
    }
    const saved = await confirmedChildrenInFull(tx);
    const change = audienceChange(profile.audience, input.audience, saved !== undefined);
    if (change.needsConfirming && input.confirmed !== true) {
      return fail({ code: 'confirmation-needed' });
    }
    // The clearing first, logged as a clearing of its own (one writer, record 065): if
    // the value moved since it was read, nothing has changed yet.
    if (change.clearsChildrenInFull && saved !== undefined) {
      const cleared = await clearLeagueValueInside(
        tx,
        context,
        childrenInFullConfirmed.key,
        saved.version,
      );
      if (!cleared) return fail({ code: 'changed-since-read' });
    }
    const version = await tx.leagues.setAudience(input.audience, input.version);
    if (version === undefined) {
      // Moved after the clearing: undo the whole step (a thrown error rolls it back).
      if (change.clearsChildrenInFull) throw new Error('leagues.set_audience: the league moved.');
      return fail({ code: 'changed-since-read' });
    }
    await recordActivity(tx, context, {
      action: 'leagues.set_audience',
      target: { type: 'league', id: context.leagueId },
      details: {
        audience: input.audience,
        ...(change.needsConfirming ? { confirmed: true } : {}),
        ...(change.clearsChildrenInFull ? { clearedChildrenInFull: true } : {}),
      },
    });
    emit({ type: leagueAudienceChanged, leagueId: context.leagueId });
    if (change.clearsChildrenInFull) {
      emit({
        type: leagueSettingChanged,
        leagueId: context.leagueId,
        key: childrenInFullConfirmed.key,
      });
    }
    return ok({
      audience: input.audience,
      version,
      clearedChildrenInFull: change.clearsChildrenInFull,
    });
  },
});
