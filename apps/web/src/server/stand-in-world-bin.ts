// The made-up world's bin, as far as a screen uses it (step 2.50, step 2.77): what is in
// the bin (teams, people and games: the kinds the bin screen brings back), finding each
// and bringing it back, with the same refusals as the database's store (packages/database,
// bin-store.ts). Divisions, venues and courts are put back from their own screens' notices
// and are not listed here; the nightly purge is not on the stand-in and says so if asked.
// A row was only marked, never changed, so whatever comes back comes back as it was.
//
// The stand-in keeps no moment of removal, so a thing's moment is the first time the bin
// is read with it there: enough for "newest first" and the 30 days, never shown as a fact.
import type { BinnedItem, BinStore } from '@srleagues/core';
import { replacedAt } from './stand-in-world-rows.ts';
import type { LeagueWorld } from './stand-in-world-state.ts';

const notYet = (name: string) => async (): Promise<never> => {
  throw new Error(`Not on the stand-in yet: ${name}.`);
};

const played = ['final', 'forfeit'];
const toCome = ['scheduled', 'postponed', 'live'];
const neverPlayed = ['scheduled', 'postponed', 'cancelled'];

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function worldBinStore(s: LeagueWorld): BinStore {
  const seenAt = new Map<string, string>();
  const binnedAt = (id: string) => {
    const at = seenAt.get(id) ?? new Date().toISOString();
    seenAt.set(id, at);
    return at;
  };
  const teamName = (id: string) => s.teams.find((t) => t.id === id)?.name ?? '';
  const gamePartInBin = (game: LeagueWorld['games'][number]) =>
    s.teams.some((t) => t.binned && (t.id === game.homeTeamId || t.id === game.awayTeamId)) ||
    s.divisions.some((d) => d.binned && d.id === game.divisionId) ||
    s.venues.some((v) => v.binned && v.id === game.venueId) ||
    s.courts.some((c) => c.binned && c.id === game.courtId);
  return {
    list: async () => {
      const teams: BinnedItem[] = s.teams
        .filter((t) => t.binned)
        .map((t) => {
          const games = s.games.filter(
            (g) => !g.binned && (g.homeTeamId === t.id || g.awayTeamId === t.id),
          );
          const offTheList = new Set(s.people.filter((p) => p.binned).map((p) => p.id));
          return {
            kind: 'team',
            id: t.id,
            name: t.name,
            secondName: null,
            seasonId: t.seasonId,
            binnedAt: binnedAt(t.id),
            kept: games.length > 0,
            details: {
              gamesPlayed: games.filter((g) => played.includes(g.status)).length,
              gamesToCome: games.filter((g) => toCome.includes(g.status)).length,
              rosterInBin: s.roster
                .filter((r) => r.teamId === t.id && r.leftOn === null && offTheList.has(r.personId))
                .map((r) => r.personId),
            },
          };
        });
      const people: BinnedItem[] = s.people
        .filter((p) => p.binned)
        .map((p) => ({
          kind: 'person',
          id: p.id,
          name: `${p.firstName} ${p.lastName}`.trim(),
          secondName: null,
          seasonId: null,
          binnedAt: binnedAt(p.id),
          kept: s.roster.some((r) => r.personId === p.id),
        }));
      const games: BinnedItem[] = s.games
        .filter((g) => g.binned && neverPlayed.includes(g.status))
        .map((g) => ({
          kind: 'game',
          id: g.id,
          name: teamName(g.homeTeamId),
          secondName: teamName(g.awayTeamId),
          seasonId: g.seasonId,
          binnedAt: binnedAt(g.id),
          kept: true,
          details: { startsAt: g.startsAt, withoutRound: g.roundId === null },
        }));
      return [...teams, ...people, ...games].sort(
        (a, b) => b.binnedAt.localeCompare(a.binnedAt) || a.id.localeCompare(b.id),
      );
    },
    seasonProgramId: async (seasonId) => s.seasons.find((x) => x.id === seasonId)?.programId,
    findTeam: async (teamId) => {
      const team = s.teams.find((t) => t.id === teamId);
      if (team === undefined) return undefined;
      return {
        seasonId: team.seasonId,
        binned: team.binned,
        divisionInBin: s.divisions.some((d) => d.binned && d.id === team.divisionId),
      };
    },
    findPerson: async (personId) => {
      const found = s.people.find((p) => p.id === personId);
      return found === undefined ? undefined : { binned: found.binned };
    },
    findGame: async (gameId) => {
      const game = s.games.find((g) => g.id === gameId);
      if (game === undefined) return undefined;
      return {
        seasonId: game.seasonId,
        binned: game.binned,
        status: game.status,
        partInBin: gamePartInBin(game),
      };
    },
    restoreTeam: async (teamId) => {
      const at = s.teams.findIndex((t) => t.id === teamId);
      const team = s.teams[at];
      if (team === undefined) return false;
      if (!team.binned) return true;
      const others = s.teams.filter((t) => !t.binned && t.seasonId === team.seasonId);
      if (others.some((t) => same(t.slug, team.slug))) return 'short-name-taken';
      if (others.some((t) => same(t.name, team.name))) return 'name-taken';
      if (others.some((t) => t.lineageId === team.lineageId)) return 'lineage-taken';
      s.teams = replacedAt(s.teams, at, { ...team, binned: false, version: team.version + 1 });
      return true;
    },
    restorePerson: async (personId) => {
      const at = s.people.findIndex((p) => p.id === personId);
      const found = s.people[at];
      if (found === undefined) return false;
      if (found.binned) {
        s.people = replacedAt(s.people, at, {
          ...found,
          binned: false,
          version: found.version + 1,
        });
      }
      return true;
    },
    restoreGame: async (gameId) => {
      const at = s.games.findIndex((g) => g.id === gameId);
      const game = s.games[at];
      if (game === undefined || !game.binned || !neverPlayed.includes(game.status)) return false;
      const taken = s.games.some(
        (g) =>
          !g.binned &&
          g.seasonId === game.seasonId &&
          g.number !== null &&
          g.number === game.number,
      );
      if (taken) return 'game-number-taken';
      s.games = replacedAt(s.games, at, { ...game, binned: false });
      return true;
    },
    purge: notYet('bin.purge'),
  };
}
