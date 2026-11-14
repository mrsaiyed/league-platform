'use client';
// The live part of a game's page (step 2.45; P7 §5.3; T6 §6): the scoreboard with its
// clock, the team fouls, the latest play and both teams' players. It is drawn first from
// the snapshot the page arrived with, then kept current by followGame: each live message,
// a snapshot on a gap, and a snapshot every 5 seconds (60 for a game not live) where the
// live connection cannot be made. The clock counts down on this device from the reference it was given (T-121).
// When the game starts or ends, the page is drawn again from the server, so a page opened
// before tip-off gets its play-by-play and one kept open to the end its box scores
// (record 051). Subscribing only; this page can never publish (T-120).
import { GameSnapshot } from '@srleagues/contracts';
import {
  BoxScoreTable,
  Scoreboard,
  type BoxScoreColumn,
  type BoxScoreLabels,
  type BoxScorePlayer,
  type ScoreboardLabels,
} from '@srleagues/ui';
import { useEffect, useRef, useState } from 'react';
import { serverSentEventsSubscriber } from '../live-updates/index.ts';
import { clockIsRunning, clockRemainingMs, serverOffsetMs } from './clock.ts';
import { followGame, type FollowedGame } from './follow-game.ts';
import {
  fill,
  periodClockText,
  periodName,
  playSentence,
  playerText,
  type GameWords,
} from './game-words.ts';
import { browserRedrawDevice, redrawPage } from './redraw-page.ts';
import type { ViewerGame } from './viewer-state.ts';

/** The words this part shows, from the message file (T-187). */
export type LiveGameLabels = {
  /** Names the region while the game is not live. */
  readonly region: string;
  /** Names the region while the game is live. */
  readonly regionLive: string;
  /** The score as said to a screen reader, with {away} {awayScore} {home} {homeScore}. */
  readonly spokenScore: string;
  readonly notStarted: string;
  /** With {away} {awayFouls} {home} {homeFouls}. */
  readonly teamFouls: string;
  /** With {play}. */
  readonly latestPlay: string;
  readonly playersHidden: string;
  readonly nameNotShown: string;
  readonly columns: readonly BoxScoreColumn[];
  readonly scoreboard: ScoreboardLabels;
  readonly boxScore: BoxScoreLabels;
};

export type LiveGameViewProps = {
  readonly leagueId: string;
  readonly gameId: string;
  /** The game's snapshot address (leagueApiUrl). */
  readonly snapshotAddress: string;
  /** The web app's live address (T-14). */
  readonly liveAddress: string;
  readonly initial: GameSnapshot;
  /** False for a game that arrived final: its full box scores are drawn by the page. */
  readonly showPlayers: boolean;
  readonly words: GameWords;
  readonly labels: LiveGameLabels;
};

type Side = 'home' | 'away';

async function fetchSnapshot(address: string): Promise<GameSnapshot | null> {
  try {
    const answer = await fetch(address, { headers: { accept: 'application/json' } });
    if (!answer.ok) return null;
    const parsed = GameSnapshot.safeParse(await answer.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Whether the page must be drawn again from the server: the game has started, ended or
 * been reopened since the snapshot the page arrived with, by a newer message or snapshot. The page's
 * server-drawn parts (the play-by-play, the box scores) stand on how it arrived.
 */
export function redrawsFor(
  arrived: Pick<GameSnapshot, 'status' | 'sequence'>,
  now: Pick<ViewerGame, 'status' | 'sequence'>,
): boolean {
  if (now.sequence <= arrived.sequence) return false;
  if (arrived.status === 'scheduled') return now.status !== 'scheduled';
  if (arrived.status === 'final') return now.status !== 'final'; // reopened
  return arrived.status === 'live' && now.status === 'final';
}

/**
 * "Latest play: …", or nothing. A clock tap, an undo or a lineup leaves an "other" play:
 * that says nothing a viewer can use, so no line is shown for it.
 */
export function latestPlayText(
  game: ViewerGame,
  words: GameWords,
  labels: Pick<LiveGameLabels, 'latestPlay'>,
): string {
  const play = game.latestPlay;
  const teams = game.teams;
  if (play === null || play.type === 'other' || teams === undefined) return '';
  const sentence = playSentence(words, {
    type: play.type,
    team: play.side === undefined ? null : teams[play.side].name,
    player: playerText(words, play.playerName, play.jersey),
    points: play.points ?? null,
    period: periodName(words, game.period, game.periods ?? 4),
  });
  return fill(labels.latestPlay, { play: sentence });
}

function PlayersTable({
  game,
  side,
  labels,
}: {
  readonly game: ViewerGame;
  readonly side: Side;
  readonly labels: LiveGameLabels;
}) {
  const team = game.teams?.[side];
  if (team === undefined) return null;
  const own = (game.players ?? []).filter((p) => p.side === side);
  const players: BoxScorePlayer[] | null = team.statsVisible
    ? own.map((p) => ({
        id: p.playerId,
        jersey: p.jersey,
        name: p.name ?? labels.nameNotShown,
        cells: { points: p.points ?? '', fouls: p.fouls ?? '' },
      }))
    : null;
  const fouls = own.reduce((sum, p) => sum + (p.fouls ?? 0), 0);
  return (
    <BoxScoreTable
      teamName={team.name}
      columns={labels.columns}
      players={players}
      totals={{ points: game.score[side], fouls: team.statsVisible ? fouls : '' }}
      hiddenNotice={labels.playersHidden}
      labels={labels.boxScore}
    />
  );
}

export function LiveGameView({
  leagueId,
  gameId,
  snapshotAddress,
  liveAddress,
  initial,
  showPlayers,
  words,
  labels,
}: LiveGameViewProps) {
  const [followed, setFollowed] = useState<FollowedGame>(() => ({
    game: { ...initial, playersAsOfSequence: initial.sequence },
    connection: 'connecting',
    offsetMs: 0,
  }));
  // Null until the page runs on the device: the server and the first drawing on the
  // device both show the clock as it stood when the snapshot was read.
  const [deviceNow, setDeviceNow] = useState<number | null>(null);

  useEffect(() => {
    const arrivedAt = Date.now();
    setDeviceNow(arrivedAt);
    // The first measurement: the 0 drawn before this is a stand-in, not a measurement.
    // followGame starts from the same one and only ever raises it (largestOffsetMs).
    setFollowed((f) => ({ ...f, offsetMs: serverOffsetMs(initial.sentAt, arrivedAt) }));
    const handle = followGame({
      leagueId,
      gameId,
      initial,
      initialReceivedAt: arrivedAt,
      subscriber: serverSentEventsSubscriber({ address: liveAddress }),
      fetchSnapshot: () => fetchSnapshot(snapshotAddress),
      onChange: setFollowed,
    });
    return () => handle.close();
  }, [leagueId, gameId, snapshotAddress, liveAddress, initial]);

  const game = followed.game;
  const redraw = redrawsFor(initial, game);
  const sequence = useRef(game.sequence);
  useEffect(() => {
    sequence.current = game.sequence;
  });
  useEffect(() => {
    // The server reads the same store the change came from, so the page drawn again
    // arrives at least this new. Spread over a few seconds, only when the page answers,
    // and once per sequence number (redraw-page.ts).
    if (!redraw) return undefined;
    return redrawPage({ gameId, sequence: sequence.current }, browserRedrawDevice);
  }, [redraw, gameId]);
  const serverNow = deviceNow === null ? initial.sentAt : deviceNow + followed.offsetMs;
  const running = game.status === 'live' && clockIsRunning(game.clock, serverNow);
  useEffect(() => {
    if (!running) return undefined;
    const tick = setInterval(() => setDeviceNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [running]);

  const teams = game.teams ?? initial.teams;
  const periods = game.periods ?? initial.periods;
  const latest = latestPlayText(game, words, labels);
  return (
    <section
      className="game-live"
      aria-label={game.status === 'live' ? labels.regionLive : labels.region}
      data-live-connection={followed.connection}
      data-live-sequence={game.sequence}
      data-live-status={game.status}
    >
      {game.status === 'scheduled' ? (
        <p>{labels.notStarted}</p>
      ) : (
        <Scoreboard
          home={{ name: teams.home.name, score: game.score.home }}
          away={{ name: teams.away.name, score: game.score.away }}
          state={game.status === 'live' ? 'live' : 'final'}
          {...(game.status === 'live'
            ? {
                periodText: periodClockText(
                  words,
                  game.period,
                  periods,
                  clockRemainingMs(game.clock, serverNow),
                ),
              }
            : {})}
          labels={labels.scoreboard}
        />
      )}
      {game.status === 'live' ? (
        <p>
          {fill(labels.teamFouls, {
            away: teams.away.name,
            awayFouls: game.teamFouls.away,
            home: teams.home.name,
            homeFouls: game.teamFouls.home,
          })}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="game-latest-play">
        {game.status === 'scheduled' ? null : (
          <span className="ui-visually-hidden">
            {fill(labels.spokenScore, {
              away: teams.away.name,
              awayScore: game.score.away,
              home: teams.home.name,
              homeScore: game.score.home,
            })}{' '}
          </span>
        )}
        {latest}
      </p>
      {showPlayers && game.status !== 'scheduled' ? (
        <>
          <PlayersTable game={game} side="away" labels={labels} />
          <PlayersTable game={game} side="home" labels={labels} />
        </>
      ) : null}
    </section>
  );
}
