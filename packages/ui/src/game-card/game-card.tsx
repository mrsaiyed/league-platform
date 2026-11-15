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
};

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
}: {
  readonly team: GameCardTeam;
  readonly isWinner: boolean;
  readonly labels: GameCardLabels;
}) {
  const color = safeColor(team.color);
  return (
    <li
      className="ui-game-team"
      data-winner={isWinner ? 'true' : undefined}
      style={color ? ({ '--team-color': color } as CSSProperties) : undefined}
    >
      <span className="ui-team-chip" aria-hidden="true" />
      <span className="ui-game-team-name" dir="auto">
        {team.name}
      </span>
      {isWinner ? <span className="ui-visually-hidden">{labels.winner}</span> : null}
      <span className="ui-game-team-score">{team.score ?? ''}</span>
    </li>
  );
}

/**
 * A name too long for half of a narrow scoreboard: more than eighteen letters in all, or a
 * single word of more than ten. The two teams of such a game stand one over the other
 * where the card is narrow, each with the card's whole width for its name.
 */
export function isLongName(name: string): boolean {
  const letters = (text: string) => Array.from(text).length;
  return letters(name.trim()) > 18 || name.split(/\s+/).some((word) => letters(word) > 10);
}

/** One side of a scoreboard: the team's emblem over its name. */
function Side({
  team,
  isWinner,
  labels,
}: {
  readonly team: GameCardTeam;
  readonly isWinner: boolean;
  readonly labels: GameCardLabels;
}) {
  return (
    <div className="ui-game-side" data-winner={isWinner ? 'true' : undefined}>
      <Emblem name={team.name} color={team.color} />
      <span className="ui-game-team-name" dir="auto">
        {team.name}
      </span>
      {isWinner ? <span className="ui-visually-hidden">{labels.winner}</span> : null}
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
    // A game shows its score once it has one to show: while it is played and after.
    const scored =
      (status === 'live' || status === 'final' || status === 'forfeit') &&
      home.score !== null &&
      away.score !== null;
    return (
      <article
        className="ui-game-card"
        data-status={status}
        data-layout="board"
        data-featured={featured ? 'true' : undefined}
        data-names={isLongName(home.name) || isLongName(away.name) ? 'long' : undefined}
      >
        <header className="ui-game-meta">
          <span className="ui-game-about">
            {numberText ? <span className="ui-game-number">{numberText}</span> : null}
            <span className="ui-game-when">{whenText}</span>
          </span>
          {state}
        </header>
        <div className="ui-game-board">
          <Side team={away} isWinner={winner === 'away'} labels={labels} />
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
          <Side team={home} isWinner={winner === 'home'} labels={labels} />
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
        <Team team={away} isWinner={winner === 'away'} labels={labels} />
        <Team team={home} isWinner={winner === 'home'} labels={labels} />
      </ul>
      {link}
    </article>
  );
}
