// Getting each saved play to the people watching (T6 §6; T-117, T-120; record 039).
// After a batch of taps is saved, the game's message goes out on its channel and its
// score on the league's live-scores channel.
//
// - The message is cut from the game's snapshot read as a visitor (publicViewer): the
//   strictest view anyone has, so names and numbers are only those the league's and
//   each team's settings show everyone (T-81, T-87, S-22). One channel carries it to
//   every viewer, signed in or not.
// - The league is the context's, which the saved game belongs to; never the request's.
// - One message per saved batch, with the batch's last sequence number. A batch of
//   several taps (a queue replayed after a dropped connection) is a jump in numbers,
//   which a viewer answers by fetching a snapshot (T-118), so it shows the truth.
// - One game's messages go out one after another, in this server process, and never
//   one older than the last sent (two batches saved close together may read the same
//   newest state: the second is not sent twice). Different games go at once.
// - A message that could not be published is reported and dropped: the play is saved,
//   and viewers recover from the gap (LivePublishError).
import { leagueScoreFrom } from '@srleagues/contracts';
import { liveMessageOf, publicViewer, readGameSnapshot } from '@srleagues/core';
import { LivePublishError } from '@srleagues/providers';
import type { PublishPlays } from './tracker-commands-endpoint.ts';
import type { TrackerPorts } from './tracker-ports.ts';

export type PlayPublisherDeps = Pick<
  TrackerPorts,
  'publisher' | 'snapshotStoreOf' | 'namesShownOf' | 'clock'
> & {
  /** Where a message that did not go out is reported: its reason only. */
  readonly warn: (message: string, fields: { readonly reason: string }) => void;
};

/** The most games whose last message number is kept; the oldest is forgotten first. */
const rememberedGames = 2_000;

export function createPlayPublisher(deps: PlayPublisherDeps): PublishPlays {
  const queues = new Map<string, Promise<void>>();
  const lastSent = new Map<string, number>();

  async function publishLatest(leagueId: string, gameId: string): Promise<void> {
    const key = `${leagueId}|${gameId}`;
    const names = await deps.namesShownOf(leagueId);
    const read = await readGameSnapshot(
      deps.snapshotStoreOf(leagueId),
      { gameId },
      { leagueId, viewer: publicViewer(leagueId), audience: names.audience, policy: names.policy },
      deps.clock.now(),
    );
    if (!read.ok) return;
    const message = liveMessageOf(read.value);
    if (message.sequence <= (lastSent.get(key) ?? 0)) return;
    await deps.publisher.publishGame(leagueId, message);
    lastSent.delete(key);
    lastSent.set(key, message.sequence);
    if (lastSent.size > rememberedGames) {
      const oldest = lastSent.keys().next().value;
      if (oldest !== undefined) lastSent.delete(oldest);
    }
    await deps.publisher.publishLeagueScore(leagueId, leagueScoreFrom(message));
  }

  return (leagueId, gameId) => {
    const key = `${leagueId}|${gameId}`;
    const before = queues.get(key) ?? Promise.resolve();
    const mine = before.then(() =>
      publishLatest(leagueId, gameId).catch((thrown: unknown) => {
        deps.warn('live message not published', {
          reason: thrown instanceof LivePublishError ? thrown.code : 'failed',
        });
      }),
    );
    queues.set(key, mine);
    void mine.then(() => {
      if (queues.get(key) === mine) queues.delete(key);
    });
    return mine;
  };
}
