// Clears a setting's value at one place, so the lookup falls back to the next level
// (record 019: "not set" is no row). Written to the activity log like setting one.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import type { LeaguesTx } from '../ports.ts';
import { declaredSettings } from '../settings/declarations.ts';
import type { SettingRegistry } from '../settings/define-setting.ts';
import {
  findPlace,
  mayChangeSetting,
  placeFields,
  placeScopeDetails,
  settingKey,
} from '../settings/place.ts';
import { placeId } from './set-setting.ts';

export type ClearSettingError = {
  readonly code: 'unknown-setting' | 'place-not-found' | 'changed-since-read';
};

export function clearSettingFor(registry: SettingRegistry) {
  return defineCommand({
    name: 'leagues.clear_setting',
    permission: 'league.settings',
    input: z.intersection(
      placeFields,
      z.object({ key: settingKey, version: z.number().int().positive() }),
    ),
    allowed: (context, input, tx: LeaguesTx) => mayChangeSetting(context, tx, registry, input),
    run: async ({ context, input, tx }): Promise<Result<{ key: string }, ClearSettingError>> => {
      const setting = registry.get(input.key);
      if (setting === undefined) return fail({ code: 'unknown-setting' });
      const place = await findPlace(tx, input);
      if (place === undefined) return fail({ code: 'place-not-found' });
      if (!(await tx.leagues.clearSetting(place, setting.key, input.version))) {
        return fail({ code: 'changed-since-read' });
      }
      await recordActivity(tx, context, {
        action: 'leagues.clear_setting',
        target: { type: place.level, id: placeId(place, context.leagueId) },
        details: {
          key: setting.key,
          level: place.level,
          label: setting.label,
          ...(await placeScopeDetails(tx, place)),
        },
      });
      return ok({ key: setting.key });
    },
  });
}

export const clearSetting = clearSettingFor(declaredSettings);
