// What a correction keeps of a box score (step 2.229, T-365). A reopen of a game entered
// by hand writes its correction before the save that follows, and a correction is never
// changed once written (T-45), so the reopen keeps the game's lines in its "before"
// whenever the game has any: the save after it may then remove them (a final score only,
// a score within, a forfeit: S-27) or replace them (a new sheet), and "put the sheet back
// as it was" (put-sheet-back.ts) restores them (A-5). Ids and numbers only (T-220): team
// and person ids, the jersey number worn, played, seconds and the stat counts. Kept lines
// are a document in the correction, never `player_game_stats` rows, so they count nowhere.
import { z } from 'zod';
import type { GameRecord, GameResultDocument, KeptSheet, TrackerTx } from './ports.ts';
import { scoringNameSettingsOf } from './queries/read-scoring-name-view.ts';

/** The sheet to keep in a reopen's "before": the game's lines, or undefined when it has none. */
export async function sheetToKeep(tx: TrackerTx, game: GameRecord): Promise<KeptSheet | undefined> {
  const lines = await tx.liveGames.lines(game.id);
  if (lines.length === 0) return undefined;
  return {
    // How it was recorded: a sheet typed in unless the game says otherwise.
    captureMode:
      game.captureMode === 'final' || game.captureMode === 'live' ? game.captureMode : 'box',
    overtimePeriods: game.overtimePeriods,
    lines: lines.map((line) => ({
      teamId: line.teamId,
      personId: line.personId,
      jerseyNumber: line.jerseyNumber,
      played: line.played,
      secondsPlayed: line.secondsPlayed,
      stats: { ...line.stats },
    })),
  };
}

const keptLine = z.strictObject({
  teamId: z.string(),
  personId: z.string(),
  jerseyNumber: z.string().nullable(),
  played: z.boolean(),
  secondsPlayed: z.number().int().nullable(),
  stats: z.record(z.string(), z.number().int()),
});

const resultDocument = z.object({
  version: z.literal(1),
  status: z.string(),
  homeScore: z.number().int().nullable(),
  awayScore: z.number().int().nullable(),
  sheet: z
    .strictObject({
      captureMode: z.enum(['box', 'final', 'live']),
      overtimePeriods: z.number().int().nullable(),
      lines: z.array(keptLine),
    })
    .optional(),
});

/**
 * A stored correction document read back. One that does not read as a result (none should:
 * the database holds what addCorrection wrote) is undefined, and the caller treats the
 * correction as keeping nothing.
 */
export function resultDocumentOf(stored: unknown): GameResultDocument | undefined {
  const parsed = resultDocument.safeParse(stored);
  if (!parsed.success) return undefined;
  const { sheet, ...result } = parsed.data;
  return sheet === undefined ? result : { ...result, sheet };
}

/** Why a kept sheet's players cannot come back now: in the bin, or purged from it for good. */
export type KeptSheetPlayersRefusal = 'player-in-bin' | 'player-gone';

/**
 * Whether every player the kept sheet names is on one of the game's two teams' rosters
 * now (those who left included, R-17). One in the bin, or on a team in the bin, can come
 * back once restored (`player-in-bin`); one purged from the bin since cannot (T-220 keeps
 * only the id: `player-gone`). The put back and the read that offers it both ask.
 */
export async function keptSheetPlayersRefusal(
  tx: TrackerTx,
  gameId: string,
  sheet: KeptSheet,
): Promise<KeptSheetPlayersRefusal | undefined> {
  const key = (entry: { teamId: string; personId: string }) => `${entry.teamId} ${entry.personId}`;
  const roster = new Set(
    (await tx.games.listRoster(gameId, await scoringNameSettingsOf(tx))).map(key),
  );
  const missing = sheet.lines.filter((line) => !roster.has(key(line)));
  if (missing.length === 0) return undefined;
  for (const line of missing) if (!(await tx.games.inBin(line))) return 'player-gone';
  return 'player-in-bin';
}
