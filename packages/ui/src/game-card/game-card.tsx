import type { CSSProperties, ReactNode } from 'react';
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
  /** Where "view box score" goes. The page builds it with the address helper. */
  readonly detailsHref?: string;
  readonly labels: GameCardLabels;
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
 * One game as a compact card: a quiet line saying when, with its state as a small pill, and
 * where on the line under it; then each team on its own row, its color and name at the start and its score at the
 * end. A card with somewhere to go is one link, whole: the link's words are kept for screen
 * readers and not drawn.
 */
export function GameCard({
  home,
  away,
  status,
  whenText,
  placeText,
  numberText,
  detailsHref,
  labels,
}: GameCardProps) {
  const winner = winnerOf(status, home, away);
  let state: ReactNode = null;
  if (status === 'live') state = <LiveMarker label={labels.live} />;
  else if (status !== 'scheduled')
    state = <span className="ui-game-state">{labels[statusKey[status]]}</span>;
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
      {detailsHref ? (
        <a className="ui-game-link" href={detailsHref}>
          {labels.viewBoxScore}{' '}
          <span className="ui-visually-hidden" dir="auto">
            {away.name} {labels.versus} {home.name}
          </span>
        </a>
      ) : null}
    </article>
  );
}
