// How the Al-Hadi transfer (step 2.58) finds, on the platform, what the tracker kept:
// its teams by name, its games by the league's game number or by day and teams, and its
// players on their team's roster by name (or by number, for one the tracker knows only
// by number). Pure: the plan (plan-tracker-transfer.ts) gives it what it has read.
import type {
  RosterPersonFact,
  SeasonGameFact,
  SeasonTeamFact,
  TrackerGame,
  TrackerPlayer,
  TrackerTeam,
} from './tracker-transfer-data.ts';

/** A name as compared: the same letters, whatever the capitals and the spaces. */
export const nameKey = (name: string) =>
  name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();

export type TeamMatch =
  | { readonly kind: 'matched'; readonly teamId: string }
  | { readonly kind: 'unmatched'; readonly reason: 'not-found' | 'shared' };

/**
 * Each tracker team's team of the season: the one with its name, or else with its
 * school's name. Two tracker teams that would land on one team are both left unmatched,
 * since a game between them could not be told apart.
 */
export function matchTrackerTeams(
  trackerTeams: readonly TrackerTeam[],
  seasonTeams: readonly SeasonTeamFact[],
): ReadonlyMap<string, TeamMatch> {
  const byName = new Map(seasonTeams.map((team) => [nameKey(team.name), team.id]));
  const found = new Map<string, string | undefined>();
  for (const team of trackerTeams) {
    const school = team.school.trim() === '' ? undefined : byName.get(nameKey(team.school));
    found.set(team.id, byName.get(nameKey(team.name)) ?? school);
  }
  const uses = new Map<string, number>();
  for (const teamId of found.values()) {
    if (teamId !== undefined) uses.set(teamId, (uses.get(teamId) ?? 0) + 1);
  }
  const matches = new Map<string, TeamMatch>();
  for (const [trackerId, teamId] of found) {
    if (teamId === undefined) matches.set(trackerId, { kind: 'unmatched', reason: 'not-found' });
    else if ((uses.get(teamId) ?? 0) > 1) {
      matches.set(trackerId, { kind: 'unmatched', reason: 'shared' });
    } else matches.set(trackerId, { kind: 'matched', teamId });
  }
  return matches;
}

/** The day an instant falls on in a time zone, as YYYY-MM-DD. */
export function localDateOf(iso: string, timeZone: string): string | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The league's game number a tracker fixture names: the number its reference ends with. */
export function gameNumberOf(sourceRef: string | null): number | null {
  const match = sourceRef === null ? null : /(\d{1,6})\s*$/u.exec(sourceRef);
  return match?.[1] === undefined ? null : Number(match[1]);
}

export type GameMatch =
  | { readonly kind: 'matched'; readonly gameId: string; readonly by: 'number' | 'date' }
  | {
      readonly kind: 'unmatched';
      readonly reason:
        | 'team-not-matched'
        | 'not-found'
        | 'several'
        | 'home-away-swapped'
        | 'number-other-teams';
    };

/**
 * The season's game a tracker game is: the one with the league's game number its
 * reference ends with, if there is one, else the one on the same day between the same
 * teams. Home and away must agree, since every recorded action names its side.
 */
export function matchTrackerGame(
  game: TrackerGame,
  teams: ReadonlyMap<string, TeamMatch>,
  seasonGames: readonly SeasonGameFact[],
  timeZone: string,
): GameMatch {
  const home = teams.get(game.homeTeamId);
  const away = teams.get(game.awayTeamId);
  if (home?.kind !== 'matched' || away?.kind !== 'matched') {
    return { kind: 'unmatched', reason: 'team-not-matched' };
  }
  const same = (g: SeasonGameFact) => g.homeTeamId === home.teamId && g.awayTeamId === away.teamId;
  const swapped = (g: SeasonGameFact) =>
    g.homeTeamId === away.teamId && g.awayTeamId === home.teamId;

  const number = gameNumberOf(game.sourceRef);
  const numbered = number === null ? [] : seasonGames.filter((g) => g.number === number);
  const byNumber = numbered[0];
  if (numbered.length === 1 && byNumber !== undefined) {
    if (same(byNumber)) return { kind: 'matched', gameId: byNumber.id, by: 'number' };
    return {
      kind: 'unmatched',
      reason: swapped(byNumber) ? 'home-away-swapped' : 'number-other-teams',
    };
  }

  const day = game.startsAt === null ? null : localDateOf(game.startsAt, timeZone);
  if (day === null) return { kind: 'unmatched', reason: 'not-found' };
  const onDay = seasonGames.filter((g) => g.localDate === day && (same(g) || swapped(g)));
  const only = onDay[0];
  if (onDay.length > 1) return { kind: 'unmatched', reason: 'several' };
  if (only === undefined) return { kind: 'unmatched', reason: 'not-found' };
  return same(only)
    ? { kind: 'matched', gameId: only.id, by: 'date' }
    : { kind: 'unmatched', reason: 'home-away-swapped' };
}

/** A tracker name as a person's first and last name: the first word, and the rest. */
export function splitName(
  name: string,
): { readonly firstName: string; readonly lastName: string } | undefined {
  const words = name.normalize('NFKC').trim().split(/\s+/u);
  const [first, ...rest] = words;
  if (first === undefined || first === '' || rest.length === 0) return undefined;
  return { firstName: first, lastName: rest.join(' ') };
}

export type PlayerMatch =
  | {
      readonly kind: 'on-roster';
      readonly personId: string;
      readonly jerseyNumber: string | null;
    }
  | {
      readonly kind: 'add';
      readonly firstName: string;
      readonly lastName: string;
      readonly jerseyNumber: string | null;
    }
  | {
      readonly kind: 'problem';
      readonly reason: 'no-name' | 'one-name' | 'several-on-roster' | 'same-person';
    };

const jerseyOf = (player: TrackerPlayer) => (player.jersey === '' ? null : player.jersey);

/**
 * Where each tracker player of one team is on its platform team's roster. Someone whose
 * name (first and last, or the name they are shown by) is the tracker's is that player;
 * a player the tracker knows only by number is the one roster entry with that number.
 * Anyone else is added, with the first word of the name as the first name; a player
 * with no name or a single word cannot be, as a person needs both names. Two tracker
 * players landing on one person are both a problem.
 */
export function matchTrackerPlayers(
  players: readonly TrackerPlayer[],
  roster: readonly RosterPersonFact[],
): ReadonlyMap<string, PlayerMatch> {
  const named = new Map<string, RosterPersonFact[]>();
  const add = (key: string, entry: RosterPersonFact) => {
    const list = named.get(key) ?? [];
    if (!list.some((e) => e.personId === entry.personId)) list.push(entry);
    named.set(key, list);
  };
  for (const entry of roster) {
    add(nameKey(`${entry.firstName} ${entry.lastName}`), entry);
    if (entry.publicName !== null) add(nameKey(entry.publicName), entry);
  }
  const matches = new Map<string, PlayerMatch>();
  for (const player of players) {
    const key = nameKey(player.name);
    const candidates =
      key === ''
        ? roster.filter((e) => player.jersey !== '' && e.jerseyNumber === player.jersey)
        : (named.get(key) ?? []);
    const only = candidates[0];
    if (candidates.length > 1) {
      matches.set(player.id, { kind: 'problem', reason: 'several-on-roster' });
    } else if (only !== undefined) {
      matches.set(player.id, {
        kind: 'on-roster',
        personId: only.personId,
        jerseyNumber: only.jerseyNumber,
      });
    } else {
      const split = splitName(player.name);
      matches.set(
        player.id,
        split === undefined
          ? { kind: 'problem', reason: key === '' ? 'no-name' : 'one-name' }
          : { kind: 'add', ...split, jerseyNumber: jerseyOf(player) },
      );
    }
  }
  // Two of the team's players with one name would be one person here, now or on the
  // next run, so neither is taken.
  const people = new Map<string, number>();
  const count = (key: string) => people.set(key, (people.get(key) ?? 0) + 1);
  for (const player of players) {
    const match = matches.get(player.id);
    if (match?.kind === 'on-roster') count(`person:${match.personId}`);
    if (nameKey(player.name) !== '') count(`name:${nameKey(player.name)}`);
  }
  for (const player of players) {
    const match = matches.get(player.id);
    const shared =
      (match?.kind === 'on-roster' && (people.get(`person:${match.personId}`) ?? 0) > 1) ||
      (nameKey(player.name) !== '' && (people.get(`name:${nameKey(player.name)}`) ?? 0) > 1);
    if (shared) matches.set(player.id, { kind: 'problem', reason: 'same-person' });
  }
  return matches;
}
