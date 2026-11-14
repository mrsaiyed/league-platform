import { Group } from '@srleagues/ui';
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
 * The rounds of a season: finished ones closed, the current and coming ones open, the
 * current one picked out. Each is a plain disclosure, so it opens and closes without any
 * script.
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
        <Group
          key={round.key}
          title={round.title}
          mark={round.phase === null ? undefined : t(`schedule.phase.${round.phase}`)}
          summary={round.summary}
          open={round.open}
          phase={round.phase ?? 'other'}
        >
          <GameList leagueId={leagueId} games={round.games} />
        </Group>
      ))}
    </>
  );
}
