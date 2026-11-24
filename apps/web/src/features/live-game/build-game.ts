// What a game's page shows, worked out on the server from the step 2.40 game page and
// the step 2.32 snapshot, both read as a visitor (step 2.45; P7 §5.3; S-7, S-22). Only
// words and numbers leave here; the page and its live part draw them.
import {
  publicGameState,
  type GamePage,
  type PlayLine,
  type PublicGameClock,
  type PublicGameState,
  type PublicGameTruth,
} from '@srleagues/core';
import type { BoxScoreColumn, BoxScorePlayer, FinalPill, PlayRow } from '@srleagues/ui';
import { displayLabels, finalPillOf } from '@srleagues/site';
import { locale, t } from '../../server/messages.ts';
import { hasStatLabel, statLabel } from '../stats-pages/index.ts';
import { formatClock } from './clock.ts';
import {
  boxScoreName,
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
        scoreOne: t('game.play.noTeam.scoreOne'),
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

/** The live part's words, for a game whose own status is `status` and public state `state`. */
export function liveGameLabels(status: string, state?: PublicGameState): LiveGameLabels {
  const labels = displayLabels(t);
  return {
    region: t('game.region'),
    regionLive: t('game.live'),
    spokenScore: t('game.spokenScore'),
    // A game whose start has passed with no score has not "not started" (step 2.159).
    notStarted: state === 'awaiting-score' ? t('game.noScoreYet') : notStartedText(status),
    teamFouls: t('game.teamFouls'),
    latestPlay: t('game.latestPlay'),
    playersHidden: t('game.playersHidden'),
    nameNotShown: t('game.nameNotShown'),
    jerseyOnly: t('game.jerseyOnly'),
    playersTitle: t('game.liveStats'),
    columns: [column('points'), column('fouls')],
    scoreboard: labels.scoreboard,
    boxScore: labels.boxScore,
  };
}

/** "Away at Home". */
export const gameTitle = (page: GamePage): string =>
  t('game.title', { away: page.scoreboard.away.name, home: page.scoreboard.home.name });

/**
 * When the game starts, in the league's own zone: "Starts" before it does, "Scheduled
 * for" while it is live (the time it was set for, not when it really started, which the
 * page does not have), "Played" once decided. A postponed or cancelled game says when it
 * was set for, or nothing when it had no date.
 */
export function startText(
  startsAt: string | null,
  timeZone: string,
  status: string,
): string | null {
  const notPlayed = status === 'postponed' || status === 'cancelled';
  const decided = status === 'final' || status === 'forfeit';
  if (startsAt === null) return notPlayed || decided || status === 'live' ? null : t('game.noDate');
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(startsAt));
  if (notPlayed) return t('game.wasSetFor', { when });
  if (decided) return t('game.playedOn', { when });
  return t(status === 'live' ? 'game.scheduledFor' : 'game.startsAt', { when });
}

/**
 * The line under the page's title. A game under way has none: the time it was set for is
 * not the time it started, which the page does not have, and the board shows its clock.
 * A game still to come has none either: the board says its day and time, or "Date to be
 * announced", once. Every other game says when it was played or was set for (startText).
 */
export function titleLine(
  startsAt: string | null,
  timeZone: string,
  status: string,
): string | null {
  if (status === 'live') return null;
  // A game still to come says its day once: on the board, between the two teams
  // (boardWhen), where it is the board's own middle. A line over the board said it twice.
  if (status === 'scheduled') return null;
  return startText(startsAt, timeZone, status);
}

/**
 * The line under the title, from the game's one public truth (publicGameState, step 2.159):
 * none for a game under way or still to come (the board says its day); "Ended Saturday,
 * November 14" for a final game whose end is known; "Was set for …" for every other game
 * whose start has passed, a forfeit and a game awaiting its score or being corrected
 * among them, and for a final game whose end is not known. None with no planned time.
 */
export function truthLine(
  startsAt: string | null,
  timeZone: string,
  truth: PublicGameTruth,
): string | null {
  if (truth.state === 'live' || truth.state === 'upcoming') return null;
  if (truth.state === 'final' && truth.endedAt !== null) {
    const day = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone,
    }).format(new Date(truth.endedAt));
    return t('game.endedOn', { day });
  }
  if (startsAt === null) return null;
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(startsAt));
  return t('game.wasSetFor', { when });
}

/**
 * The game's one public truth (publicGameState, step 2.159), from what its page read: its
 * day with no time, when it has one, is the published schedule's (`localDate`).
 */
export const gameTruthOf = (
  page: GamePage,
  clock: PublicGameClock,
  localDate: string | null = null,
): PublicGameTruth =>
  publicGameState(
    {
      status: page.game.status,
      startsAt: page.game.startsAt,
      localDate,
      homeScore: page.scoreboard.home.score,
      awayScore: page.scoreboard.away.score,
      finalizedAt: page.game.finalizedAt,
      beingCorrected: page.game.beingCorrected,
    },
    clock,
  );

/** The board's pill of a state only the public truth knows; undefined for every other. */
export function truthPill(state: PublicGameState): string | undefined {
  if (state === 'awaiting-score') return t('game.awaitingScore');
  if (state === 'being-corrected') return t('game.beingCorrected');
  return undefined;
}

/**
 * The sentence under a forfeited game's score. It names who forfeited: the team given the
 * loser's score, as the season's rules write a forfeit. With the scores level it cannot
 * be told, and the sentence only says the game was decided by forfeit.
 */
export function forfeitNote(
  away: { readonly name: string; readonly score: number },
  home: { readonly name: string; readonly score: number },
): string {
  if (away.score === home.score) return t('game.forfeit');
  return t('game.forfeitBy', { team: away.score < home.score ? away.name : home.name });
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
  /** Sentences under the table saying why a Total is not its column added up. */
  readonly notes: readonly string[];
  /**
   * Set when nothing at all was recorded for this team (a box score typed for one team
   * only): the table is left out and this one sentence stands in its place, rather than
   * a Total of dashes beside a score on the board (step 2.196).
   */
  readonly nothingRecorded: string | null;
};

export type BoxScoresView =
  | { readonly kind: 'final-score-only' }
  | { readonly kind: 'no-stats' }
  | { readonly kind: 'tables'; readonly tables: readonly BoxScoreView[] };

/**
 * Why a team's Total is not what its column adds up to, where the page shows the column
 * (step 2.196): its points are the typed final score, not its players' points (S-26), or
 * its turnovers count some charged to the team itself. Nothing where the players' lines
 * are hidden: there is no column to add up.
 */
function totalNotes(box: GamePage['boxScores'][number], keys: readonly string[]): string[] {
  if (!box.playerLinesShown) return [];
  const notes: string[] = [];
  const score = box.totals['points'];
  if (
    keys.includes('points') &&
    box.playersPoints !== null &&
    score !== undefined &&
    score !== box.playersPoints
  ) {
    notes.push(t('game.playersPointsDiffer', { players: box.playersPoints, score }));
  }
  if (keys.includes('turnovers') && box.teamTurnovers > 0) {
    notes.push(t.plural('game.teamTurnovers', box.teamTurnovers));
  }
  return notes;
}

/**
 * A finished game's box scores, away team first as on the scoreboard. The columns are the
 * statistics the season keeps, in its order, as the statistics page draws them (P7 §1;
 * the numbers audit's L7), each one this game recorded: a column wholly empty in both
 * teams' lines was not kept for this game (P7 §5.2). A statistic the message file has no
 * words for is left out, so no raw key is ever a heading (T-187).
 */
export function buildBoxScores(page: GamePage): BoxScoresView {
  if (page.game.recording === 'final-score') return { kind: 'final-score-only' };
  const recorded = new Set<string>();
  for (const box of page.boxScores) {
    for (const key of Object.keys(box.totals)) recorded.add(key);
    for (const p of box.players) for (const key of Object.keys(p.stats)) recorded.add(key);
  }
  const keys = page.game.statKeys.filter((key) => hasStatLabel(key) && recorded.has(key));
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
            name: boxScoreName(t('game.jerseyOnly'), t('game.nameNotShown'), p),
            cells: p.stats,
            // A rostered player who never entered (P7 §5.6) reads so, not a row of dashes.
            ...(p.played ? {} : { note: t('game.didNotPlay') }),
          }))
        : null,
      totals: box.totals,
      notes: totalNotes(box, keys),
      nothingRecorded:
        Object.keys(box.totals).length === 0 ? t('game.nothingRecordedForTeam') : null,
    })),
  };
}

const playerOf = (words: GameWords, ref: PlayLine['player'] | undefined): string | null =>
  ref === null || ref === undefined ? null : playerText(words, ref.name, ref.jersey);

/** The plays of one period, as the play-by-play draws them: one table a period. */
export type PlayPeriodView = {
  readonly key: string;
  /** "Half 2"; "Before the start" for plays recorded before the first period. */
  readonly title: string;
  readonly rows: readonly PlayRow[];
};

/**
 * The play-by-play, newest first, a period at a time: each play's clock, its sentence, its
 * team's color, and the score after a basket (away team first, as on the scoreboard).
 */
export function buildPlays(page: GamePage, words: GameWords): readonly PlayPeriodView[] {
  const periods = page.scoreboard.periods ?? 4;
  const teamName = (side: PlayLine['side']) => (side === null ? null : page.scoreboard[side].name);
  const colorOf = (side: 'home' | 'away') =>
    page.boxScores.find((box) => box.side === side)?.color ?? null;
  const groups: { key: string; title: string; rows: PlayRow[] }[] = [];
  for (const line of [...page.plays].reverse()) {
    const title =
      line.period === null ? t('game.playsBeforeStart') : periodName(words, line.period, periods);
    let group = groups.at(-1);
    if (group === undefined || group.title !== title) {
      group = { key: `${groups.length}-${line.period ?? 0}`, title, rows: [] };
      groups.push(group);
    }
    const names = {
      away: page.scoreboard.away.name,
      awayScore: line.score.away,
      home: page.scoreboard.home.name,
      homeScore: line.score.home,
    };
    group.rows.push({
      key: String(line.number),
      clock: line.clockMs === null ? '' : formatClock(line.clockMs),
      text: playSentence(words, {
        type: line.type,
        team: teamName(line.side),
        player: playerOf(words, line.player),
        points: line.points,
        playerIn: playerOf(words, line.playersIn[0]),
        playerOut: playerOf(words, line.playersOut[0]),
        period: line.period === null ? null : periodName(words, line.period, periods),
      }),
      ...(line.side === null ? {} : { team: { color: colorOf(line.side) } }),
      ...(line.type === 'score'
        ? { score: { text: t('game.playScore', names), spoken: t('game.playScoreSpoken', names) } }
        : {}),
    });
  }
  return groups;
}

/** What the scoreboard shows beside the scores: nothing here changes while a game is played. */
export type GameBoard = {
  readonly colors: { readonly home: string | null; readonly away: string | null };
  /** A game still to play: its day and, when it has one, its time, in the league's own zone. */
  readonly when?: { readonly day: string; readonly time?: string } | undefined;
  /** Where it is played: the venue, and the court when it has one. */
  readonly placeText?: string | undefined;
  /** A final game won in overtime: its pill, "Final, OT", said "Final after overtime" (P7 §5.6). */
  readonly finalPill?: FinalPill | undefined;
};

/**
 * The board's pill for a final game won in overtime, as its result keeps it (P7 §5.6):
 * "Final, OT", "Final, 2OT". Undefined for any other game, whose pill is as before.
 */
export const boardFinalPill = (page: GamePage): FinalPill | undefined =>
  finalPillOf(t, page.game.overtimePeriods);

/** The two teams' own colors, as the game's page read them. */
export const boardColors = (page: GamePage): GameBoard['colors'] => ({
  home: page.boxScores.find((box) => box.side === 'home')?.color ?? null,
  away: page.boxScores.find((box) => box.side === 'away')?.color ?? null,
});

/**
 * The day and time a game still to play is set for, short, for between the teams on the
 * scoreboard. Nothing for any other game: a postponed game's old date is never drawn as
 * if it were still coming.
 */
export function boardWhen(
  startsAt: string | null,
  timeZone: string,
  status: string,
): GameBoard['when'] {
  if (status !== 'scheduled') return undefined;
  if (startsAt === null) return { day: t('game.noDate') };
  const at = new Date(startsAt);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(at);
  return {
    day: part({ weekday: 'short', month: 'short', day: 'numeric' }),
    time: part({ hour: 'numeric', minute: '2-digit' }),
  };
}

/** The pill of a game not played or decided off the court; undefined for every other game. */
export function boardStateText(status: string): string | undefined {
  const labels = displayLabels(t).game;
  if (status === 'forfeit') return labels.forfeit;
  if (status === 'postponed') return labels.postponed;
  if (status === 'cancelled') return labels.cancelled;
  return undefined;
}
