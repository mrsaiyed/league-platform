// Migration 0026 (step 2.119): the format a game is given is a column of its own, kept
// apart from the rules fixed at its start. It changes freely before the game starts,
// stays as it was when the game starts, and is refused once the game is under way.
import type { PGlite } from '@electric-sql/pglite';
import { formatOfRules, seasonRulesPreset } from '@srleagues/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  freshSchema,
  newGame,
  newLeague,
  newSeason,
  newStage,
  newTeam,
  one,
} from './schema.test-helper.ts';

const quarters = formatOfRules(seasonRulesPreset('high-school'));
const halves = formatOfRules(seasonRulesPreset('rec-league'));

let db: PGlite;
beforeAll(async () => {
  db = await freshSchema();
});
afterAll(async () => {
  await db.close();
});

async function scheduledGame() {
  const { leagueId, defaultProgramId } = await newLeague(db);
  const seasonId = await newSeason(db, leagueId, defaultProgramId);
  const stageId = await newStage(db, leagueId, seasonId);
  const homeTeamId = await newTeam(db, leagueId, seasonId);
  const awayTeamId = await newTeam(db, leagueId, seasonId);
  const columns = { capture_mode: 'live' };
  return newGame(db, { leagueId, seasonId, stageId, homeTeamId, awayTeamId, columns });
}
const given = async (id: string) =>
  (await one<{ given_format: unknown }>(db, 'select given_format from games where id = $1', [id]))
    .given_format;
const give = (id: string, format: unknown) =>
  db.query('update games set given_format = $2 where id = $1', [id, JSON.stringify(format)]);

describe('a game given its own format (0026)', () => {
  it('changes before the start, is kept when the game starts, and is fixed from then on', async () => {
    const id = await scheduledGame();
    expect(await given(id)).toBeNull();
    await give(id, halves);
    await give(id, quarters);
    expect(await given(id)).toEqual(quarters);
    // The game starts: the rules fixed are its own column; the given format stays.
    await db.query(`update games set status = 'live', format = $2 where id = $1`, [
      id,
      JSON.stringify({ ...seasonRulesPreset('high-school') }),
    ]);
    expect(await given(id)).toEqual(quarters);
    await expect(give(id, halves)).rejects.toThrow(/format it was given cannot change/);
    await expect(
      db.query('update games set given_format = null where id = $1', [id]),
    ).rejects.toThrow(/format it was given cannot change/);
    expect(await given(id)).toEqual(quarters);
  });

  it('refuses a document with no version', async () => {
    const id = await scheduledGame();
    await expect(give(id, { periods: 4 })).rejects.toThrow(/games_given_format_document/);
  });
});
