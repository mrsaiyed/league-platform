// Publishes the season's schedule draft (P7 §4.4, A-9): new games are created, moved games
// updated, removed games go to the bin, rounds are renamed or re-dated, a numbered schedule
// revision is written with its summary and the publication is logged (A-6). The admin
// names the draft, its version and the revision it was based on, so a draft someone else
// changed, or one made on an older schedule, is never published unseen (A-8). The draft is
// used up: publishing the same revision again is refused because the schedule has moved
// on. Telling the people affected comes with stage 4. Any refusal rolls everything back.
import { z } from 'zod';
import { recordActivity } from '../../access/index.ts';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { mayPublishSchedule } from '../policy.ts';
import type { PublishedGameChange, SchedulingTx } from '../ports.ts';
import { planPublication, type PublishBlocker } from '../publish-plan.ts';
import type { PublishSummary } from '../rules/summarize-publish.ts';

export type PublishScheduleError =
  | {
      readonly code:
        | 'season-not-found'
        | 'draft-not-found'
        /** The draft was saved by someone else since the admin read it, or was discarded. */
        | 'changed-since-read';
    }
  | PublishBlocker;

export type PublishScheduleValue = {
  readonly revision: number;
  readonly summary: PublishSummary;
  readonly teamCount: number;
  readonly peopleCount: number;
};

const captureModes = { 'final-score': 'final', 'box-score': 'box', live: 'live' } as const;

/** Most ids a revision's summary lists per kind; the revision holds 64 KB at most. */
const maxListedIds = 300;

const listed = (ids: readonly string[]) => (ids.length <= maxListedIds ? ids : undefined);

export const publishSchedule = defineCommand({
  name: 'scheduling.publish_schedule',
  permission: 'schedule.publish',
  input: z.object({
    seasonId: z.uuid(),
    basedOnRevision: z.number().int().positive().nullable(),
    draftId: z.uuid(),
    version: z.number().int().positive(),
  }),
  allowed: (context, input, tx: SchedulingTx) => mayPublishSchedule(context, tx, input.seasonId),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<PublishScheduleValue, PublishScheduleError>> => {
    const store = tx.scheduling;
    if ((await store.findSeason(input.seasonId)) === undefined) {
      return fail({ code: 'season-not-found' });
    }
    const latest = await store.latestRevision(input.seasonId);
    if (input.basedOnRevision !== latest) return fail({ code: 'revision-out-of-date' });
    const plan = await planPublication(tx, input.seasonId);
    if (plan === 'no-draft') return fail({ code: 'draft-not-found' });
    if ('unreadable' in plan) return fail({ code: 'draft-unreadable' });
    if (plan.draft.id !== input.draftId || plan.draft.version !== input.version) {
      return fail({ code: 'changed-since-read' });
    }
    const [blocker] = plan.blockers;
    if (blocker !== undefined) return fail(blocker);

    // The draft is claimed first: a second publication of it finds it gone.
    if (!(await store.deleteDraft(input.seasonId, plan.draft.id, plan.draft.version))) {
      return fail({ code: 'changed-since-read' });
    }

    const { summary } = plan;
    const before = new Map(plan.published.games.map((g) => [g.id, g]));
    const after = new Map(plan.result.games.map((g) => [g.id, g]));
    const oldRounds = new Map(plan.published.rounds.map((r) => [r.id, r]));
    for (const round of plan.result.rounds) {
      const old = oldRounds.get(round.id);
      if (old === undefined) continue;
      const label = old.label !== round.label ? round.label : undefined;
      const date = old.date !== round.date && round.date !== null ? round.date : undefined;
      if (label === undefined && date === undefined) continue;
      await store.updateRound(input.seasonId, round.id, {
        ...(label === undefined ? {} : { label }),
        ...(date === undefined ? {} : { date }),
      });
    }

    await store.insertPublishedGames(input.seasonId, plan.newGames);

    for (const id of new Set([...summary.gamesMoved, ...summary.gamesRecordingChanged])) {
      const game = after.get(id);
      const old = before.get(id);
      if (game === undefined || old === undefined || game.time === null) continue;
      const moved = summary.gamesMoved.includes(id);
      const recording =
        game.recording !== null && game.recording !== undefined && game.recording !== old.recording
          ? captureModes[game.recording]
          : undefined;
      const change: PublishedGameChange = {
        ...(moved
          ? {
              slot: {
                roundId: game.roundId,
                date: game.date,
                time: game.time,
                venueId: game.venueId,
                court: game.court,
              },
            }
          : {}),
        ...(recording === undefined ? {} : { captureMode: recording }),
      };
      if (!(await store.updatePublishedGame(input.seasonId, id, change))) {
        return fail({ code: 'game-already-started', gameId: id });
      }
    }

    const binned = await store.binPublishedGames(input.seasonId, summary.gamesRemoved);
    if (binned !== summary.gamesRemoved.length) return fail({ code: 'game-cannot-be-removed' });

    const revision = (latest ?? 0) + 1;
    const teamCount = summary.teamsAffected.length;
    const written = await store.insertRevision(input.seasonId, {
      number: revision,
      publishedByAccountId: context.accountId,
      summary: {
        version: 1,
        basedOnRevision: latest,
        gamesAdded: summary.gamesAdded.length,
        gamesRemoved: summary.gamesRemoved.length,
        gamesMoved: summary.gamesMoved.length,
        gamesRecordingChanged: summary.gamesRecordingChanged.length,
        roundsRenamed: summary.roundsRenamed.length,
        roundsDateChanged: summary.roundsDateChanged.length,
        teamsAffected: teamCount,
        peopleAffected: plan.peopleAffected,
        gameIds: {
          added: listed(summary.gamesAdded),
          removed: listed(summary.gamesRemoved),
          moved: listed(summary.gamesMoved),
        },
      },
    });
    if (!written) return fail({ code: 'revision-out-of-date' });

    await recordActivity(tx, context, {
      action: 'scheduling.publish_schedule',
      target: { type: 'season', id: input.seasonId },
      details: {
        revision,
        gamesAdded: summary.gamesAdded.length,
        gamesRemoved: summary.gamesRemoved.length,
        gamesMoved: summary.gamesMoved.length,
        teamsAffected: teamCount,
        peopleAffected: plan.peopleAffected,
      },
    });
    return ok({ revision, summary, teamCount, peopleCount: plan.peopleAffected });
  },
});
