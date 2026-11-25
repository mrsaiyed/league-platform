// Sets a declared setting's value at the league, a program or a season (T5 §6,
// T-98). The key must be declared, the level one the declaration allows and the
// value must pass its schema; the save names the version it started from (A-8). A value
// the declaration asks to confirm (R-14: full names) is saved only when the admin has
// confirmed it, and the activity entry says so. In an archived or suspended league only
// a change that shows less of people works (R-26, `protectiveOrder`). A yes to "children
// in full" is refused in an adult league that has no recorded child (S-109, T-402): it
// counts only if given while the league had children or a recorded child, so there is
// nothing to confirm yet. Read in the transaction that writes it (see T-402 on the race).
import { z } from 'zod';
import { settingAtArchivedSeason } from '../archived-season.ts';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { leagueSettingChanged } from '../events.ts';
import type { LeaguesTx, SettingPlace } from '../ports.ts';
import { childrenInFullConfirmed, declaredSettings } from '../settings/declarations.ts';
import { needsConfirming, type SettingRegistry } from '../settings/define-setting.ts';
import { settingDocument } from '../settings/lookup-setting.ts';
import {
  findPlace,
  mayChangeSetting,
  placeFields,
  placeScopeDetails,
  settingKey,
} from '../settings/place.ts';

export type SetSettingError = {
  readonly code:
    | 'unknown-setting'
    | 'level-not-allowed'
    | 'invalid-value'
    | 'place-not-found'
    | 'changed-since-read'
    | 'confirmation-needed'
    | 'no-child-recorded';
};

export type SettingSaved = { readonly key: string; readonly version: number };

export const placeId = (place: SettingPlace, leagueId: string): string =>
  place.level === 'program'
    ? place.programId
    : place.level === 'season'
      ? place.seasonId
      : leagueId;

/** The row stored at exactly this place, if there is one. */
async function storedAt(tx: LeaguesTx, key: string, place: SettingPlace) {
  const rows = await tx.leagues.settingRows(
    key,
    place.level === 'program'
      ? { programId: place.programId }
      : place.level === 'season'
        ? { seasonId: place.seasonId }
        : {},
  );
  return rows.find((row) => row.level === place.level);
}

/**
 * Whether a stored document holds this document's value at its version. Compared part by
 * part: the database may keep a document's keys in another order. A value that cannot be
 * told the same simply counts as a change, and is written.
 */
function sameDocument(stored: unknown, wanted: { version: number; value: unknown }): boolean {
  if (typeof stored !== 'object' || stored === null) return false;
  const { version, value } = stored as { version?: unknown; value?: unknown };
  return version === wanted.version && JSON.stringify(value) === JSON.stringify(wanted.value);
}

/** The command over a list of declarations (tests give their own; the product's is below). */
export function setSettingFor(registry: SettingRegistry) {
  return defineCommand({
    name: 'leagues.set_setting',
    permission: 'league.settings',
    refusedInArchivedSeason: settingAtArchivedSeason,
    input: z.intersection(
      placeFields,
      z.object({
        key: settingKey,
        value: z.unknown(),
        /** The version of the stored value when it was read, or null if there was none. */
        version: z.number().int().positive().nullable(),
        /** The admin confirmed what the setting asks for this value (R-14). */
        confirmed: z.boolean().optional(),
      }),
    ),
    allowed: (context, input, tx: LeaguesTx) =>
      mayChangeSetting(context, tx, registry, input, { value: input.value }),
    run: async ({ context, input, tx, emit }): Promise<Result<SettingSaved, SetSettingError>> => {
      const setting = registry.get(input.key);
      if (setting === undefined) return fail({ code: 'unknown-setting' });
      if (!setting.levels.includes(input.level)) return fail({ code: 'level-not-allowed' });
      const parsed = setting.type.safeParse(input.value);
      if (!parsed.success || parsed.data === undefined) return fail({ code: 'invalid-value' });
      const confirming = needsConfirming(setting, parsed.data);
      if (confirming && input.confirmed !== true) return fail({ code: 'confirmation-needed' });
      const givingYes = setting.key === childrenInFullConfirmed.key && parsed.data === true;
      // T-403: a yes takes the league's row before it reads who is recorded, so it and a
      // save that records a first child or puts one in the bin take turns.
      if (givingYes) await tx.leagues.lockLeague();
      if (
        givingYes &&
        (await tx.leagues.leagueAudience()) === 'adult' &&
        !(await tx.leagues.hasRecordedChild())
      ) {
        return fail({ code: 'no-child-recorded' });
      }
      const place = await findPlace(tx, input);
      if (place === undefined) return fail({ code: 'place-not-found' });
      // The same value saved again, from the version read, changes nothing: nothing is
      // written and nothing goes into the activity log (record 065).
      const kept = await storedAt(tx, setting.key, place);
      if (
        kept !== undefined &&
        kept.version === input.version &&
        sameDocument(kept.document, settingDocument(setting, parsed.data))
      ) {
        return ok({ key: setting.key, version: kept.version });
      }
      const version = await tx.leagues.writeSetting(
        place,
        setting.key,
        settingDocument(setting, parsed.data),
        input.version,
      );
      if (version === undefined) return fail({ code: 'changed-since-read' });
      await recordActivity(tx, context, {
        action: 'leagues.set_setting',
        target: { type: place.level, id: placeId(place, context.leagueId) },
        details: {
          key: setting.key,
          level: place.level,
          label: setting.label,
          ...(confirming ? { confirmed: true } : {}),
          ...(await placeScopeDetails(tx, place)),
        },
      });
      // Other modules react to some settings (the public pages' cache, step 2.26).
      emit({ type: leagueSettingChanged, leagueId: context.leagueId, key: setting.key });
      return ok({ key: setting.key, version });
    },
  });
}

export const setSetting = setSettingFor(declaredSettings);
