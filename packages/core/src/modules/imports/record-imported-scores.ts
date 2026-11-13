// Records the final scores an applied fixtures import carried, for the games that have been
// published since (O-4). Games not yet published stay waiting; a game already decided or
// cancelled is left as it is; a tie the rules of the game refuse is left waiting and counted.
// Running it again records nothing twice: a score is marked once it is done.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../command/index.ts';
import { recordFinalScoreWithin } from '../games/index.ts';
import { parseCreatedFixtures, type CreatedFixtures } from './import-documents.ts';
import { mayImportInto } from './policy.ts';
import type { ImportScoresTx } from './ports.ts';

export type RecordImportedScoresError = {
  readonly code: 'import-not-found' | 'not-applied' | 'record-unreadable' | 'changed-since-read';
};

export type ImportedScoresRecorded = {
  readonly recorded: number;
  /** Scores whose games are not published yet. */
  readonly waiting: number;
  /** Scores the rules of the game refuse (a tie in a season without ties). */
  readonly refused: number;
  /** Games already decided or cancelled by other means, left as they are. */
  readonly leftAlone: number;
};

export const recordImportedScores = defineCommand({
  name: 'imports.record_imported_scores',
  permission: 'games.score',
  input: z.object({ importId: z.uuid() }),
  allowed: async (context, input, tx: ImportScoresTx) => {
    const found = await tx.imports.find(input.importId);
    return mayImportInto(context, tx, 'games.score', found?.seasonId ?? null);
  },
  run: async ({
    context,
    input,
    tx,
    emit,
  }): Promise<Result<ImportedScoresRecorded, RecordImportedScoresError>> => {
    const found = await tx.imports.find(input.importId);
    if (found === undefined || found.kind !== 'fixtures' || found.seasonId === null) {
      return fail({ code: 'import-not-found' });
    }
    if (found.status !== 'applied') return fail({ code: 'not-applied' });
    const created = parseCreatedFixtures(found.created);
    if (created === undefined) return fail({ code: 'record-unreadable' });

    let recorded = 0;
    let waiting = 0;
    let refused = 0;
    let leftAlone = 0;
    const scores: CreatedFixtures['scores'] = [];
    for (const score of created.scores) {
      if (score.recorded) {
        scores.push(score);
        continue;
      }
      const game = await tx.games.find(score.gameId);
      if (game === undefined || game.binned) {
        waiting += 1;
        scores.push(score);
        continue;
      }
      const result = await recordFinalScoreWithin({
        context,
        tx,
        emit,
        gameId: score.gameId,
        homeScore: score.home,
        awayScore: score.away,
        action: 'imports.record_imported_scores',
      });
      if (result.ok) {
        recorded += 1;
        scores.push({ ...score, recorded: true });
      } else if (result.error.code === 'tie-not-allowed') {
        refused += 1;
        scores.push(score);
      } else {
        // Decided by hand or cancelled since: nothing more for this import to do.
        leftAlone += 1;
        scores.push({ ...score, recorded: true });
      }
    }
    if (recorded + leftAlone > 0) {
      const saved = await tx.imports.save(
        found.id,
        { status: 'applied', created: { ...created, scores } },
        found.version,
      );
      if (saved === undefined) return fail({ code: 'changed-since-read' });
    }
    return ok({ recorded, waiting, refused, leftAlone });
  },
});
