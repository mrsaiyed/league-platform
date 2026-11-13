// The standings store and the part of the games store that gives it results, on plain
// data, for core's tests. The standings module's own tests and any other module's
// command that reads or writes standings through the same ports (the leagues module's
// rules change) use it, so none reaches into another module's files.
import type { PlayerSeasonTotals, StandingsRow } from '@srleagues/sports';
import type { GameLine, GameRecord } from '../../modules/games/index.ts';
import type {
  SeasonAdjustment,
  StandingsStore,
  StandingsTx,
  TableTeam,
} from '../../modules/standings/index.ts';

/** The data the standings and results stores read and write. */
export type StandingsData = {
  seasons: { id: string; programId: string; rules: unknown }[];
  teams: (TableTeam & { seasonId: string })[];
  games: GameRecord[];
  lines: GameLine[];
  adjustments: (SeasonAdjustment & { seasonId: string; binned?: boolean })[];
  /** Saved standings rows and player totals, by season. */
  rows: Record<string, StandingsRow[]>;
  totals: Record<string, PlayerSeasonTotals[]>;
  /** Seasons locked, in order. */
  locked: string[];
};

export type MemoryOptions = {
  /** Thrown from saving the standings rows, to see a failed recalculation roll back. */
  readonly failSaving?: Error;
};

type ReadGames = Pick<StandingsTx['games'], 'findSeason' | 'listDecided' | 'listDecidedLines'>;

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

export function standingsStores(
  s: StandingsData,
  options: MemoryOptions = {},
): { standings: StandingsStore; games: ReadGames } {
  const decidedOf = (season: string) =>
    s.games
      .filter((g) => g.seasonId === season && !g.binned && ['final', 'forfeit'].includes(g.status))
      .sort(byId);
  return {
    games: {
      listDecided: async (season) => decidedOf(season),
      listDecidedLines: async (season) => {
        const ids = new Set(decidedOf(season).map((g) => g.id));
        return s.lines.filter((l) => ids.has(l.gameId));
      },
      findSeason: async (id) => s.seasons.find((x) => x.id === id),
    },
    standings: {
      lockSeason: async (season) => void s.locked.push(season),
      listTeams: async (season) =>
        s.teams
          .filter((t) => t.seasonId === season)
          .map(({ teamId: id, divisionId: division }) => ({ teamId: id, divisionId: division }))
          .sort((a, b) => a.teamId.localeCompare(b.teamId)),
      listAdjustments: async (season) =>
        s.adjustments
          .filter((a) => a.seasonId === season && a.binned !== true)
          .map(({ seasonId: _season, binned: _binned, ...adjustment }) => adjustment)
          .sort(byId),
      addAdjustment: async (season, adjustment) => {
        if (!s.teams.some((t) => t.seasonId === season && t.teamId === adjustment.teamId)) {
          throw new Error('The database refuses an adjustment for a team of another season.');
        }
        const id = `01900000-0000-7000-8000-0000000e${String(s.adjustments.length + 1).padStart(4, '0')}`;
        const { accountId: _account, ...fields } = adjustment;
        s.adjustments.push({ id, seasonId: season, ...fields });
        return id;
      },
      binAdjustment: async (season, id) => {
        const found = s.adjustments.find(
          (a) => a.id === id && a.seasonId === season && a.binned !== true,
        );
        if (found === undefined) return false;
        found.binned = true;
        return true;
      },
      replaceRows: async (season, rows) => {
        if (options.failSaving !== undefined) throw options.failSaving;
        s.rows[season] = [...rows];
      },
      replaceTotals: async (season, totals) => {
        s.totals[season] = [...totals];
      },
    },
  };
}
