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

function Side({ team, role }: { readonly team: ScoreboardTeam; readonly role: string }) {
  return (
    <div className="ui-scoreboard-side">
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
  return (
    <section className="ui-scoreboard" aria-label={labels.scoreboard} data-state={state}>
      <Side team={away} role={labels.away} />
      <div className="ui-scoreboard-middle">
        {state === 'live' ? <LiveMarker label={labels.live} /> : null}
        {state === 'final' ? <span className="ui-game-state">{labels.final}</span> : null}
        {periodText ? <span className="ui-scoreboard-period">{periodText}</span> : null}
      </div>
      <Side team={home} role={labels.home} />
    </section>
  );
}
