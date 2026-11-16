import type { CSSProperties, ReactNode } from 'react';
import { Emblem } from '../emblem/emblem.tsx';
import { LiveMarker } from '../live-marker/live-marker.tsx';
import { safeColor } from '../team-color.ts';

export type GameStatus = 'scheduled' | 'live' | 'final' | 'forfeit' | 'postponed' | 'cancelled';

export type GameCardTeam = {
  readonly name: string;
  /** Null until the team has a score to show. */
  readonly score: number | null;
  /** The team's own color, #rrggbb. */
  readonly color?: string | null;
};

export type GameCardLabels = {
  readonly live: string;
  readonly final: string;
  readonly forfeit: string;
  readonly postponed: string;
  readonly cancelled: string;
  readonly versus: string;
  /** Spoken next to the winning team, so the winner is not shown by style alone. */
  readonly winner: string;
  readonly viewBoxScore: string;
};

export type GameCardProps = {
  readonly home: GameCardTeam;
  readonly away: GameCardTeam;
  readonly status: GameStatus;
  /** The date and time, already written for the reader by the page. */
  readonly whenText: string;
  /** Where it is played, already written by the page; drawn on a line of its own. */
  readonly placeText?: string;
  /** For example "Game 4", already written by the page. */
  readonly numberText?: string;
  /** The game's own page, which the whole card leads to. The page builds it with the address helper. */
  readonly detailsHref?: string;
  /**
   * What the card's link says to a screen reader, whole and already written by the page:
   * "Herons against Falcons, live, 38 to 41". Left out, it says "view box score" and both
   * teams' names.
   */
  readonly linkText?: string | undefined;
  readonly labels: GameCardLabels;
  /**
   * `rows` (the default) is the compact card: each team on its own row. `board` is the
   * scoreboard: an emblem and a name on each side, and the score or "VS" large between
   * them (docs/build/DESIGN.md, section 4, lines 10 and 27).
   */
  readonly layout?: 'rows' | 'board';
  /**
   * A quiet word about a game still marked to be played, already written by the page:
   * "Awaiting result" for one whose start has passed. Drawn where a state's pill would be.
   */
  readonly note?: string | undefined;
  /** A board picked out from the others: the game being played now. Larger figures. */
  readonly featured?: boolean;
  /**
   * What stands before a team's name on the compact card (`rows`): a small chip of its
   * color (the default), or its small shield with its initial (`emblem`), as in a table.
   */
  readonly marks?: 'chip' | 'emblem';
  /**
   * The room every board of the same list reckons with (`listRoom`), so that all of them
   * are drawn the same way: side by side, or all as two rows. Left out, a board reckons
   * with its own two names and its own score.
   */
  readonly room?: BoardRoom | undefined;
};

/** What a board's sum of the width its teams need side by side is made from. */
export type BoardRoom = {
  /** The letters the longest name needs (`nameMeasure`). */
  readonly letters: number;
  /** The figures of the longest score; none where no game has a score to show. */
  readonly figures?: number | undefined;
};

/** A game shows its score once it has one to show: while it is played and after. */
const hasScore = (game: {
  readonly status: GameStatus;
  readonly home: GameCardTeam;
  readonly away: GameCardTeam;
}): boolean =>
  (game.status === 'live' || game.status === 'final' || game.status === 'forfeit') &&
  game.home.score !== null &&
  game.away.score !== null;

/**
 * The room the boards of one list need: the longest of all their names, and the longest
 * of their scores. Given to every board of the list, it makes them all decide alike
 * between side by side and two rows, so a list is one shape from top to bottom.
 */
export function listRoom(
  games: readonly {
    readonly status: GameStatus;
    readonly home: GameCardTeam;
    readonly away: GameCardTeam;
  }[],
): BoardRoom {
  const letters = Math.max(
    0,
    ...games.map((game) => Math.max(nameMeasure(game.home.name), nameMeasure(game.away.name))),
  );
  const figures = games
    .filter(hasScore)
    .map((game) => `${game.away.score}${game.home.score}`.length);
  return figures.length === 0 ? { letters } : { letters, figures: Math.max(...figures) };
}

const statusKey = {
  final: 'final',
  forfeit: 'forfeit',
  postponed: 'postponed',
  cancelled: 'cancelled',
} as const;

/** The team with the higher score of a finished game; none when level or not finished. */
export function winnerOf(
  status: GameStatus,
  home: GameCardTeam,
  away: GameCardTeam,
): 'home' | 'away' | null {
  if (status !== 'final' && status !== 'forfeit') return null;
  if (home.score === null || away.score === null || home.score === away.score) return null;
  return home.score > away.score ? 'home' : 'away';
}

function Team({
  team,
  isWinner,
  labels,
  marks,
}: {
  readonly team: GameCardTeam;
  readonly isWinner: boolean;
  readonly labels: GameCardLabels;
  readonly marks: 'chip' | 'emblem';
}) {
  const color = safeColor(team.color);
  return (
    <li
      className="ui-game-team"
      data-winner={isWinner ? 'true' : undefined}
      style={color ? ({ '--team-color': color } as CSSProperties) : undefined}
    >
      {marks === 'emblem' ? (
        <Emblem name={team.name} color={team.color} size="small" />
      ) : (
        <span className="ui-team-chip" aria-hidden="true" />
      )}
      <span className="ui-game-team-name" dir="auto">
        {team.name}
      </span>
      {isWinner ? <span className="ui-visually-hidden">{labels.winner}</span> : null}
      <span className="ui-game-team-score">{team.score ?? ''}</span>
    </li>
  );
}

/**
 * A letter drawn about twice as wide as a Latin one: Chinese, Japanese, Korean (with the
 * marks only those scripts use, like the long-vowel line), a picture, a full-width form.
 */
const wideLetter =
  /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{Extended_Pictographic}！-｠￠-￦]/u;
/** A mark that sits on the letter before it and takes no room of its own. */
const noRoom = /[\p{M}‍︎️]/u;

/**
 * The width of a piece of text counted in Latin letters, whatever script it is written
 * in: a wide letter counts as two, a mark that sits on another letter as none.
 */
export function lettersWide(text: string): number {
  let count = 0;
  for (const letter of text) count += noRoom.test(letter) ? 0 : wideLetter.test(letter) ? 2 : 1;
  return count;
}

/**
 * How many letters wide a side of a scoreboard must be for a name to sit there on two
 * lines and no more: the longer line of the name's best break into two. A name breaks
 * only between its words, so that is not always half of it ("North Side Hawks" breaks
 * into 10 and 5, or 5 and 10, never 8 and 8), and a name of one word needs the whole word.
 * The board gives each side room for the longer of its two names and, where the card is
 * too narrow for that, stands the teams one over the other (the stylesheet does the sum,
 * from this number and the face's letter width).
 */
export function nameMeasure(name: string): number {
  const words = name.trim().split(/\s+/).filter(Boolean).map(lettersWide);
  // The whole name on one line: its words and the spaces between them.
  const whole = words.reduce((sum, word) => sum + word, 0) + Math.max(0, words.length - 1);
  let best = whole;
  // The first line as it grows by a word at a time; the second is what is left.
  let first = -1;
  for (const word of words.slice(0, -1)) {
    first += word + 1;
    best = Math.min(best, Math.max(first, whole - first - 1));
  }
  return best;
}

/** One side of a scoreboard: the team's emblem and its name, and its own score. */
function Side({
  team,
  isWinner,
  scored,
  labels,
}: {
  readonly team: GameCardTeam;
  readonly isWinner: boolean;
  /** The game has a score to show: this side carries its own, for the stacked board. */
  readonly scored: boolean;
  readonly labels: GameCardLabels;
}) {
  return (
    <div className="ui-game-side" data-winner={isWinner ? 'true' : undefined}>
      <span className="ui-game-side-team">
        <Emblem name={team.name} color={team.color} />
        <span className="ui-game-team-name" dir="auto">
          {team.name}
        </span>
      </span>
      {isWinner ? <span className="ui-visually-hidden">{labels.winner}</span> : null}
      {/* Drawn only where the two teams stand one over the other, each then with its own
          score at the end of its row. The score between the teams is the one a screen
          reader is given, so this one is kept from it. */}
      {scored ? (
        <span className="ui-game-side-score" aria-hidden="true">
          {team.score}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One game as a card. A quiet line says which game and when, with its state as a small
 * pill. Then the teams: as a scoreboard (`board`), an emblem and a name on each side with
 * the score or "VS" large between them and the place on a quiet line beneath; or compact
 * (`rows`), each team on its own row with its score at the end. A card with somewhere to
 * go is one link, whole: the link's words are kept for screen readers and not drawn.
 */
export function GameCard({
  home,
  away,
  status,
  whenText,
  placeText,
  numberText,
  detailsHref,
  linkText,
  labels,
  layout = 'rows',
  note,
  featured = false,
  marks = 'chip',
  room,
}: GameCardProps) {
  const winner = winnerOf(status, home, away);
  let state: ReactNode = null;
  if (status === 'live') state = <LiveMarker label={labels.live} />;
  else if (status !== 'scheduled')
    state = <span className="ui-game-state">{labels[statusKey[status]]}</span>;
  else if (note)
    state = (
      <span className="ui-game-state" data-kind="quiet">
        {note}
      </span>
    );
  const link = detailsHref ? (
    <a className="ui-game-link" href={detailsHref}>
      {linkText ? (
        <span dir="auto">{linkText}</span>
      ) : (
        <>
          {labels.viewBoxScore}{' '}
          <span className="ui-visually-hidden" dir="auto">
            {away.name} {labels.versus} {home.name}
          </span>
        </>
      )}
    </a>
  ) : null;
  if (layout === 'board') {
    const scored = hasScore({ status, home, away });
    // The sum is made from the list's room where the list gave one, else from this game.
    const letters = room?.letters ?? Math.max(nameMeasure(home.name), nameMeasure(away.name));
    const figures =
      room === undefined
        ? scored
          ? `${away.score}${home.score}`.length
          : undefined
        : room.figures;
    return (
      <article
        className="ui-game-card"
        data-status={status}
        data-layout="board"
        data-featured={featured ? 'true' : undefined}
      >
        <header className="ui-game-meta">
          <span className="ui-game-about">
            {numberText ? <span className="ui-game-number">{numberText}</span> : null}
            <span className="ui-game-when">{whenText}</span>
          </span>
          {state}
        </header>
        {/* The card's middle part. It, and the top line, are the measures the card's pieces
            size themselves by (the stylesheet): the card itself is left free to share the
            heights of its three parts with the cards beside it. */}
        <div className="ui-game-body">
          <div
            className="ui-game-board"
            data-scored={scored ? 'true' : undefined}
            data-room={!scored && figures !== undefined ? 'scored' : undefined}
            style={
              {
                '--letters': letters,
                ...(figures === undefined ? {} : { '--figures': figures }),
              } as CSSProperties
            }
          >
            <Side team={away} isWinner={winner === 'away'} scored={scored} labels={labels} />
            <div className="ui-game-middle">
              {scored ? (
                <p className="ui-game-score">
                  <span data-winner={winner === 'away' ? 'true' : undefined}>{away.score}</span>
                  <span className="ui-game-score-colon" aria-hidden="true">
                    :
                  </span>{' '}
                  <span data-winner={winner === 'home' ? 'true' : undefined}>{home.score}</span>
                </p>
              ) : (
                <p className="ui-game-versus">{labels.versus}</p>
              )}
            </div>
            <Side team={home} isWinner={winner === 'home'} scored={scored} labels={labels} />
          </div>
        </div>
        {placeText ? (
          <footer className="ui-game-foot">
            <span className="ui-game-place" dir="auto">
              {placeText}
            </span>
          </footer>
        ) : null}
        {link}
      </article>
    );
  }
  return (
    <article className="ui-game-card" data-status={status}>
      <header className="ui-game-meta">
        <span className="ui-game-about">
          {numberText ? <span className="ui-game-number">{numberText}</span> : null}
          <span className="ui-game-when">{whenText}</span>
        </span>
        {state}
        {placeText ? (
          <span className="ui-game-place" dir="auto">
            {placeText}
          </span>
        ) : null}
      </header>
      <ul className="ui-game-teams">
        <Team team={away} isWinner={winner === 'away'} labels={labels} marks={marks} />
        <Team team={home} isWinner={winner === 'home'} labels={labels} marks={marks} />
      </ul>
      {link}
    </article>
  );
}
