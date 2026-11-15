import { Group } from '@srleagues/ui';
import { displayLabels } from '@srleagues/site';
import { t } from '../../server/messages.ts';
import type { GameView, RoundView } from './build-schedule.ts';
import type { GameLinkWords } from './game-link-text.ts';
import { LiveGameList } from './live-game-list.tsx';

/** The words of a game card's link, braces and all, for the page to fill (game-link-text.ts). */
export function gameLinkWords(): GameLinkWords {
  const teams = { away: '{away}', home: '{home}' };
  return {
    score: t('schedule.link.score', {
      ...teams,
      state: '{state}',
      awayScore: '{awayScore}',
      homeScore: '{homeScore}',
    }),
    state: t('schedule.link.state', { ...teams, state: '{state}' }),
    when: t('schedule.link.when', { ...teams, when: '{when}' }),
    awaiting: t('schedule.link.awaiting', { ...teams, when: '{when}' }),
    states: {
      live: t('schedule.link.live'),
      final: t('schedule.link.final'),
      forfeit: t('schedule.link.forfeit'),
      postponed: t('schedule.link.postponed'),
      cancelled: t('schedule.link.cancelled'),
    },
  };
}

/**
 * A list of games as cards, kept up to date from the league's live channel. `layout`
 * draws them as scoreboards: `two` across where the list has the page's width, `one`
 * where it stands in a column of its own, and `featured` for the game being played now.
 */
export function GameList({
  leagueId,
  games,
  layout = 'rows',
  across = 'two',
  featured = false,
}: {
  readonly leagueId: string;
  readonly games: readonly GameView[];
  readonly layout?: 'rows' | 'board';
  readonly across?: 'one' | 'two';
  readonly featured?: boolean;
}) {
  return (
    <LiveGameList
      leagueId={leagueId}
      games={games}
      layout={layout}
      across={across}
      featured={featured}
      awaitingLabel={t('schedule.awaitingResult')}
      labels={displayLabels(t).game}
      linkWords={gameLinkWords()}
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
 * current one picked out. A finished round that still holds a postponed game says so
 * beside its mark and is open. Each is a plain disclosure, so it opens and closes without
 * any script.
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
          note={round.note}
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
