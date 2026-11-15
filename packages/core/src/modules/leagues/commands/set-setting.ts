// Sets a declared setting's value at the league, a program or a season (T5 §6,
// T-98). The key must be declared, the level one the declaration allows and the
// value must pass its schema; the save names the version it started from (A-8). A value
// the declaration asks to confirm (R-14: full names) is saved only when the admin has
// confirmed it, and the activity entry says so; where it is the league's own starting
// value (an adult league's full names), saving it unconfirmed puts the league back on
// its start instead (record 065). In an archived or suspended league only
// a change that shows less of people works (R-26, `protectiveOrder`).
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import {
  defineCommand,
  fail,
  ok,
  type CommandContext,
  type Result,
} from '../../../command/index.ts';
import type { LeaguesTx, SettingPlace } from '../ports.ts';
import { declaredSettings } from '../settings/declarations.ts';
import {
  needsConfirming,
  sameSettingValue,
  startingValue,
  type Setting,
  type SettingRegistry,
} from '../settings/define-setting.ts';
import { settingDocument } from '../settings/lookup-setting.ts';
import {
  audienceFor,
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
    | 'confirmation-needed';
};

/**
 * The saved value's new version, or null when the save put the league back on its
 * starting value, which is kept as no stored value (record 065).
 */
export type SettingSaved = { readonly key: string; readonly version: number | null };

const activityDetails = async (tx: LeaguesTx, setting: Setting, place: SettingPlace) => ({
  key: setting.key,
  level: place.level,
  label: setting.label,
  ...(await placeScopeDetails(tx, place)),
});

/** Removes the league's own value, if it is still at `version`, and says so in the log. */
async function backToStart(
  context: CommandContext,
  tx: LeaguesTx,
  setting: Setting,
  version: number | null,
): Promise<Result<SettingSaved, SetSettingError>> {
  const place: SettingPlace = { level: 'league' };
  const rows = await tx.leagues.settingRows(setting.key, {});
  const own = rows.find((row) => row.level === 'league');
  if ((own?.version ?? null) !== version) return fail({ code: 'changed-since-read' });
  if (own !== undefined && !(await tx.leagues.clearSetting(place, setting.key, own.version))) {
    return fail({ code: 'changed-since-read' });
  }
  await recordActivity(tx, context, {
    action: 'leagues.set_setting',
    target: { type: place.level, id: placeId(place, context.leagueId) },
    details: await activityDetails(tx, setting, place),
  });
  return ok({ key: setting.key, version: null });
}

export const placeId = (place: SettingPlace, leagueId: string): string =>
  place.level === 'program'
    ? place.programId
    : place.level === 'season'
      ? place.seasonId
      : leagueId;

/** The command over a list of declarations (tests give their own; the product's is below). */
export function setSettingFor(registry: SettingRegistry) {
  return defineCommand({
    name: 'leagues.set_setting',
    permission: 'league.settings',
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
    run: async ({ context, input, tx }): Promise<Result<SettingSaved, SetSettingError>> => {
      const setting = registry.get(input.key);
      if (setting === undefined) return fail({ code: 'unknown-setting' });
      if (!setting.levels.includes(input.level)) return fail({ code: 'level-not-allowed' });
      const parsed = setting.type.safeParse(input.value);
      if (!parsed.success || parsed.data === undefined) return fail({ code: 'invalid-value' });
      const confirming = needsConfirming(setting, parsed.data) && input.confirmed === true;
      if (needsConfirming(setting, parsed.data) && !confirming) {
        // The league's own start never needed a confirmation (record 065): saved
        // unconfirmed, it puts the league back on its start, so a value of this kind is
        // only ever stored confirmed. Anywhere else it is refused.
        const start = startingValue(setting, await audienceFor(tx, setting));
        if (input.level !== 'league' || !sameSettingValue(parsed.data, start)) {
          return fail({ code: 'confirmation-needed' });
        }
        return backToStart(context, tx, setting, input.version);
      }
      const place = await findPlace(tx, input);
      if (place === undefined) return fail({ code: 'place-not-found' });
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
          ...(await activityDetails(tx, setting, place)),
          ...(confirming ? { confirmed: true } : {}),
        },
      });
      return ok({ key: setting.key, version });
    },
  });
}

export const setSetting = setSettingFor(declaredSettings);
