// What publishing a season's draft would do (P7 §4.4, A-7), worked out once and used by both
// the preview and the publication, so what the admin is shown is what happens. The draft's
// changes are replayed on the published schedule; the difference is the summary; anything
// that would make the publication unsafe is a blocker (the preview lists them all, the
// publication refuses with the first).
import { upgradeSeasonRules } from '@srleagues/contracts';
import { parseDraftDocument } from './draft-document.ts';
import { checkSlotPlace } from './draft-edit.ts';
import type { DraftRecord, NewPublishedGame, SchedulingTx } from './ports.ts';
import { applyDraft, type ApplyDraftResult } from './rules/apply-draft.ts';
import type { Clash, ScheduleGame, ScheduleState } from './rules/schedule-types.ts';
import { summarizePublish, type PublishSummary } from './rules/summarize-publish.ts';

export type PublishBlocker =
  | {
      readonly code:
        | 'nothing-to-publish'
        | 'revision-out-of-date'
        | 'change-no-longer-fits'
        /** The draft moves, removes or re-records a game that is live or decided. */
        | 'game-already-started'
        /** The draft removes a game the tracker has recorded something for. */
        | 'game-cannot-be-removed'
        /** A game the draft adds has the id of a game that exists already (in the bin, or with no date). */
        | 'game-id-taken'
        | 'game-without-time'
        | 'unknown-team'
        | 'unknown-venue'
        | 'unknown-court';
      readonly gameId?: string;
    }
  | { readonly code: 'draft-unreadable' };

export type PublishPlan = {
  readonly draft: DraftRecord;
  readonly latestRevision: number | null;
  readonly published: ScheduleState;
  readonly result: ScheduleState;
  readonly applied: ApplyDraftResult;
  readonly summary: PublishSummary;
  readonly peopleAffected: number;
  readonly clashes: readonly Clash[];
  readonly blockers: readonly PublishBlocker[];
  /** The games the publication creates, with how each is recorded settled (the season's rules fill a blank). */
  readonly newGames: readonly NewPublishedGame[];
};

const captureModes = { 'final-score': 'final', 'box-score': 'box', live: 'live' } as const;

/** Undefined when the season has no draft; the draft's own problems are blockers. */
export async function planPublication(
  tx: SchedulingTx,
  seasonId: string,
): Promise<PublishPlan | 'no-draft' | { readonly unreadable: DraftRecord }> {
  const store = tx.scheduling;
  const draft = await store.findDraft(seasonId);
  if (draft === undefined) return 'no-draft';
  const document = parseDraftDocument(draft.changes);
  if (document === undefined) return { unreadable: draft };
  const latestRevision = await store.latestRevision(seasonId);
  const published = await store.loadSchedule(seasonId);
  // Skipped dates are not stored (step 2.20), so nothing is judged against them here.
  const applied = applyDraft(published, document.changes, []);
  const summary = summarizePublish(published, applied.state);
  const blockers: PublishBlocker[] = [];

  if (draft.basedOnRevision !== latestRevision) blockers.push({ code: 'revision-out-of-date' });
  applied.rejected.forEach(() => blockers.push({ code: 'change-no-longer-fits' }));

  const nothing =
    summary.gamesAdded.length +
      summary.gamesRemoved.length +
      summary.gamesMoved.length +
      summary.gamesRecordingChanged.length +
      summary.roundsRenamed.length +
      summary.roundsDateChanged.length ===
    0;
  if (nothing) blockers.push({ code: 'nothing-to-publish' });

  const before = new Map(published.games.map((g) => [g.id, g]));
  const after = new Map(applied.state.games.map((g) => [g.id, g]));
  const started = (g: ScheduleGame | undefined) =>
    g !== undefined && ['live', 'final', 'forfeit'].includes(g.status);
  for (const id of [
    ...summary.gamesMoved,
    ...summary.gamesRemoved,
    ...summary.gamesRecordingChanged,
  ]) {
    if (started(before.get(id))) blockers.push({ code: 'game-already-started', gameId: id });
  }

  const known = await store.gamesById(seasonId, [...summary.gamesAdded, ...summary.gamesRemoved]);
  const factsOf = new Map(known.map((f) => [f.id, f]));
  for (const id of summary.gamesAdded) {
    if (factsOf.has(id)) blockers.push({ code: 'game-id-taken', gameId: id });
  }
  for (const id of summary.gamesRemoved) {
    const facts = factsOf.get(id);
    if (facts === undefined || facts.binned || facts.hasEvents) {
      blockers.push({ code: 'game-cannot-be-removed', gameId: id });
    }
  }

  const placed = [...summary.gamesAdded, ...summary.gamesMoved]
    .map((id) => after.get(id))
    .filter((g): g is ScheduleGame => g !== undefined);
  for (const g of placed) {
    if (g.time === null) blockers.push({ code: 'game-without-time', gameId: g.id });
  }
  const teams = new Set(placed.flatMap((g) => [g.homeTeamId, g.awayTeamId]));
  const foundTeams = new Set(await store.teamsOfSeason(seasonId, [...teams]));
  for (const g of placed) {
    if (!foundTeams.has(g.homeTeamId) || !foundTeams.has(g.awayTeamId)) {
      blockers.push({ code: 'unknown-team', gameId: g.id });
    }
  }
  const places = new Map<string, Awaited<ReturnType<typeof checkSlotPlace>>>();
  for (const g of placed) {
    const key = `${g.venueId ?? ''}|${g.court ?? ''}`;
    if (!places.has(key)) places.set(key, await checkSlotPlace(tx, g));
    const problem = places.get(key);
    if (problem !== undefined) {
      blockers.push({
        code: problem.code === 'unknown-court' ? 'unknown-court' : 'unknown-venue',
        gameId: g.id,
      });
    }
  }

  const rules = upgradeSeasonRules(await store.seasonRules(seasonId));
  const defaultRecording = rules.ok ? rules.rules.recording : 'live';
  const newGames: NewPublishedGame[] = summary.gamesAdded.flatMap((id) => {
    const g = after.get(id);
    if (g === undefined || g.time === null) return [];
    return [
      {
        id: g.id,
        roundId: g.roundId,
        date: g.date,
        time: g.time,
        venueId: g.venueId,
        court: g.court,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        captureMode: captureModes[g.recording ?? defaultRecording],
      },
    ];
  });

  return {
    draft,
    latestRevision,
    published,
    result: applied.state,
    applied,
    summary,
    peopleAffected: await store.countPeopleOnTeams(seasonId, summary.teamsAffected),
    clashes: applied.clashes,
    blockers,
    newGames,
  };
}
