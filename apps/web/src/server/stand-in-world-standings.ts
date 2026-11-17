// THE STANDINGS AND SETTINGS OF THE ONE MADE-UP WORLD. FOR LOCAL WORK AND TESTS ONLY.
//
// The standings module's store and the public standings reads over one league's world
// (stand-in-world-state.ts), as packages/database's standings store and standings read
// store do over the same tables: the rows and player totals are the ones core's
// rebuildSeason saved from the results, never written by hand. And the leagues module's
// settings rows, the one place every area reads what League settings saved.
import {
  leagueStatuses,
  rulesOfGame,
  type AccessReader,
  type DivisionsStore,
  type LeaguesStore,
  type SettingPlace,
  type StandingsReadStore,
  type StandingsStore,
} from '@srleagues/core';
import { minorAt } from './stand-in-world-clock.ts';
import { newId } from './stand-in-world-ids.ts';
import { replacedAt } from './stand-in-world-rows.ts';
import type { LeagueWorld, SavedPlayerTotals } from './stand-in-world-state.ts';
import type { Frozen, ReadWorld } from './stand-in-world.ts';

const decided = (status: string) => status === 'final' || status === 'forfeit';
const byId = <T extends { readonly id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

export function worldStandingsStore(s: LeagueWorld): StandingsStore {
  return {
    // The world runs one transaction at a time (stand-in-world.ts): nothing to hold.
    lockSeason: async () => undefined,
    listTeams: async (seasonId) =>
      s.teams
        .filter((t) => t.seasonId === seasonId && !t.binned)
        .sort(byId)
        .map((t) => ({ teamId: t.id, divisionId: t.divisionId })),
    listAdjustments: async (seasonId) =>
      s.adjustments
        .filter((a) => a.seasonId === seasonId && !a.binned)
        .sort(byId)
        .map(({ seasonId: _season, binned: _binned, ...adjustment }) => adjustment),
    addAdjustment: async (seasonId, adjustment) => {
      if (!s.teams.some((t) => t.seasonId === seasonId && t.id === adjustment.teamId)) {
        throw new Error('The database refuses an adjustment for a team of another season.');
      }
      const id = newId();
      const { accountId: _account, ...fields } = adjustment;
      s.adjustments = [...s.adjustments, { id, seasonId, binned: false, ...fields }];
      return id;
    },
    binAdjustment: async (seasonId, adjustmentId) => {
      const at = s.adjustments.findIndex(
        (a) => a.id === adjustmentId && a.seasonId === seasonId && !a.binned,
      );
      const found = s.adjustments[at];
      if (found === undefined) return false;
      s.adjustments = replacedAt(s.adjustments, at, { ...found, binned: true });
      return true;
    },
    replaceRows: async (seasonId, rows) => {
      s.standingsRows = { ...s.standingsRows, [seasonId]: [...rows] };
    },
    replaceTotals: async (seasonId, totals) => {
      s.playerTotals = { ...s.playerTotals, [seasonId]: [...totals] };
    },
  };
}

/** The player totals as the database keeps them: a versioned document (migration 0010). */
const statsDocument = (totals: Frozen<SavedPlayerTotals>) => ({
  version: 1,
  teamIds: totals.teamIds,
  stats: Object.fromEntries(
    Object.entries(totals.stats).map(([key, stat]) => [
      key,
      { total: stat.total, gamesRecorded: stat.gamesRecorded },
    ]),
  ),
});

/**
 * The public standings and statistics reads of one league, each over its world as it
 * stands once the transactions before it have ended (standings-read-store.ts).
 */
export function worldStandingsRead(
  read: () => Promise<ReadWorld | undefined>,
  /** The world's one clock: the day a birth date is read against (R-28). */
  now: () => Date,
): StandingsReadStore {
  const over = async () => standingsReadOver(await read(), now());
  return {
    findSeason: async (seasonId) => (await over()).findSeason(seasonId),
    seasonStatKeys: async (seasonId) => (await over()).seasonStatKeys(seasonId),
    teams: async (seasonId) => (await over()).teams(seasonId),
    divisions: async (seasonId) => (await over()).divisions(seasonId),
    standingsRows: async (seasonId) => (await over()).standingsRows(seasonId),
    adjustments: async (seasonId) => (await over()).adjustments(seasonId),
    playerTotals: async (seasonId) => (await over()).playerTotals(seasonId),
    playerTeams: async (seasonId) => (await over()).playerTeams(seasonId),
    decidedGamesOf: async (seasonId, personIds) =>
      (await over()).decidedGamesOf(seasonId, personIds),
    decidedGames: async (seasonId) => (await over()).decidedGames(seasonId),
    teamStatTotals: async (seasonId) => (await over()).teamStatTotals(seasonId),
    people: async (personIds) => (await over()).people(personIds),
  };
}

/** The same reads over one fixed state of a league's world; undefined is a league with none. */
function standingsReadOver(s: ReadWorld | undefined, moment: Date): StandingsReadStore {
  const at = () => s;
  const decidedGames = (seasonId: string) =>
    (at()?.games ?? [])
      .filter((g) => g.seasonId === seasonId && !g.binned && decided(g.status))
      .sort(byId);
  const decidedLines = (seasonId: string) => {
    const ids = new Set(decidedGames(seasonId).map((g) => g.id));
    return (at()?.lines ?? [])
      .filter((l) => ids.has(l.gameId))
      .sort((a, b) => a.gameId.localeCompare(b.gameId) || a.personId.localeCompare(b.personId));
  };
  return {
    findSeason: async (seasonId) => {
      const found = at()?.seasons.find((x) => x.id === seasonId);
      return found === undefined
        ? undefined
        : { id: found.id, name: found.name, rules: found.rules };
    },
    seasonStatKeys: async (seasonId) => at()?.seasons.find((x) => x.id === seasonId)?.statKeys,
    teams: async (seasonId) => {
      const season = at()?.seasons.find((x) => x.id === seasonId);
      if (season === undefined || season.status === 'draft') return [];
      return (at()?.teams ?? [])
        .filter((t) => t.seasonId === seasonId && !t.binned)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          color: t.color,
          divisionId: t.divisionId,
          statsVisibility: t.statsVisibility,
        }));
    },
    divisions: async (seasonId) =>
      (at()?.divisions ?? [])
        .filter((d) => d.seasonId === seasonId && !d.binned)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map((d) => ({ id: d.id, name: d.name, color: null, sort: d.sort })),
    standingsRows: async (seasonId) =>
      (at()?.standingsRows[seasonId] ?? []).map((row) => ({
        teamId: row.teamId,
        divisionId: row.divisionId,
        rank: row.rank,
        seed: row.seed,
        gamesPlayed: row.gamesPlayed,
        wins: row.wins,
        losses: row.losses,
        ties: row.ties,
        pointsFor: row.pointsFor,
        pointsAgainst: row.pointsAgainst,
        standingsPoints: row.points,
        streakResult: row.streak?.result ?? null,
        streakLength: row.streak?.length ?? null,
        decidedBy: row.decidedBy,
      })),
    adjustments: async (seasonId) =>
      (at()?.adjustments ?? [])
        .filter((a) => a.seasonId === seasonId && !a.binned)
        .sort(byId)
        .map(({ seasonId: _season, binned: _binned, ...adjustment }) => adjustment),
    playerTotals: async (seasonId) =>
      (at()?.playerTotals[seasonId] ?? []).map((t) => ({
        personId: t.personId,
        gamesPlayed: t.gamesPlayed,
        secondsPlayed: t.seconds.total,
        secondsGames: t.seconds.gamesRecorded,
        stats: statsDocument(t),
      })),
    // Every team a person has a line in a decided game with, or a roster place on, in
    // the season (list-player-team-links.ts).
    playerTeams: async (seasonId) => {
      const teams = new Set(
        (at()?.teams ?? []).filter((t) => t.seasonId === seasonId).map((t) => t.id),
      );
      const links = [
        ...decidedLines(seasonId).map((l) => `${l.personId}|${l.teamId}`),
        ...(at()?.roster ?? [])
          .filter((r) => teams.has(r.teamId))
          .map((r) => `${r.personId}|${r.teamId}`),
      ];
      return [...new Set(links)].sort().map((link) => {
        const [personId = '', teamId = ''] = link.split('|');
        return { personId, teamId };
      });
    },
    decidedGamesOf: async (seasonId, personIds) => {
      const wanted = new Set(personIds);
      const lines = decidedLines(seasonId);
      return decidedGames(seasonId).map((game) => ({
        gameId: game.id,
        status: game.status,
        captureMode: game.captureMode,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        lines: lines
          .filter((l) => l.gameId === game.id && wanted.has(l.personId))
          .map((l) => ({
            teamId: l.teamId,
            personId: l.personId,
            played: l.played,
            secondsPlayed: l.secondsPlayed,
            stats: l.stats,
          })),
      }));
    },
    decidedGames: async (seasonId) =>
      decidedGames(seasonId).map((game) => ({
        gameId: game.id,
        status: game.status,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
      })),
    // Each team's total of each stat over its final games, from its players' lines that
    // entered the game (list-team-stat-totals.ts).
    teamStatTotals: async (seasonId) => {
      const finals = new Set(
        decidedGames(seasonId)
          .filter((g) => g.status === 'final')
          .map((g) => g.id),
      );
      const sums = new Map<string, { total: number; games: Set<string> }>();
      for (const line of at()?.lines ?? []) {
        if (!finals.has(line.gameId) || !line.played) continue;
        for (const [key, value] of Object.entries(line.stats)) {
          if (!Number.isInteger(value) || value < 0) continue;
          const sum = sums.get(`${line.teamId}|${key}`) ?? { total: 0, games: new Set<string>() };
          sum.total += value;
          sum.games.add(line.gameId);
          sums.set(`${line.teamId}|${key}`, sum);
        }
      }
      return [...sums.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([at, sum]) => {
          const [teamId = '', statKey = ''] = at.split('|');
          return { teamId, statKey, total: sum.total, gamesRecorded: sum.games.size };
        });
    },
    people: async (personIds) =>
      (at()?.people ?? [])
        .filter((p) => personIds.includes(p.id) && !p.binned)
        .sort(byId)
        .map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          // R-28: the birth date or the tick (list-people-for-display.ts).
          isMinor: minorAt(p, s?.timeZone ?? 'UTC', moment),
          visibility: p.visibility,
        })),
  };
}

/**
 * A part of a store the world has no rows for yet: it fails at once, by name, so a command
 * that reaches it fails loudly instead of being given a wrong answer.
 */
const notYet = (name: string) => async (): Promise<never> => {
  throw new Error(`Not on the stand-in yet: ${name}.`);
};

const samePlace = (a: SettingPlace, b: SettingPlace) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Whether a team of the season has a number worn by two players still on it, those waiting
 * for review left out: what the database checks when the unique-jersey rule is switched
 * on (check_season_unique_jerseys, 0015).
 */
function numberWornTwice(s: LeagueWorld, seasonId: string): boolean {
  const teams = new Set(s.teams.filter((t) => t.seasonId === seasonId).map((t) => t.id));
  const worn = new Set<string>();
  for (const r of s.roster) {
    if (!teams.has(r.teamId) || r.jerseyNumber === null || r.leftOn !== null || r.needsReview) {
      continue;
    }
    const key = `${r.teamId}|${r.jerseyNumber}`;
    if (worn.has(key)) return true;
    worn.add(key);
  }
  return false;
}

/**
 * The leagues module's stores over one league's world, as far as League settings and
 * Season settings use them: who the league is, its seasons' programs, its stored settings,
 * and a season read and changed (getSeason, updateSeason: step 2.182 shows and hides a
 * season through them; step 2.47 saves its name, dates and rules) as the database's
 * seasons table does it: the version is checked and raised, switching the unique-jersey
 * rule on is refused while a number is worn twice, and making a season current takes the
 * mark from its program's other current season, raising that one's version too. So the
 * setCurrentSeason, setSeasonRules and setSeasonRosterSettings commands, which change a
 * season through updateSeason, work here. Creating leagues, seasons and divisions and
 * changing a league's name, address or state have no screen on the stand-in yet: those
 * parts fail by name (createLeague, setLeagueName, renameShortName, setLeagueStatus,
 * createSeason, the store's own setCurrentSeason, which only createLeague calls, and every
 * division command). Publishing a site design has no screen yet either: the stand-in's made-up
 * leagues keep their designs as data (stand-in-league-sites.ts), so its two site parts fail
 * by name.
 */
export function worldLeaguesStores(
  s: LeagueWorld,
  access: AccessReader,
  /** The server's clock: the time a saved setting is stamped with. */
  now: () => Date,
): { readonly leagues: LeaguesStore; readonly divisions: DivisionsStore } {
  const leagues: LeaguesStore = {
    // Who plays in the league and whether anyone in it, not in the bin, is recorded as a
    // child, read from its own rows, so the Privacy settings say what the public pages do
    // (record 065; has-recorded-child.ts reads the people table the same way).
    leagueAudience: async () => s.audience,
    // R-28: a child by birth date or by the tick counts.
    hasRecordedChild: async () =>
      s.people.some((p) => !p.binned && minorAt(p, s.timeZone, now()) === true),
    // The permission check asks who the league is and whether it may be changed.
    currentLeague: async () => {
      const status = await access.leagueStatus();
      const ownerAccountId = await access.ownerAccountId();
      const known = leagueStatuses.find((candidate) => candidate === status);
      return known === undefined || ownerAccountId === undefined
        ? undefined
        : { id: s.leagueId, name: s.name, slug: s.slug, status: known, ownerAccountId, version: 1 };
    },
    setName: notYet('leagues.setName'),
    createLeague: notYet('leagues.createLeague'),
    renameShortName: notYet('leagues.renameShortName'),
    setStatus: notYet('leagues.setStatus'),
    createSeason: notYet('leagues.createSeason'),
    findSeason: async (seasonId) => {
      const found = s.seasons.find((x) => x.id === seasonId);
      return found === undefined
        ? undefined
        : {
            id: found.id,
            programId: found.programId,
            slug: found.slug,
            name: found.name,
            startsOn: found.startsOn,
            endsOn: found.endsOn,
            status: found.status,
            isCurrent: s.currentSeasonId === found.id,
            rules: found.rules,
            version: found.version,
          };
    },
    // The world's leagues have one program each, named on their seasons.
    programCount: async () => new Set(s.seasons.map((x) => x.programId)).size,
    updateSeason: async (seasonId, change, version) => {
      const at = s.seasons.findIndex((x) => x.id === seasonId);
      const found = s.seasons[at];
      if (found === undefined || found.version !== version) return undefined;
      // Saving rules (step 2.47): as the database (0008, 0015), switching the unique-jersey
      // rule on is refused while a team of the season has a number worn twice by players
      // still on it, leaving out those waiting for review (S-44).
      if (
        change.rules?.rosters.uniqueJerseys === true &&
        !rulesOfGame(null, found.rules).rosters.uniqueJerseys &&
        numberWornTwice(s, seasonId)
      ) {
        return 'unique-jerseys-clash';
      }
      const { isCurrent, ...fields } = change;
      if (isCurrent === true) {
        // As the database: the mark leaves the other current season of the same program,
        // whose row is changed and so gets a new version too (0002). The world keeps one
        // current season for the league, which holds while its seasons share one program,
        // as every made-up league's do: a second program's current season is refused.
        const other = s.seasons.findIndex((x) => x.id === s.currentSeasonId && x.id !== seasonId);
        const losing = s.seasons[other];
        if (losing !== undefined && losing.programId !== found.programId) {
          return notYet('leagues.updateSeason current seasons of two programs')();
        }
        if (losing !== undefined) {
          s.seasons = replacedAt(s.seasons, other, { ...losing, version: losing.version + 1 });
        }
        s.currentSeasonId = seasonId;
      }
      if (isCurrent === false && s.currentSeasonId === seasonId) s.currentSeasonId = null;
      s.seasons = replacedAt(s.seasons, at, { ...found, ...fields, version: version + 1 });
      return version + 1;
    },
    setCurrentSeason: notYet('leagues.setCurrentSeason'),
    latestSiteReleaseNumber: notYet('leagues.latestSiteReleaseNumber'),
    publishSiteRelease: notYet('leagues.publishSiteRelease'),
    isPlatformStaff: async () => false,
    settingRows: async (key, places) =>
      s.settings
        .filter(
          (r) =>
            r.key === key &&
            (r.place.level === 'league' ||
              (r.place.level === 'program' && r.place.programId === places.programId) ||
              (r.place.level === 'season' && r.place.seasonId === places.seasonId)),
        )
        .map((r) => ({
          level: r.place.level,
          document: r.document,
          version: r.version,
          savedAt: r.savedAt,
        })),
    writeSetting: async (place, key, document, version) => {
      const savedAt = now().toISOString();
      const at = s.settings.findIndex((r) => r.key === key && samePlace(r.place, place));
      const row = s.settings[at];
      if (row === undefined) {
        if (version !== null) return undefined;
        s.settings = [...s.settings, { place, key, document, version: 1, savedAt }];
        return 1;
      }
      if (row.version !== version) return undefined;
      s.settings = replacedAt(s.settings, at, {
        ...row,
        document,
        version: row.version + 1,
        savedAt,
      });
      return row.version + 1;
    },
    clearSetting: async (place, key, version) => {
      const before = s.settings.length;
      s.settings = s.settings.filter(
        (r) => !(r.key === key && samePlace(r.place, place) && r.version === version),
      );
      return s.settings.length < before;
    },
    findProgram: async (programId) => {
      const known = s.seasons.find((x) => programId === undefined || x.programId === programId);
      return known === undefined ? undefined : { id: known.programId };
    },
    seasonProgramId: async (seasonId) => s.seasons.find((x) => x.id === seasonId)?.programId,
  };
  const divisions: DivisionsStore = {
    find: notYet('divisions.find'),
    list: notYet('divisions.list'),
    create: notYet('divisions.create'),
    update: notYet('divisions.update'),
    setBinned: notYet('divisions.setBinned'),
    hasLiveSubdivisions: notYet('divisions.hasLiveSubdivisions'),
    hasLiveTeams: notYet('divisions.hasLiveTeams'),
  };
  return { leagues, divisions };
}
