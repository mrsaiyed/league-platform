// The schedule grid's rows, worked out from the draft the scheduling query returns
// (P7 §4.3): rounds with their games in order, games that belong to no round, which
// games are in a clash, and the clashes in words. No page code here, so it is tested
// without a server.
import type { Clash, ScheduleDraftView, ScheduleGame, VenueWithCourts } from '@srleagues/core';
import { leagueDayText } from '../../server/game-when.ts';
import { locale, t } from '../../server/messages.ts';

/** A team as the grid names it; one in the bin (`removed`) is only named, never offered. */
export type GridTeam = { readonly id: string; readonly name: string; readonly removed?: boolean };

/**
 * A team's name in the grid: "Badgers (removed)" for one in the bin (A-17), and words, never
 * an id, for one the season's list does not hold.
 */
export function gridTeamName(teams: readonly GridTeam[], id: string): string {
  const team = teams.find((x) => x.id === id);
  if (team === undefined) return t('schedule.admin.unknownTeam');
  return team.removed === true ? t('schedule.admin.removedTeam', { name: team.name }) : team.name;
}

/** The teams a new game can be given: those not in the bin. */
export const pickableTeams = (teams: readonly GridTeam[]): readonly GridTeam[] =>
  teams.filter((team) => team.removed !== true);

/**
 * What Admin → Schedule draws from the season's teams (the page's one wiring of them): the
 * grid, which names every team of the season, those in the bin as "Badgers (removed)", and
 * the teams its forms offer for a game, those not in the bin. It takes all of the draft
 * `buildGrid` reads, none of it optional: without `removed` and `published`, every game the
 * draft removes from the published schedule would vanish from the screen instead of staying
 * struck through with "Put it back" (step 2.185).
 */
export function pageGrid(
  view: Pick<ScheduleDraftView, 'result' | 'clashes' | 'undated' | 'removed' | 'published'>,
  seasonTeams: readonly GridTeam[],
  venues: readonly VenueWithCourts[],
): { readonly grid: Grid; readonly teams: readonly GridTeam[] } {
  return { grid: buildGrid(view, seasonTeams, venues), teams: pickableTeams(seasonTeams) };
}

export type GridGame = {
  readonly id: string;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeName: string;
  readonly awayName: string;
  readonly roundId: string | null;
  readonly date: string;
  readonly time: string | null;
  /** The venue and court as one form value (see placeValue). */
  readonly place: string;
  readonly placeLabel: string | null;
  readonly recording: ScheduleGame['recording'];
  readonly status: ScheduleGame['status'];
  /** Only a game that is still just scheduled can be edited here. */
  readonly editable: boolean;
  readonly clashed: boolean;
  /**
   * Its round's date while the game is on another day (step 2.160), so the grid can offer
   * it; null when the game is on it, or its round has no date.
   */
  readonly offRoundDate: string | null;
  /**
   * The game is outside its round's days (step 2.160): before the round's date, or on or
   * after the next round's (a week on, for the last round). Flagged until it is moved.
   */
  readonly outsideRound: boolean;
};

export type GridRound = {
  readonly id: string;
  readonly number: number;
  readonly label: string;
  readonly date: string | null;
  readonly games: readonly GridGame[];
  /**
   * How many games with no date yet are in the round (step 2.181): the grid cannot place
   * them, but they hold the round, so it says so and offers no "Remove this round".
   */
  readonly undated: number;
  /**
   * Games of the published schedule the draft removes, where they were (step 2.185): shown
   * struck through with "Put it back" until the draft is published or discarded. They hold
   * nothing: not the round (S-60), not a count, not a clash.
   */
  readonly removed: readonly RemovedGridGame[];
};

/** A game of the published schedule that the draft removes, as the draft last held it. */
export type RemovedGridGame = GridGame & {
  /**
   * The name of the round it was in, when the draft has removed that round too: it is shown
   * under "Games with no round", and "Put it back" brings it back there (S-60).
   */
  readonly roundGone: string | null;
};

export type GridClash = { readonly key: string; readonly text: string };

export type Grid = {
  readonly rounds: readonly GridRound[];
  /** Games that belong to no round. */
  readonly looseGames: readonly GridGame[];
  /** Removed games of the published schedule whose round is not in the draft (step 2.185). */
  readonly looseRemoved: readonly RemovedGridGame[];
  readonly clashes: readonly GridClash[];
  readonly allGames: readonly GridGame[];
};

/** A venue and court as one value for a form field: `venueId|court`, empty for none. */
export function placeValue(venueId: string | null, court: string | null): string {
  return venueId === null ? '' : `${venueId}|${court ?? ''}`;
}

/** The other way round; a value that is not one of ours is "no place". */
export function parsePlace(value: string): { venueId: string | null; court: string | null } {
  const cut = value.indexOf('|');
  if (cut < 1) return { venueId: null, court: null };
  const court = value.slice(cut + 1);
  return { venueId: value.slice(0, cut), court: court === '' ? null : court };
}

/**
 * A calendar day in words, "Sun, Nov 29"; a value that is not a day is given back as it is.
 * Written by the admin's one helper for a day of the league's calendar (server/game-when.ts).
 */
export function dayText(date: string): string {
  return leagueDayText(date, locale);
}

const clockFormat = new Intl.DateTimeFormat(locale, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

/**
 * A time of day in words, "6:00 PM", for the league's own clock time as the grid holds it
 * ("18:00"); a value that is not a time is given back as it is. Only how it is written:
 * the time is the league's own already (step 2.165 names the zone).
 */
export function clockText(time: string): string {
  const at = new Date(`1970-01-01T${time}:00.000Z`);
  return /^\d{2}:\d{2}$/.test(time) && !Number.isNaN(at.getTime()) ? clockFormat.format(at) : time;
}

/** The day after `date` by `days`, as YYYY-MM-DD; undefined for a value that is not a day. */
export function daysAfter(date: string, days: number): string | undefined {
  const day = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(day.getTime())) return undefined;
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

const byWhen = (a: GridGame, b: GridGame) =>
  a.date.localeCompare(b.date) ||
  (a.time ?? '99:99').localeCompare(b.time ?? '99:99') ||
  a.id.localeCompare(b.id);

/**
 * A round's games and the games the draft removes from it, one list in the order of their
 * days and times: a removed game stays where it was (step 2.185).
 */
export function gamesInOrder(
  games: readonly GridGame[],
  removed: readonly RemovedGridGame[],
): readonly (GridGame | RemovedGridGame)[] {
  return [...games, ...removed].sort(byWhen);
}

const gamesOf = (c: Clash): readonly string[] =>
  c.kind === 'skipped-date' ? [c.gameId] : c.gameIds;

export function buildGrid(
  view: Pick<ScheduleDraftView, 'result' | 'clashes'> &
    Partial<Pick<ScheduleDraftView, 'undated' | 'removed' | 'published'>>,
  teams: readonly GridTeam[],
  venues: readonly VenueWithCourts[],
): Grid {
  const teamName = (id: string) => gridTeamName(teams, id);
  const labelOf = (venueId: string | null, court: string | null): string | null => {
    if (venueId === null) return null;
    const venue = venues.find((v) => v.id === venueId);
    if (venue === undefined) return null;
    return court === null
      ? venue.name
      : t('schedule.admin.gameWhere', { venue: venue.name, court });
  };
  const clashed = new Set(view.clashes.flatMap(gamesOf));
  const roundDates = new Map(view.result.rounds.map((r) => [r.id, r.date]));
  const dated = view.result.rounds.flatMap((r) => (r.date === null ? [] : [r.date])).sort();
  const roundDateOf = (roundId: string | null): string | null =>
    roundId === null ? null : (roundDates.get(roundId) ?? null);
  const offRoundDate = (roundId: string | null, date: string): string | null => {
    const roundDate = roundDateOf(roundId);
    return roundDate !== null && roundDate !== date ? roundDate : null;
  };
  /** A round's days run from its date to the day before the next later round's, or a week. */
  const outsideRound = (roundId: string | null, date: string): boolean => {
    const roundDate = roundDateOf(roundId);
    if (roundDate === null) return false;
    const end = dated.find((d) => d > roundDate) ?? daysAfter(roundDate, 7) ?? roundDate;
    return date < roundDate || date >= end;
  };
  const gridGame = (g: ScheduleGame): GridGame => ({
    id: g.id,
    homeTeamId: g.homeTeamId,
    awayTeamId: g.awayTeamId,
    homeName: teamName(g.homeTeamId),
    awayName: teamName(g.awayTeamId),
    roundId: g.roundId,
    date: g.date,
    time: g.time,
    place: placeValue(g.venueId, g.court),
    placeLabel: labelOf(g.venueId, g.court),
    recording: g.recording ?? null,
    status: g.status,
    editable: g.status === 'scheduled',
    clashed: clashed.has(g.id),
    offRoundDate: offRoundDate(g.roundId, g.date),
    outsideRound: outsideRound(g.roundId, g.date),
  });
  const all: GridGame[] = view.result.games.map(gridGame).sort(byWhen);
  const roundIds = new Set(view.result.rounds.map((r) => r.id));
  // The draft's own record of what it removes, read from the draft (never the address):
  // only games of the published schedule stay in sight; one that was only ever in the
  // draft is gone, as its answer says.
  const publishedIds = new Set((view.published?.games ?? []).map((g) => g.id));
  const removedRounds = view.result.removedRounds ?? [];
  const removed: RemovedGridGame[] = (view.removed ?? [])
    .filter((g) => publishedIds.has(g.id))
    .map((g) => ({
      ...gridGame(g),
      // Nothing about a removed game is a flag: it holds no place.
      clashed: false,
      offRoundDate: null,
      outsideRound: false,
      roundGone:
        g.roundId === null || roundIds.has(g.roundId)
          ? null
          : (removedRounds.find((r) => r.id === g.roundId)?.label ?? null),
    }))
    .sort(byWhen);
  const gameText = (id: string) => {
    const g = all.find((x) => x.id === id);
    return g === undefined
      ? id
      : t('schedule.admin.gameVs', { away: g.awayName, home: g.homeName });
  };
  const clashText = (c: Clash): string => {
    const games = gamesOf(c).map(gameText).join('; ');
    switch (c.kind) {
      case 'team-in-two-places':
        return t('schedule.admin.clash.team', {
          team: teamName(c.teamId),
          time: c.time,
          date: c.date,
          games,
        });
      case 'court-booked-twice':
        return t('schedule.admin.clash.court', {
          place: labelOf(c.venueId, c.court) ?? c.court,
          time: c.time,
          date: c.date,
          games,
        });
      case 'skipped-date':
        return t('schedule.admin.clash.skipped', { game: games, date: c.date });
    }
  };
  return {
    rounds: view.result.rounds.map((r, i) => ({
      id: r.id,
      // As stored, so it matches the public `?round=` filter; a round with none (never one
      // the store loads or a draft adds) is counted in order.
      number: r.number ?? i + 1,
      label: r.label,
      date: r.date,
      games: all.filter((g) => g.roundId === r.id),
      undated: (view.undated ?? []).filter((g) => g.roundId === r.id).length,
      removed: removed.filter((g) => g.roundId === r.id),
    })),
    looseGames: all.filter((g) => g.roundId === null || !roundIds.has(g.roundId)),
    looseRemoved: removed.filter((g) => g.roundId === null || !roundIds.has(g.roundId)),
    clashes: view.clashes.map((c, i) => ({ key: `${c.kind}-${i}`, text: clashText(c) })),
    allGames: all,
  };
}
