import { displayLabels } from '@srleagues/site';
import { t } from '../../server/messages.ts';
import type { GameView, RoundView } from './build-schedule.ts';
import { LiveGameList } from './live-game-list.tsx';

/** A list of games as cards, kept up to date from the league's live channel. */
export function GameList({
  leagueId,
  games,
}: {
  readonly leagueId: string;
  readonly games: readonly GameView[];
}) {
  return (
    <LiveGameList
      leagueId={leagueId}
      games={games}
      labels={displayLabels(t).game}
      announcement={t('schedule.liveAnnouncement', {
        away: '{away}',
        awayScore: '{awayScore}',
        home: '{home}',
        homeScore: '{homeScore}',
        status: '{status}',
      })}
    />
  );
}

/**
 * The rounds of a season: finished ones closed, the current and coming ones open. A plain
 * disclosure, so it opens and closes without any script.
 */
export function RoundSections({
  leagueId,
  rounds,
}: {
  readonly leagueId: string;
  readonly rounds: readonly RoundView[];
}) {
  return (
    <>
      {rounds.map((round) => (
        <details key={round.key} open={round.open} data-phase={round.phase ?? 'other'}>
          <summary>
            <h2>{round.title}</h2>
            {round.phase === null ? null : <span>{t(`schedule.phase.${round.phase}`)}</span>}{' '}
            <span>{round.summary}</span>
          </summary>
          <GameList leagueId={leagueId} games={round.games} />
        </details>
      ))}
    </>
  );
}
