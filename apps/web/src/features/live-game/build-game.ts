// What a game's page shows, worked out on the server from the step 2.40 game page and
// the step 2.32 snapshot, both read as a visitor (step 2.45; P7 §5.3; S-7, S-22). Only
// words and numbers leave here; the page and its live part draw them.
import type { GamePage, PlayLine } from '@srleagues/core';
import type { BoxScoreColumn, BoxScorePlayer } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { locale, t } from '../../server/messages.ts';
import { hasStatLabel, statLabel } from '../stats-pages/index.ts';
import {
  periodClockText,
  periodName,
  playSentence,
  playerText,
  type GameWords,
} from './game-words.ts';
import type { LiveGameLabels } from './live-game-view.tsx';

/** The message-file texts the play and clock rules fill in, braces and all. */
export function gameWords(): GameWords {
  return {
    periodQuarter: t('game.periodQuarter'),
    periodHalf: t('game.periodHalf'),
    periodOvertime: t('game.periodOvertime'),
    periodClock: t('game.periodClock'),
    player: t('game.player'),
    playerJersey: t('game.playerJersey'),
    jerseyOnly: t('game.jerseyOnly'),
    play: {
      score: t('game.play.score'),
      scoreTeam: t('game.play.scoreTeam'),
      foul: t('game.play.foul'),
      foulTeam: t('game.play.foulTeam'),
      unfoul: t('game.play.unfoul'),
      turnover: t('game.play.turnover'),
      turnoverTeam: t('game.play.turnoverTeam'),
      unturnover: t('game.play.unturnover'),
      timeout: t('game.play.timeout'),
      untimeout: t('game.play.untimeout'),
      sub: t('game.play.sub'),
      subTeam: t('game.play.subTeam'),
      lineup: t('game.play.lineup'),
      period: t('game.play.period'),
      other: t('game.play.other'),
      noTeam: {
        score: t('game.play.noTeam.score'),
        foul: t('game.play.noTeam.foul'),
        unfoul: t('game.play.noTeam.unfoul'),
        turnover: t('game.play.noTeam.turnover'),
        unturnover: t('game.play.noTeam.unturnover'),
        timeout: t('game.play.noTeam.timeout'),
        untimeout: t('game.play.noTeam.untimeout'),
        sub: t('game.play.noTeam.sub'),
        lineup: t('game.play.noTeam.lineup'),
      },
    },
  };
}

const column = (key: string): BoxScoreColumn => ({
  key,
  label: statLabel(key).short,
  fullName: statLabel(key).full,
});

/**
 * What a game not played says instead of "not started yet". The snapshot calls a
 * postponed or cancelled game "scheduled", so the page reads the game's own status.
 */
function notStartedText(status: string): string {
  if (status === 'postponed') return t('game.postponed');
  if (status === 'cancelled') return t('game.cancelled');
  return t('game.notStarted');
}

/** A note under the result: a forfeit says so; null for every other game. */
export function statusNote(status: string): string | null {
  return status === 'forfeit' ? t('game.forfeit') : null;
}

/** The live part's words, for a game whose own status is `status`. */
export function liveGameLabels(status: string): LiveGameLabels {
  const labels = displayLabels(t);
  return {
    region: t('game.live'),
    notStarted: notStartedText(status),
    teamFouls: t('game.teamFouls'),
    latestPlay: t('game.latestPlay'),
    playersHidden: t('game.playersHidden'),
    nameNotShown: t('game.nameNotShown'),
    columns: [column('points'), column('fouls')],
    scoreboard: labels.scoreboard,
    boxScore: labels.boxScore,
  };
}

/** "Away at Home". */
export const gameTitle = (page: GamePage): string =>
  t('game.title', { away: page.scoreboard.away.name, home: page.scoreboard.home.name });

/**
 * When the game starts, in the league's own zone. A postponed or cancelled game says
 * when it was set for, or nothing when it had no date.
 */
export function startText(
  startsAt: string | null,
  timeZone: string,
  status: string,
): string | null {
  const notPlayed = status === 'postponed' || status === 'cancelled';
  if (startsAt === null) return notPlayed ? null : t('game.noDate');
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(startsAt));
  return t(notPlayed ? 'game.wasSetFor' : 'game.startsAt', { when });
}

/** "Corrected on 14 Nov 2026": the date only, never the reason (S-7); null if never corrected. */
export function correctedText(correctedOn: string | null | undefined): string | null {
  if (correctedOn === null || correctedOn === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(correctedOn)) return null;
  const date = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${correctedOn}T12:00:00Z`));
  return t('game.corrected', { date });
}

export type BoxScoreView = {
  readonly side: 'home' | 'away';
  readonly teamName: string;
  readonly columns: readonly BoxScoreColumn[];
  /** Null: this team's players are hidden from visitors (S-22). */
  readonly players: readonly BoxScorePlayer[] | null;
  readonly totals: Readonly<Record<string, number>>;
};

export type BoxScoresView =
  | { readonly kind: 'final-score-only' }
  | { readonly kind: 'no-stats' }
  | { readonly kind: 'tables'; readonly tables: readonly BoxScoreView[] };

/**
 * A finished game's box scores, away team first as on the scoreboard. A statistic the
 * message file has no words for is left out, so no raw key is ever a heading (T-187).
 */
export function buildBoxScores(page: GamePage): BoxScoresView {
  if (page.game.recording === 'final-score') return { kind: 'final-score-only' };
  const keys: string[] = [];
  const add = (stats: Readonly<Record<string, number>>) => {
    for (const key of Object.keys(stats)) {
      if (hasStatLabel(key) && !keys.includes(key)) keys.push(key);
    }
  };
  for (const box of page.boxScores) {
    add(box.totals);
    for (const p of box.players) add(p.stats);
  }
  if (keys.length === 0) return { kind: 'no-stats' };
  const columns = keys.map(column);
  const ordered = [...page.boxScores].sort((a, b) =>
    a.side === b.side ? 0 : a.side === 'away' ? -1 : 1,
  );
  return {
    kind: 'tables',
    tables: ordered.map((box) => ({
      side: box.side,
      teamName: box.name,
      columns,
      players: box.playerLinesShown
        ? box.players.map((p) => ({
            id: p.personId,
            jersey: p.jersey,
            name: p.name ?? t('game.nameNotShown'),
            cells: p.stats,
          }))
        : null,
      totals: box.totals,
    })),
  };
}

const playerOf = (words: GameWords, ref: PlayLine['player'] | undefined): string | null =>
  ref === null || ref === undefined ? null : playerText(words, ref.name, ref.jersey);

/** The play-by-play, newest first, one sentence each. */
export function buildPlays(page: GamePage, words: GameWords): readonly string[] {
  const periods = page.scoreboard.periods ?? 4;
  const teamName = (side: PlayLine['side']) => (side === null ? null : page.scoreboard[side].name);
  return [...page.plays].reverse().map((line) => {
    const play = playSentence(words, {
      type: line.type,
      team: teamName(line.side),
      player: playerOf(words, line.player),
      points: line.points,
      playerIn: playerOf(words, line.playersIn[0]),
      playerOut: playerOf(words, line.playersOut[0]),
      period: line.period === null ? null : periodName(words, line.period, periods),
    });
    const score = {
      play,
      away: page.scoreboard.away.name,
      awayScore: line.score.away,
      home: page.scoreboard.home.name,
      homeScore: line.score.home,
    };
    return line.period !== null && line.clockMs !== null
      ? t('game.playLine', {
          ...score,
          clock: periodClockText(words, line.period, periods, line.clockMs),
        })
      : t('game.playLineNoClock', score);
  });
}
