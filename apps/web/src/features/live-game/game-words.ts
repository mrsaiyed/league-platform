// How a game's page words a period, the clock and a play (step 2.45; T-187). The words
// themselves come from the message file: the server reads them once and hands them to
// the page, so the same rules word a play on the server and on the device. Nothing
// here reads the message file or the network.
import type { LatestPlay } from '@srleagues/contracts';
import { formatClock } from './clock.ts';

/** The message-file texts these rules fill in, with their {braces} still in. */
export type GameWords = {
  readonly periodQuarter: string;
  readonly periodHalf: string;
  readonly periodOvertime: string;
  readonly periodClock: string;
  readonly player: string;
  readonly playerJersey: string;
  readonly jerseyOnly: string;
  readonly play: {
    readonly score: string;
    readonly scoreTeam: string;
    readonly foul: string;
    readonly foulTeam: string;
    readonly unfoul: string;
    readonly turnover: string;
    readonly turnoverTeam: string;
    readonly unturnover: string;
    readonly timeout: string;
    readonly untimeout: string;
    readonly sub: string;
    readonly subTeam: string;
    readonly lineup: string;
    readonly period: string;
    readonly other: string;
    /** A team's play whose team is not known, said without one. */
    readonly noTeam: {
      readonly score: string;
      readonly foul: string;
      readonly unfoul: string;
      readonly turnover: string;
      readonly unturnover: string;
      readonly timeout: string;
      readonly untimeout: string;
      readonly sub: string;
      readonly lineup: string;
    };
  };
};

/** Fills `{name}` in a text; a name with no value is left as it is. */
export function fill(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : whole,
  );
}

/** "Q3", "Half 2" or "OT1": a period past the game's own periods is overtime. */
export function periodName(words: GameWords, period: number, periods: 2 | 4): string {
  if (period > periods) return fill(words.periodOvertime, { number: period - periods });
  return fill(periods === 2 ? words.periodHalf : words.periodQuarter, { number: period });
}

/** "Q3 4:12". */
export function periodClockText(
  words: GameWords,
  period: number,
  periods: 2 | 4,
  remainingMs: number,
): string {
  return fill(words.periodClock, {
    period: periodName(words, period, periods),
    clock: formatClock(remainingMs),
  });
}

/** A player as the page shows them: "#7 Ada Lionel", "Ada Lionel", "#7", or null. */
export function playerText(
  words: GameWords,
  name: string | null,
  jersey: string | null,
): string | null {
  if (name !== null && jersey !== null) return fill(words.playerJersey, { name, jersey });
  if (name !== null) return fill(words.player, { name });
  if (jersey !== null) return fill(words.jerseyOnly, { jersey });
  return null;
}

/** What a play said, in the page's words: the facts every play line and message carry. */
export type PlayFacts = {
  readonly type:
    | LatestPlay['type']
    | 'lineup'
    | 'unfoul'
    | 'unturnover'
    | 'team-turnover'
    | 'team-unturnover'
    | 'untimeout';
  /** The team's name, or null for a play of neither team. */
  readonly team: string | null;
  /** The player as playerText gives it; null when hidden or when the play has none. */
  readonly player: string | null;
  readonly points: number | null;
  /** A substitution's players, when shown. */
  readonly playerIn?: string | null;
  readonly playerOut?: string | null;
  /** The period a "period" play starts, as periodName gives it. */
  readonly period?: string | null;
};

/** A team's play with no team known, said without one; null for any other play. */
function withoutTeam(words: GameWords, play: PlayFacts): string | null {
  const n = words.play.noTeam;
  switch (play.type) {
    case 'score':
      return fill(n.score, { points: play.points ?? '' });
    case 'foul':
      return n.foul;
    case 'unfoul':
      return n.unfoul;
    case 'turnover':
    case 'team-turnover':
      return n.turnover;
    case 'unturnover':
    case 'team-unturnover':
      return n.unturnover;
    case 'timeout':
      return n.timeout;
    case 'untimeout':
      return n.untimeout;
    case 'sub':
      return n.sub;
    case 'lineup':
      return n.lineup;
    default:
      return null;
  }
}

/** One play in a sentence. */
export function playSentence(words: GameWords, play: PlayFacts): string {
  const w = words.play;
  if (play.team === null) {
    const said = withoutTeam(words, play);
    if (said !== null) return said;
  }
  const team = play.team ?? '';
  const points = play.points ?? '';
  switch (play.type) {
    case 'score':
      return play.player === null
        ? fill(w.scoreTeam, { team, points })
        : fill(w.score, { team, points, player: play.player });
    case 'foul':
      return play.player === null
        ? fill(w.foulTeam, { team })
        : fill(w.foul, { team, player: play.player });
    case 'unfoul':
      return fill(w.unfoul, { team });
    case 'turnover':
    case 'team-turnover':
      return play.player === null
        ? fill(w.turnoverTeam, { team })
        : fill(w.turnover, { team, player: play.player });
    case 'unturnover':
    case 'team-unturnover':
      return fill(w.unturnover, { team });
    case 'timeout':
      return fill(w.timeout, { team });
    case 'untimeout':
      return fill(w.untimeout, { team });
    case 'sub': {
      const playerIn = play.playerIn ?? play.player ?? null;
      const playerOut = play.playerOut ?? null;
      return playerIn === null || playerOut === null
        ? fill(w.subTeam, { team })
        : fill(w.sub, { team, in: playerIn, out: playerOut });
    }
    case 'lineup':
      return fill(w.lineup, { team });
    case 'period':
      return play.period === undefined || play.period === null
        ? w.other
        : fill(w.period, { period: play.period });
    default:
      return w.other;
  }
}
