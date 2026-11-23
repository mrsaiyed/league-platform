// WHAT THE PUBLIC PAGES READ OF THE ONE MADE-UP WORLD. FOR LOCAL WORK AND TESTS ONLY.
//
// The public reads over a league's world as it stands when each read is made, as the
// database's public queries read the same tables (step 2.39: list-public-schedule.ts,
// list-public-games.ts, list-public-roster.ts, list-public-seasons.ts, games-read-store.ts):
// only published games of a season the public may see, teams by name and color, and
// people only through the one name function (T-81). Nothing here changes the world.
import {
  correctedMarkDate,
  lookupSetting,
  membersStartPage,
  minimumGamesToRank,
  placeRounds,
  publicRosterLine,
  rulesOfGame,
  type GameSnapshotStore,
  type PublicGame,
  type PublicRoster,
  type PublicSchedule,
  type PublicSeasonChoice,
} from '@srleagues/core';
import type { LeagueClock, PublicGameFacts } from './public-schedule.ts';
import type { PublicSeason } from './public-stats.ts';
import type { StartPage } from './public-teams.ts';
import { dayIn, minorAt } from './stand-in-world-clock.ts';
import { gameRecordOf } from './stand-in-world-games.ts';
import type {
  WorldGame as StoredGame,
  WorldSeason as StoredSeason,
} from './stand-in-world-state.ts';
import type { Frozen, ReadWorld } from './stand-in-world.ts';

type WorldGame = Frozen<StoredGame>;
type WorldSeason = Frozen<StoredSeason>;

/** The seasons whose games, teams and rosters the public may read. */
const publicStatuses: readonly string[] = ['active', 'completed'];

const publicSeason = (s: ReadWorld | undefined, seasonId: string) => {
  const season = s?.seasons.find((x) => x.id === seasonId);
  return season === undefined || !publicStatuses.includes(season.status) ? undefined : season;
};

/** The seasons a visitor may pick, newest first (list-public-seasons.ts). */
function publicSeasonsOf(s: ReadWorld | undefined): WorldSeason[] {
  return (s?.seasons ?? [])
    .filter((x) => publicStatuses.includes(x.status))
    .sort(
      (a, b) =>
        (b.startsOn ?? '').localeCompare(a.startsOn ?? '') ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}

export function worldPublicSeasons(s: ReadWorld | undefined): PublicSeason[] {
  return publicSeasonsOf(s).map((x) => ({
    id: x.id,
    name: x.name,
    slug: x.slug,
    isCurrent: s?.currentSeasonId === x.id,
  }));
}

const choiceOf = (s: ReadWorld, season: WorldSeason): PublicSeasonChoice => ({
  slug: season.slug,
  name: season.name,
  programSlug: season.programSlug,
  status: season.status === 'completed' ? 'completed' : 'active',
  isCurrent: s.currentSeasonId === season.id,
  startsOn: season.startsOn,
  endsOn: season.endsOn,
});

function publicGameOf(s: ReadWorld, game: WorldGame): PublicGame {
  const team = (id: string) => {
    const found = s.teams.find((t) => t.id === id);
    return {
      id,
      slug: found?.slug ?? '',
      name: found?.name ?? '',
      color: found?.color ?? null,
      removed: found?.binned === true,
    };
  };
  const venue = s.venues.find((v) => v.id === game.venueId);
  return {
    id: game.id,
    number: game.number,
    startsAt: game.startsAt,
    localDate: game.startsAt === null ? null : dayIn(new Date(game.startsAt), s.timeZone),
    status: game.status,
    homeTeam: team(game.homeTeamId),
    awayTeam: team(game.awayTeamId),
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    overtimePeriods: game.overtimePeriods,
    periods:
      rulesOfGame(game.format, s.seasons.find((x) => x.id === game.seasonId)?.rules).gameFormat
        .periods === 2
        ? 2
        : 4,
    divisionName: s.divisions.find((d) => d.id === game.divisionId)?.name ?? null,
    venue:
      venue === undefined
        ? null
        : { name: venue.name, address: venue.address, mapLink: venue.mapLink },
    courtName: s.courts.find((c) => c.id === game.courtId)?.name ?? null,
  };
}

/** A season's published games in time order, those with no time last (list-public-games.ts). */
const gamesOfSeason = (s: ReadWorld, seasonId: string) =>
  s.games
    .filter((g) => g.seasonId === seasonId && !g.binned)
    .sort(
      (a, b) =>
        (a.startsAt ?? '~').localeCompare(b.startsAt ?? '~') ||
        (a.number ?? Infinity) - (b.number ?? Infinity) ||
        a.id.localeCompare(b.id),
    );

export function worldLeagueClock(s: ReadWorld | undefined, now: Date): LeagueClock {
  const timeZone = s?.timeZone ?? 'UTC';
  return { today: dayIn(now, timeZone), now: now.toISOString(), timeZone };
}

/** A season's schedule and results by round (list-public-schedule.ts). */
export function worldPublicSchedule(
  s: ReadWorld | undefined,
  seasonId: string,
  today: string,
): PublicSchedule | undefined {
  const season = publicSeason(s, seasonId);
  if (s === undefined || season === undefined) return undefined;
  const games = gamesOfSeason(s, seasonId);
  return {
    season: choiceOf(s, season),
    rounds: placeRounds(
      s.rounds
        .filter((r) => r.seasonId === seasonId)
        .sort((a, b) => a.number - b.number)
        .map((r) => ({
          id: r.id,
          number: r.number,
          label: r.label,
          date: r.date,
          games: games.filter((g) => g.roundId === r.id).map((g) => publicGameOf(s, g)),
        })),
      today,
    ),
    unplacedGames: games.filter((g) => g.roundId === null).map((g) => publicGameOf(s, g)),
  };
}

/** One published game's number, place and season, from its one row. */
export function worldGameFacts(
  s: ReadWorld | undefined,
  seasonId: string,
  gameId: string,
): PublicGameFacts | undefined {
  const season = publicSeason(s, seasonId);
  const game = s?.games.find((g) => g.id === gameId && g.seasonId === seasonId && !g.binned);
  if (s === undefined || season === undefined || game === undefined) return undefined;
  const shown = publicGameOf(s, game);
  return {
    number: shown.number,
    venue: shown.venue,
    courtName: shown.courtName,
    season: { slug: season.slug, isCurrent: s.currentSeasonId === season.id },
  };
}

/**
 * What a game's page and its snapshot read (games-read-store.ts), each over the world as
 * it stands once the transactions before it have ended.
 */
export function worldGameSnapshot(
  read: () => Promise<ReadWorld | undefined>,
  /** The world's one clock: the day a birth date is read against (R-28). */
  now: () => Date,
): GameSnapshotStore {
  return {
    // A game of a season still being set up (or retired) is not there at all. Its rules
    // are its own once fixed, else its season's.
    findGame: async (gameId) => {
      const s = await read();
      const game = s?.games.find((g) => g.id === gameId);
      if (game === undefined) return undefined;
      const season = publicSeason(s, game.seasonId);
      if (season === undefined) return undefined;
      const { format, version: _version, divisionId: _division, ...record } = gameRecordOf(game);
      return { ...record, rules: format ?? season.rules };
    },
    // As games-read-store.ts reads it: the list a public season names, and its rules.
    seasonStatistics: async (seasonId) => {
      const s = await read();
      const season = s?.seasons.find((x) => x.id === seasonId);
      if (season === undefined) return undefined;
      return { statKeys: publicSeason(s, seasonId)?.statKeys ?? [], rules: season.rules };
    },
    teams: async (teamIds) =>
      ((await read())?.teams ?? [])
        .filter((t) => teamIds.includes(t.id))
        .map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          color: t.color,
          statsVisibility: t.statsVisibility,
        })),
    state: async (gameId) => (await read())?.states.find((x) => x.gameId === gameId)?.state,
    savedState: async (gameId) => {
      const found = (await read())?.states.find((x) => x.gameId === gameId);
      return found === undefined ? undefined : { seq: found.seq, state: found.state };
    },
    lines: async (gameId) =>
      ((await read())?.lines ?? [])
        .filter((l) => l.gameId === gameId)
        .sort((a, b) => a.teamId.localeCompare(b.teamId) || a.personId.localeCompare(b.personId))
        .map((l) => ({
          teamId: l.teamId,
          personId: l.personId,
          jerseyNumber: l.jerseyNumber,
          played: l.played,
          secondsPlayed: l.secondsPlayed,
          stats: l.stats,
        })),
    people: async (personIds) => {
      const s = await read();
      const moment = now();
      return (s?.people ?? [])
        .filter((p) => personIds.includes(p.id) && !p.binned)
        .map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          // R-28: the birth date or the tick (list-people-for-display.ts).
          isMinor: minorAt(p, s?.timeZone ?? 'UTC', moment),
          visibility: p.visibility,
        }));
    },
    // Only a correction whose next final differs marks the game (S-81), as on the database.
    correctedOn: async (gameId) => {
      const s = await read();
      const game = s?.games.find((g) => g.id === gameId);
      if (s === undefined || game === undefined) return undefined;
      return correctedMarkDate(
        s.corrections.filter((c) => c.gameId === gameId),
        game,
      );
    },
  };
}

/** One team's public roster: those on it now, then those who left (list-public-roster.ts). */
export function worldPublicRoster(
  s: ReadWorld | undefined,
  teamId: string,
  display: Parameters<typeof publicRosterLine>[2],
  /** The moment the roster is read at: the day a birth date is read against (R-28). */
  now: Date,
): PublicRoster {
  const team = s?.teams.find((t) => t.id === teamId && !t.binned);
  if (s === undefined || team === undefined || publicSeason(s, team.seasonId) === undefined) {
    return { lines: [] };
  }
  return {
    lines: s.roster
      .filter((e) => e.teamId === teamId)
      .sort(
        (a, b) =>
          Number(a.leftOn !== null) - Number(b.leftOn !== null) ||
          (a.leftOn ?? '').localeCompare(b.leftOn ?? '') ||
          a.sort - b.sort ||
          a.id.localeCompare(b.id),
      )
      .map((e) => {
        const p = s.people.find((x) => x.id === e.personId);
        return publicRosterLine(
          {
            entryId: e.id,
            jerseyNumber: e.jerseyNumber,
            role: e.role,
            leftOn: e.leftOn,
            firstName: p?.firstName ?? '',
            lastName: p?.lastName ?? '',
            // R-28: the birth date or the tick (list-public-roster.ts).
            isMinor: p === undefined ? null : minorAt(p, s.timeZone, now),
            nameRequest: p?.visibility ?? 'none',
            personBinned: p === undefined || p.binned,
          },
          s.audience,
          display,
        );
      }),
  };
}

/** The league's "Start page for members" setting (U-5), as League settings saved it. */
export function worldStartPage(s: ReadWorld | undefined): StartPage {
  const rows = (s?.settings ?? [])
    .filter((r) => r.key === membersStartPage.key && r.place.level === 'league')
    .map((r) => ({ level: r.place.level, document: r.document }));
  return lookupSetting(membersStartPage, rows).value;
}

/** The league's minimum games for leaders (P7 §6), as League settings saves it. */
export function worldMinimumGames(s: ReadWorld | undefined): number {
  const rows = (s?.settings ?? [])
    .filter((r) => r.key === minimumGamesToRank.key && r.place.level === 'league')
    .map((r) => ({ level: r.place.level, document: r.document }));
  return lookupSetting(minimumGamesToRank, rows).value;
}

/** The teams of the season the account has a roster place on now, through its person. */
export function worldTeamsOfAccount(
  s: ReadWorld | undefined,
  seasonId: string,
  accountId: string,
): string[] {
  if (s === undefined) return [];
  const people = new Set(s.people.filter((p) => p.accountId === accountId).map((p) => p.id));
  const teams = new Set(
    s.teams.filter((t) => t.seasonId === seasonId && !t.binned).map((t) => t.id),
  );
  return [
    ...new Set(
      s.roster
        .filter((e) => people.has(e.personId) && teams.has(e.teamId) && e.leftOn === null)
        .map((e) => e.teamId),
    ),
  ];
}
