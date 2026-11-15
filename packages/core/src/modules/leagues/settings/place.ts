// Where a setting value is kept, as a command's input names it, and who may change
// it there: the place's program (P4 §4), or the whole league.
import { z } from 'zod';
import type { CommandContext } from '../../../command/index.ts';
import { leagueScope, scopeDetails, type Scope } from '../../access/index.ts';
import { mayChangeLeagueSettings, mayEditLeague, programScope } from '../policy.ts';
import type { LeaguesTx, SettingPlace } from '../ports.ts';
import { showsLess, type Setting, type SettingRegistry } from './define-setting.ts';
import { lookupSetting } from './lookup-setting.ts';

/** The fields that name a place: the level, and its program or season. */
export const placeFields = z.discriminatedUnion('level', [
  z.object({ level: z.literal('league') }),
  z.object({ level: z.literal('program'), programId: z.uuid() }),
  z.object({ level: z.literal('season'), seasonId: z.uuid() }),
]);

export type PlaceInput = z.output<typeof placeFields>;

export const settingKey = z.string().min(1).max(100);

/** The place, or undefined if its program or season is not in this league. */
export async function findPlace(
  tx: LeaguesTx,
  input: PlaceInput,
): Promise<SettingPlace | undefined> {
  if (input.level === 'league') return { level: 'league' };
  if (input.level === 'program') {
    const program = await tx.leagues.findProgram(input.programId);
    return program === undefined ? undefined : { level: 'program', programId: program.id };
  }
  const programId = await tx.leagues.seasonProgramId(input.seasonId);
  return programId === undefined ? undefined : { level: 'season', seasonId: input.seasonId };
}

/** The value a change leaves at the place: one given, or the setting's default (cleared). */
export type SettingTarget = { readonly value: unknown } | 'default';

/**
 * May this account change the setting at this place? The permission is the one the
 * setting declares, checked at the program found for the place (a season's own
 * program, or the program named). A key or place that is not found is checked
 * league-wide, with `league.settings`, so only those who may change any setting
 * learn it is missing. In an archived or suspended league (read-only, U-9) only a
 * change of the league's own value that shows less of people works (R-26).
 */
export async function mayChangeSetting(
  context: CommandContext,
  tx: LeaguesTx,
  registry: SettingRegistry,
  input: { readonly key: string } & PlaceInput,
  target: SettingTarget,
): Promise<boolean> {
  const setting = registry.get(input.key);
  const permission = setting?.permission ?? 'league.settings';
  let scope: Scope = leagueScope;
  if (input.level === 'program') {
    const program = await tx.leagues.findProgram(input.programId);
    if (program !== undefined) scope = programScope(program.id);
  }
  if (input.level === 'season') {
    const programId = await tx.leagues.seasonProgramId(input.seasonId);
    if (programId !== undefined) scope = programScope(programId);
  }
  if (await mayEditLeague(context, tx, permission, scope)) return true;
  if (setting === undefined || input.level !== 'league') return false;
  if (!(await protectsPeople(tx, setting, target))) return false;
  return mayChangeLeagueSettings(context, tx, permission, scope);
}

/** Whether the change moves the league's value of the setting toward less shown (R-26). */
async function protectsPeople(
  tx: LeaguesTx,
  setting: Setting,
  target: SettingTarget,
): Promise<boolean> {
  if (setting.protectiveOrder.length === 0) return false;
  const parsed = target === 'default' ? undefined : setting.type.safeParse(target.value);
  if (parsed !== undefined && !parsed.success) return false;
  const to = parsed === undefined ? setting.default : parsed.data;
  const rows = await tx.leagues.settingRows(setting.key, {});
  const from = lookupSetting(
    setting,
    rows.filter((row) => row.level === 'league'),
  ).value;
  return showsLess(setting, from, to);
}

/**
 * The scope fields an activity entry carries for a place, so a program's admin sees
 * changes made in their program: the program's own, or a season's program.
 */
export async function placeScopeDetails(tx: LeaguesTx, place: SettingPlace) {
  if (place.level === 'program') return scopeDetails(programScope(place.programId));
  if (place.level === 'season') {
    const programId = await tx.leagues.seasonProgramId(place.seasonId);
    if (programId !== undefined) return scopeDetails(programScope(programId));
  }
  return scopeDetails(leagueScope);
}
