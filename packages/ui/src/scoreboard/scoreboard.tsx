import { LiveMarker } from '../live-marker/live-marker.tsx';

export type ScoreboardTeam = { readonly name: string; readonly score: number };

export type ScoreboardLabels = {
  /** Names the whole region, for example "Scoreboard". */
  readonly scoreboard: string;
  readonly home: string;
  readonly away: string;
  readonly live: string;
  readonly final: string;
};

export type ScoreboardProps = {
  readonly home: ScoreboardTeam;
  readonly away: ScoreboardTeam;
  readonly state: 'live' | 'final' | 'other';
  /** The period and clock as the page wants them written, for example "Q3 4:12". */
  readonly periodText?: string;
  readonly labels: ScoreboardLabels;
};

function Side({
  team,
  role,
  isWinner,
}: {
  readonly team: ScoreboardTeam;
  readonly role: string;
  readonly isWinner: boolean;
}) {
  return (
    <div className="ui-scoreboard-side" data-winner={isWinner ? 'true' : undefined}>
      <span className="ui-scoreboard-role">{role}</span>
      <span className="ui-scoreboard-name" dir="auto">
        {team.name}
      </span>
      <span className="ui-scoreboard-score">{team.score}</span>
    </div>
  );
}

/** The big score for a game page: both teams, the period and clock, and the state. */
export function Scoreboard({ home, away, state, periodText, labels }: ScoreboardProps) {
  // Only a finished game has a winner; the highlight goes to that score alone.
  const homeWins = state === 'final' && home.score > away.score;
  const awayWins = state === 'final' && away.score > home.score;
  return (
    <section className="ui-scoreboard" aria-label={labels.scoreboard} data-state={state}>
      <Side team={away} role={labels.away} isWinner={awayWins} />
      <div className="ui-scoreboard-middle">
        {state === 'live' ? <LiveMarker label={labels.live} /> : null}
        {state === 'final' ? <span className="ui-game-state">{labels.final}</span> : null}
        {periodText ? <span className="ui-scoreboard-period">{periodText}</span> : null}
      </div>
      <Side team={home} role={labels.home} isWinner={homeWins} />
    </section>
  );
}
