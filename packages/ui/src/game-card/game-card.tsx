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
      <span className="ui-game-team-name" dir="auto">
        {team.name}
      </span>
      {isWinner ? <span className="ui-visually-hidden">{labels.winner}</span> : null}
      <span className="ui-game-team-score">{team.score ?? ''}</span>
    </li>
  );
}

/** One game: both teams, the score once there is one, when it is, and its state. */
export function GameCard({
  home,
  away,
  status,
  whenText,
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
        {numberText ? <span className="ui-game-number">{numberText}</span> : null}
        <span className="ui-game-when">{whenText}</span>
        {state}
      </header>
      <ul className="ui-game-teams">
        <Team team={away} isWinner={winner === 'away'} labels={labels} />
        <li className="ui-game-versus" aria-hidden="true">
          {labels.versus}
        </li>
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
