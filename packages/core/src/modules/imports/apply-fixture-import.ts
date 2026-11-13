// Applies a previewed fixtures import (P7 §4 "Also", O-4): its games are added to the
// season's schedule draft as one set of changes, flagged for clashes but not refused for
// them, and the import remembers exactly what it added so undo can take it out again. Final
// scores the file carries wait in the import until their games are published
// (record_imported_scores). A round, game number or outside reference the file gave stays
// in the report only: a draft game has no place for them yet.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../command/index.ts';
import { recordActivity } from '../access/index.ts';
import {
  applyDraft,
  applyDraftChange,
  emptyDraft,
  maxDraftBytes,
  parseDraftDocument,
  type ChangeError,
  type DraftChange,
  type DraftDocument,
  type ScheduleGame,
} from '../scheduling/index.ts';
import { gameIdFor, parseFixtureReport, type CreatedFixtures } from './import-documents.ts';
import { mayImportInto } from './policy.ts';
import type { ImportsTx } from './ports.ts';

export type ApplyFixtureImportError =
  | {
      readonly code:
        | 'import-not-found'
        | 'changed-since-read'
        | 'not-ready'
        | 'report-unreadable'
        | 'season-not-found'
        | 'revision-out-of-date'
        | 'draft-unreadable'
        | 'draft-too-large'
        | 'draft-changed'
        | 'teams-changed'
        | 'venues-changed';
    }
  | { readonly code: 'change-refused'; readonly reason: ChangeError };

export type FixtureImportApplied = {
  readonly gamesAdded: number;
  /** Final scores waiting for their games to be published. */
  readonly scoresWaiting: number;
  /** How many clashes the added games cause with the schedule and each other. */
  readonly clashCount: number;
};

export const applyFixtureImport = defineCommand({
  name: 'imports.apply_fixture_import',
  permission: 'schedule.import',
  input: z.object({ importId: z.uuid(), version: z.number().int().positive() }),
  allowed: async (context, input, tx: ImportsTx) => {
    const found = await tx.imports.find(input.importId);
    return mayImportInto(context, tx, 'schedule.import', found?.seasonId ?? null);
  },
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<FixtureImportApplied, ApplyFixtureImportError>> => {
    const found = await tx.imports.find(input.importId);
    if (found === undefined || found.kind !== 'fixtures' || found.seasonId === null) {
      return fail({ code: 'import-not-found' });
    }
    if (found.version !== input.version) return fail({ code: 'changed-since-read' });
    if (found.status !== 'ready') return fail({ code: 'not-ready' });
    const report = parseFixtureReport(found.report);
    if (report === undefined) return fail({ code: 'report-unreadable' });
    const seasonId = found.seasonId;
    const store = tx.scheduling;
    if ((await store.findSeason(seasonId)) === undefined) return fail({ code: 'season-not-found' });

    const latest = await store.latestRevision(seasonId);
    const draft = await store.findDraft(seasonId);
    let document: DraftDocument = emptyDraft;
    if (draft !== undefined) {
      if (draft.basedOnRevision !== latest) return fail({ code: 'revision-out-of-date' });
      const parsed = parseDraftDocument(draft.changes);
      if (parsed === undefined) return fail({ code: 'draft-unreadable' });
      document = parsed;
    }

    // What the file names must still be there: teams and venues may have been binned
    // since the preview.
    const teamIds = [...new Set(report.fixtures.flatMap((f) => [f.homeTeamId, f.awayTeamId]))];
    if ((await store.teamsOfSeason(seasonId, teamIds)).length !== teamIds.length) {
      return fail({ code: 'teams-changed' });
    }
    const courtsOf = new Map<string, readonly string[]>();
    const venueIds = new Set(report.fixtures.flatMap((f) => (f.venueId ? [f.venueId] : [])));
    for (const venueId of venueIds) {
      const venue = await store.findVenue(venueId);
      if (venue === undefined || venue.binned) return fail({ code: 'venues-changed' });
      courtsOf.set(
        venueId,
        (await store.listCourts(venueId)).map((c) => c.name),
      );
    }
    for (const f of report.fixtures) {
      if (f.court !== null && !(f.venueId && courtsOf.get(f.venueId)?.includes(f.court))) {
        return fail({ code: 'venues-changed' });
      }
    }

    // The draft so far is replayed on the published schedule; each game must fit on it.
    const published = await store.loadSchedule(seasonId);
    let state = applyDraft(published, document.changes, []).state;
    const added: DraftChange[] = [];
    const gameIds: string[] = [];
    const scores: CreatedFixtures['scores'] = [];
    let clashCount = 0;
    for (const f of report.fixtures) {
      const id = await gameIdFor(found.id, f.rowNumber);
      const game: ScheduleGame = {
        id,
        roundId: null,
        date: f.date,
        time: f.time,
        venueId: f.venueId,
        court: f.court,
        homeTeamId: f.homeTeamId,
        awayTeamId: f.awayTeamId,
        status: 'scheduled',
        recording: f.finalScore === null ? null : 'final-score',
      };
      const change: DraftChange = { kind: 'add-game', game };
      const applied = applyDraftChange(state, change, []);
      if (!applied.ok) return fail({ code: 'change-refused', reason: applied.error });
      state = applied.state;
      clashCount += applied.clashes.length;
      added.push(change);
      gameIds.push(id);
      if (f.finalScore !== null) {
        scores.push({
          gameId: id,
          home: f.finalScore.home,
          away: f.finalScore.away,
          recorded: false,
        });
      }
    }

    const next: DraftDocument = { version: 1, changes: [...document.changes, ...added] };
    if (new TextEncoder().encode(JSON.stringify(next)).length > maxDraftBytes) {
      return fail({ code: 'draft-too-large' });
    }
    let draftId: string;
    let draftVersion: number;
    if (draft === undefined) {
      const inserted = await store.insertDraft(seasonId, next, latest);
      if (inserted === 'no-season') return fail({ code: 'season-not-found' });
      if (inserted === 'exists') return fail({ code: 'draft-changed' });
      ({ id: draftId, version: draftVersion } = inserted);
    } else {
      const saved = await store.updateDraft(seasonId, draft.id, next, draft.version);
      if (saved === undefined) return fail({ code: 'draft-changed' });
      draftId = draft.id;
      draftVersion = saved;
    }

    const created: CreatedFixtures = {
      version: 1,
      draftId,
      draftStarted: draft === undefined,
      changesBefore: document.changes.length,
      changesAdded: added.length,
      draftVersion,
      gameIds,
      scores,
    };
    const saved = await tx.imports.save(found.id, { status: 'applied', created }, found.version);
    if (saved === undefined) return fail({ code: 'changed-since-read' });
    await recordActivity(tx, context, {
      action: 'imports.apply_fixture_import',
      target: { type: 'import', id: found.id },
      details: { games: added.length },
    });
    return ok({ gamesAdded: added.length, scoresWaiting: scores.length, clashCount });
  },
});
