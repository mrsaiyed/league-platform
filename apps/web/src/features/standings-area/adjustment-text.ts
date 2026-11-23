// An adjustment's changes in words, as the public table's footnote says them ("+1 win,
// -2 points"), from the same message keys (step 2.56).
import { t } from '../../server/messages.ts';

type Counts = {
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly points: number;
  readonly gamesPlayed?: number;
};

/** "Falcons 61–55 Badgers": a decided game, as the overturn choice and footnote name it. */
export const gameName = (
  g: {
    readonly homeTeamId: string;
    readonly awayTeamId: string;
    readonly homeScore: number;
    readonly awayScore: number;
  },
  nameOf: (teamId: string) => string,
): string =>
  t('adminStandings.overturn.game', {
    home: nameOf(g.homeTeamId),
    homeScore: String(g.homeScore),
    away: nameOf(g.awayTeamId),
    awayScore: String(g.awayScore),
  });

export function changesText(a: Counts): string {
  const part = (key: 'win' | 'loss' | 'tie' | 'point', amount: number): string[] =>
    amount === 0
      ? []
      : [t.plural(`standings.adjust.${key}`, Math.abs(amount), { sign: amount > 0 ? '+' : '-' })];
  return [
    ...part('win', a.wins),
    ...part('loss', a.losses),
    ...part('tie', a.ties),
    ...part('point', a.points),
    ...((a.gamesPlayed ?? 0) === 0 ? [] : [t('adminStandings.gamePlayed')]),
  ].join(t('standings.adjustmentJoin'));
}

/** "Rockets, -2 points": what a "Saved" line names. */
export const adjustmentWhat = (team: string, a: Counts): string =>
  t('adminStandings.what', { team, changes: changesText(a) });
