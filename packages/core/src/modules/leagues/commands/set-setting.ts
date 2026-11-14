// Sets a declared setting's value at the league, a program or a season (T5 §6,
// T-98). The key must be declared, the level one the declaration allows and the
// value must pass its schema; the save names the version it started from (A-8). A value
// the declaration asks to confirm (R-14: full names) is saved only when the admin has
// confirmed it, and the activity entry says so.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import type { LeaguesTx, SettingPlace } from '../ports.ts';
import { declaredSettings } from '../settings/declarations.ts';
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
    | 'confirmation-needed';
};

export type SettingSaved = { readonly key: string; readonly version: number };

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
    allowed: (context, input, tx: LeaguesTx) => mayChangeSetting(context, tx, registry, input),
    run: async ({ context, input, tx }): Promise<Result<SettingSaved, SetSettingError>> => {
      const setting = registry.get(input.key);
      if (setting === undefined) return fail({ code: 'unknown-setting' });
      if (!setting.levels.includes(input.level)) return fail({ code: 'level-not-allowed' });
      const parsed = setting.type.safeParse(input.value);
      if (!parsed.success || parsed.data === undefined) return fail({ code: 'invalid-value' });
      const confirming = needsConfirming(setting, parsed.data);
      if (confirming && input.confirmed !== true) return fail({ code: 'confirmation-needed' });
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
          key: setting.key,
          level: place.level,
          label: setting.label,
          ...(confirming ? { confirmed: true } : {}),
          ...(await placeScopeDetails(tx, place)),
        },
      });
      return ok({ key: setting.key, version });
    },
  });
}

export const setSetting = setSettingFor(declaredSettings);
