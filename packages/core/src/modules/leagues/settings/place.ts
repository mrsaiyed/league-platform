// Where a setting value is kept, as a command's input names it, and who may change
// it there: the place's program (P4 §4), or the whole league.
import { z } from 'zod';
import type { CommandContext } from '../../../command/index.ts';
import { leagueScope, type Scope } from '../../access/index.ts';
import { mayEditLeague, programScope } from '../policy.ts';
import type { LeaguesTx, SettingPlace } from '../ports.ts';
import type { SettingRegistry } from './define-setting.ts';

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

/**
 * May this account change the setting at this place? The permission is the one the
 * setting declares, checked at the place's program. A key or place that is not
 * there is checked league-wide, so only those who may change any setting learn it
 * is missing.
 */
export async function mayChangeSetting(
  context: CommandContext,
  tx: LeaguesTx,
  registry: SettingRegistry,
  input: { readonly key: string } & PlaceInput,
): Promise<boolean> {
  const setting = registry.get(input.key);
  const permission = setting?.permission ?? 'league.settings';
  let scope: Scope = leagueScope;
  if (input.level === 'program') scope = programScope(input.programId);
  if (input.level === 'season') {
    const programId = await tx.leagues.seasonProgramId(input.seasonId);
    if (programId !== undefined) scope = programScope(programId);
  }
  return mayEditLeague(context, tx, permission, scope);
}
