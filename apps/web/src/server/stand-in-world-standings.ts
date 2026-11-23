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
  levelDocument,
  type AccessReader,
  type DivisionRecord,
  type DivisionsStore,
  type LeaguesStore,
  type SettingPlace,
  type StandingsReadStore,
  type StandingsStore,
} from '@srleagues/core';
import { setStandInStatus, standInStatusVersion } from './stand-in-league-states.ts';
import { minorAt } from './stand-in-world-clock.ts';
import { newId } from './stand-in-world-ids.ts';
import { replacedAt } from './stand-in-world-rows.ts';
import type { LeagueWorld, SavedPlayerTotals, WorldDivision } from './stand-in-world-state.ts';
import type { Frozen, ReadWorld } from './stand-in-world.ts';

const decided = (status: string) => status === 'final' || status === 'forfeit';
const byId = <T extends { readonly id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

type GameOfTeams = {
  readonly seasonId: string;
  readonly binned: boolean;
  readonly status: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
};

/**
 * Whether a team is in its season's standings, as queries/list-table-teams.ts and
 * list-season-teams.ts read it: not in the bin, or in the bin with a final or forfeited
 * result in a game not in the bin, so its opponents keep those results (A-5, A-17).
 */
const inStandings = (
  games: readonly GameOfTeams[],
  team: { readonly id: string; readonly seasonId: string; readonly binned: boolean },
): boolean =>
  !team.binned ||
  games.some(
    (g) =>
      g.seasonId === team.seasonId &&
      !g.binned &&
      decided(g.status) &&
      (g.homeTeamId === team.id || g.awayTeamId === team.id),
  );

export function worldStandingsStore(s: LeagueWorld): StandingsStore {
  return {
    // The world runs one transaction at a time (stand-in-world.ts): nothing to hold.
    lockSeason: async () => undefined,
    // As queries/list-table-teams.ts: a team in the bin with a result in a game not in the
    // bin is still counted, so its opponents keep those wins and losses (A-5, A-17).
    listTeams: async (seasonId) =>
      s.teams
        .filter((t) => t.seasonId === seasonId && inStandings(s.games, t))
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
      // The other half of an overturned or awarded game goes with it (T-307).
      const pair = (a: (typeof s.adjustments)[number]) =>
        a.id === adjustmentId || a.pairedWith === adjustmentId || found.pairedWith === a.id;
      s.adjustments = s.adjustments.map((a) =>
        a.seasonId === seasonId && pair(a) ? { ...a, binned: true } : a,
      );
      return true;
    },
    listCoinFlips: async (seasonId) =>
      s.coinFlips
        .filter((f) => f.seasonId === seasonId && !f.binned)
        .sort(byId)
        .map(({ seasonId: _season, binned: _binned, ...flip }) => flip),
    addCoinFlip: async (seasonId, flip) => {
      const named = flip.teamIds.every((teamId) =>
        s.teams.some((t) => t.seasonId === seasonId && t.id === teamId),
      );
      if (!named || new Set(flip.teamIds).size !== flip.teamIds.length) {
        throw new Error('The database refuses a coin flip naming a team of another season.');
      }
      const id = newId();
      const recordedAt = new Date().toISOString();
      s.coinFlips = [...s.coinFlips, { id, seasonId, binned: false, recordedAt, ...flip }];
      return id;
    },
    binCoinFlip: async (seasonId, flipId) => {
      const found = s.coinFlips.some(
        (f) => f.id === flipId && f.seasonId === seasonId && !f.binned,
      );
      if (!found) return false;
      s.coinFlips = s.coinFlips.map((f) => (f.id === flipId ? { ...f, binned: true } : f));
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
    teamTurnoverGames: async (seasonId) => (await over()).teamTurnoverGames(seasonId),
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
      // As queries/list-season-teams.ts: a team in the bin with a result stays, marked.
      return (at()?.teams ?? [])
        .filter((t) => t.seasonId === seasonId && inStandings(at()?.games ?? [], t))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          color: t.color,
          divisionId: t.divisionId,
          statsVisibility: t.statsVisibility,
          removed: t.binned,
          left: t.left,
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
        // As the database keeps it (migration 0022): the one stored document.
        level: levelDocument(row.level),
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
      const finalGames = decidedGames(seasonId).filter((g) => g.status === 'final');
      const finals = new Set(finalGames.map((g) => g.id));
      /** The team's final score in the game, or null when it has none. */
      const scoreOf = (gameId: string, teamId: string): number | null => {
        const g = finalGames.find((x) => x.id === gameId);
        if (g === undefined) return null;
        if (g.homeTeamId === teamId) return g.homeScore;
        return g.awayTeamId === teamId ? g.awayScore : null;
      };
      const sums = new Map<string, { total: number; lines: number; games: Set<string> }>();
      for (const line of at()?.lines ?? []) {
        if (!finals.has(line.gameId) || !line.played) continue;
        for (const [key, value] of Object.entries(line.stats)) {
          if (!Number.isInteger(value) || value < 0) continue;
          const sum = sums.get(`${line.teamId}|${key}`) ?? {
            total: 0,
            lines: 0,
            games: new Set<string>(),
          };
          // A team's points are its final scores, over the same games (as
          // list-team-stat-totals.ts: S-26 as changed by step 2.196); added once a game.
          if (key !== 'points' || scoreOf(line.gameId, line.teamId) === null) sum.total += value;
          else if (!sum.games.has(line.gameId)) sum.total += scoreOf(line.gameId, line.teamId) ?? 0;
          sum.lines += value;
          sum.games.add(line.gameId);
          sums.set(`${line.teamId}|${key}`, sum);
        }
      }
      return [...sums.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([at, sum]) => {
          const [teamId = '', statKey = ''] = at.split('|');
          return {
            teamId,
            statKey,
            total: sum.total,
            linesTotal: sum.lines,
            gamesRecorded: sum.games.size,
          };
        });
    },
    // As list-team-turnover-games.ts counts them: in each final game, per side, the team
    // turnovers in the saved plays less those taken back, and whether a played line of
    // the team carries turnovers.
    teamTurnoverGames: async (seasonId) => {
      const finals = decidedGames(seasonId).filter((g) => g.status === 'final');
      const rows = finals.flatMap((g) => {
        const state = at()?.states.find((x) => x.gameId === g.id)?.state;
        const plays: unknown =
          typeof state === 'object' && state !== null
            ? (state as { plays?: unknown }).plays
            : undefined;
        if (!Array.isArray(plays)) return [];
        return (['home', 'away'] as const).flatMap((side) => {
          const teamId = side === 'home' ? g.homeTeamId : g.awayTeamId;
          const count = (type: string) =>
            plays.filter(
              (play: unknown) =>
                typeof play === 'object' &&
                play !== null &&
                (play as { type?: unknown }).type === type &&
                (play as { side?: unknown }).side === side,
            ).length;
          const turnovers = count('team-turnover') - count('team-unturnover');
          const countedByLines = (at()?.lines ?? []).some(
            (l) =>
              l.gameId === g.id &&
              l.teamId === teamId &&
              l.played &&
              typeof l.stats['turnovers'] === 'number',
          );
          return turnovers > 0 ? [{ gameId: g.id, teamId, turnovers, countedByLines }] : [];
        });
      });
      return rows.sort(
        (a, b) => a.gameId.localeCompare(b.gameId) || a.teamId.localeCompare(b.teamId),
      );
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
 * season through updateSeason, work here. Creating leagues and seasons and changing a
 * league's name or address have no screen on the stand-in yet: those parts fail by name
 * (createLeague, setLeagueName, renameShortName, createSeason, and the store's own
 * setCurrentSeason, which only createLeague calls). A league's state is real
 * (stand-in-league-states.ts, step 2.240). The divisions are the world's own rows, changed
 * as the database's divisions store changes them (step 2.49).
 * Publishing a site design has no screen yet either: the stand-in's made-up
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
    // Every made-up league was made with a contact email of its own (step 2.240).
    leagueContactEmail: async () => `${s.slug}@example.org`,
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
        : {
            id: s.leagueId,
            name: s.name,
            slug: s.slug,
            status: known,
            ownerAccountId,
            version: standInStatusVersion(s.leagueId),
          };
    },
    setName: notYet('leagues.setName'),
    createLeague: notYet('leagues.createLeague'),
    renameShortName: notYet('leagues.renameShortName'),
    // Publishing a made-up draft (step 2.240): the state is kept beside the cast's
    // (stand-in-league-states.ts), which the access reader and the address lookups read.
    setStatus: async (status, version) => setStandInStatus(s.leagueId, status, version),
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
  // As packages/database's divisions store (0007): a name differs from its siblings' not in
  // the bin, whatever the capitals; a change checks the version when one is given.
  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const record = (d: WorldDivision): DivisionRecord => ({
    id: d.id,
    seasonId: d.seasonId,
    parentDivisionId: d.parentDivisionId,
    name: d.name,
    color: d.color,
    sort: d.sort,
    binned: d.binned,
    version: d.version,
  });
  const nameTaken = (
    d: Pick<WorldDivision, 'seasonId' | 'parentDivisionId'>,
    name: string,
    except?: string,
  ) =>
    s.divisions.some(
      (x) =>
        x.id !== except &&
        !x.binned &&
        x.seasonId === d.seasonId &&
        x.parentDivisionId === d.parentDivisionId &&
        sameName(x.name, name),
    );
  const divisions: DivisionsStore = {
    find: async (divisionId) => {
      const found = s.divisions.find((d) => d.id === divisionId);
      return found === undefined ? undefined : record(found);
    },
    list: async (seasonId) =>
      s.divisions
        .filter((d) => d.seasonId === seasonId && !d.binned)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
        .map(record),
    create: async (division) => {
      if (nameTaken(division, division.name)) return 'name-taken';
      const id = newId();
      s.divisions = [...s.divisions, { id, ...division, binned: false, version: 1 }];
      return id;
    },
    update: async (divisionId, change, version) => {
      const at = s.divisions.findIndex((d) => d.id === divisionId);
      const found = s.divisions[at];
      if (found === undefined || found.binned) return undefined;
      if (version !== undefined && found.version !== version) return undefined;
      if (change.name !== undefined && nameTaken(found, change.name, divisionId))
        return 'name-taken';
      s.divisions = replacedAt(s.divisions, at, {
        ...found,
        ...change,
        version: found.version + 1,
      });
      return found.version + 1;
    },
    setBinned: async (divisionId, binned) => {
      const at = s.divisions.findIndex((d) => d.id === divisionId);
      const found = s.divisions[at];
      if (found === undefined) return false;
      if (!binned && nameTaken(found, found.name, divisionId)) return 'name-taken';
      s.divisions = replacedAt(s.divisions, at, { ...found, binned, version: found.version + 1 });
      return true;
    },
    hasLiveSubdivisions: async (divisionId) =>
      s.divisions.some((d) => d.parentDivisionId === divisionId && !d.binned),
    hasLiveTeams: async (divisionId) =>
      s.teams.some((t) => t.divisionId === divisionId && !t.binned),
  };
  return { leagues, divisions };
}
