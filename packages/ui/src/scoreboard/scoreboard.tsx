import type { CSSProperties, ReactNode } from 'react';
import { LiveMarker } from '../live-marker/live-marker.tsx';
import { safeColor } from '../team-color.ts';

export type ScoreboardTeam = {
  readonly name: string;
  /** Null for a game with no score to show: not started, postponed or cancelled. */
  readonly score: number | null;
  /** The team's own color, #rrggbb. */
  readonly color?: string | null | undefined;
};

export type ScoreboardLabels = {
  /** Names the whole region, for example "Scoreboard". */
  readonly scoreboard: string;
  readonly home: string;
  readonly away: string;
  readonly live: string;
  readonly final: string;
  /** Spoken next to the winning team, so the winner is not shown by colour alone. */
  readonly winner: string;
};

export type ScoreboardProps = {
  readonly home: ScoreboardTeam;
  readonly away: ScoreboardTeam;
  readonly state: 'live' | 'final' | 'other';
  /** The period and clock as the page wants them written, for example "Q3 4:12". */
  readonly periodText?: string | undefined;
  /**
   * The state in other words than "Final", already written by the page: "Forfeit" for a
   * game decided off the court, "Postponed" or "Cancelled" for one not played.
   */
  readonly stateText?: string | undefined;
  /** For a game still to play: its day and, when it has one, its time, between the teams. */
  readonly when?: { readonly day: string; readonly time?: string | undefined } | undefined;
  /** Where the game is played, already written by the page. */
  readonly placeText?: string | undefined;
  /** One sentence under the teams: "This game has not started yet." */
  readonly noteText?: string | undefined;
  readonly labels: ScoreboardLabels;
  /** More lines for the foot of the board: the team fouls and the latest play of a live game. */
  readonly children?: ReactNode;
};

function Side({
  team,
  role,
  isWinner,
  winnerLabel,
}: {
  readonly team: ScoreboardTeam;
  readonly role: string;
  readonly isWinner: boolean;
  readonly winnerLabel: string;
}) {
  const color = safeColor(team.color);
  return (
    <div
      className="ui-scoreboard-side"
      data-winner={isWinner ? 'true' : undefined}
      style={color ? ({ '--team-color': color } as CSSProperties) : undefined}
    >
      <span className="ui-scoreboard-role">{role}</span>
      <span className="ui-scoreboard-name">
        <span className="ui-team-chip" aria-hidden="true" />
        <span dir="auto">{team.name}</span>
      </span>
      {team.score === null ? null : <span className="ui-scoreboard-score">{team.score}</span>}
      {isWinner ? <span className="ui-visually-hidden">{winnerLabel}</span> : null}
    </div>
  );
}

/**
 * The big board of a game's page: each team with its color and its score, and between them
 * the state of the game (Live with the period and clock, Final, or when it will be
 * played); under them, quietly, where it is played and anything else the page has to say.
 */
export function Scoreboard({
  home,
  away,
  state,
  periodText,
  stateText,
  when,
  placeText,
  noteText,
  labels,
  children,
}: ScoreboardProps) {
  // Only a finished game has a winner; the highlight goes to that score alone.
  const decided = state === 'final' && home.score !== null && away.score !== null;
  const homeWins = decided && home.score > away.score;
  const awayWins = decided && away.score > home.score;
  const pill = stateText ?? (state === 'final' ? labels.final : undefined);
  return (
    <section className="ui-scoreboard" aria-label={labels.scoreboard} data-state={state}>
      <div className="ui-scoreboard-teams">
        <Side team={away} role={labels.away} isWinner={awayWins} winnerLabel={labels.winner} />
        <div className="ui-scoreboard-middle">
          {state === 'live' ? <LiveMarker label={labels.live} /> : null}
          {state !== 'live' && pill ? <span className="ui-game-state">{pill}</span> : null}
          {periodText ? <span className="ui-scoreboard-period">{periodText}</span> : null}
          {when ? (
            <span className="ui-scoreboard-when">
              <span className="ui-scoreboard-day">{when.day}</span>
              {when.time ? <span className="ui-scoreboard-time">{when.time}</span> : null}
            </span>
          ) : null}
        </div>
        <Side team={home} role={labels.home} isWinner={homeWins} winnerLabel={labels.winner} />
      </div>
      <div className="ui-scoreboard-foot">
        {placeText ? (
          <p className="ui-scoreboard-place" dir="auto">
            {placeText}
          </p>
        ) : null}
        {noteText ? <p className="ui-scoreboard-note">{noteText}</p> : null}
        {children}
      </div>
    </section>
  );
}
