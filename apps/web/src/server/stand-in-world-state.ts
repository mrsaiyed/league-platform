// THE ONE MADE-UP WORLD OF THE STAND-IN: WHAT ONE LEAGUE HOLDS. FOR LOCAL WORK AND TESTS ONLY.
//
// Everything a made-up league holds, as the database's tables hold it (T3): its seasons,
// divisions, teams, people and rosters, venues, rounds and games, the tracker's plays and
// box score lines, the standings worked out from the results, imports, settings and the
// activity log. Every area of the web app reads and writes this one set of rows
// (stand-in-world.ts), so a team added, a schedule published or a score typed shows
// wherever the product shows it. Plain data only, so a transaction can copy it whole.
import type {
  ActivityEntry,
  Audience,
  DraftRecord,
  GameRecord,
  ImportRecord,
  LiveGameLine,
  NewGameCorrection,
  NewGameEvent,
  PersonRecord,
  PersonSensitiveFields,
  RosterEntryRecord,
  ScoringSession,
  SeasonAdjustment,
  SettingPlace,
  StandingsStore,
  TeamRecord,
  VenueRecord,
  CourtRecord,
} from '@srleagues/core';

/** A season's standings row and a player's season totals, as the standings module saves them. */
export type SavedStandingsRow = Parameters<StandingsStore['replaceRows']>[1][number];
export type SavedPlayerTotals = Parameters<StandingsStore['replaceTotals']>[1][number];

export type WorldSeason = {
  readonly id: string;
  readonly programId: string;
  /** Its program's short name, as the season picker carries it. */
  readonly programSlug: string;
  readonly name: string;
  /** yyyy-mm-dd or null. */
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  /** Its address name, `?season=`. */
  readonly slug: string;
  readonly status: 'draft' | 'active' | 'completed';
  /** The rules as stored (read them with upgradeSeasonRules). */
  readonly rules: unknown;
  /** The statistics the season keeps, in order. */
  readonly statKeys: readonly string[];
};

export type WorldDivision = {
  readonly id: string;
  readonly seasonId: string;
  readonly name: string;
  readonly sort: number;
  readonly binned: boolean;
};

/** A person, with the fields only staff may read, and the account they are, if any. */
export type WorldPerson = PersonRecord & {
  readonly sensitive: PersonSensitiveFields;
  readonly accountId: string | null;
};

/** A roster entry, with what the scorer's table marks on it (S-6, record 058). */
export type WorldRosterEntry = RosterEntryRecord & {
  readonly addedAtGameId: string | null;
  readonly needsReview: boolean;
};

export type WorldRound = {
  readonly id: string;
  readonly seasonId: string;
  readonly number: number;
  /** Null: shown as "Round n". */
  readonly label: string | null;
  readonly date: string | null;
};

/** A game as the games and scheduling modules both see it: one row (T3 §8). */
export type WorldGame = GameRecord & {
  readonly roundId: string | null;
  /** The game's number in its season, as the public schedule shows it. */
  readonly number: number | null;
  /** The day and time in the league's time zone (yyyy-mm-dd, HH:MM), as published. */
  readonly localDate: string | null;
  readonly localTime: string | null;
  readonly venueId: string | null;
  readonly courtId: string | null;
};

export type WorldSetting = {
  readonly place: SettingPlace;
  readonly key: string;
  readonly document: { readonly version: number; readonly value: unknown };
  readonly version: number;
};

export type LeagueWorld = {
  readonly leagueId: string;
  /** Who plays in the league (R-15). */
  readonly audience: Audience;
  /** The league's own time zone: its "today" and its game times. */
  readonly timeZone: string;
  /** The fewest games a player needs to be among the leaders; 0 for none. */
  readonly minimumGames: number;
  currentSeasonId: string | null;
  seasons: WorldSeason[];
  divisions: WorldDivision[];
  teams: TeamRecord[];
  people: WorldPerson[];
  roster: WorldRosterEntry[];
  venues: VenueRecord[];
  courts: CourtRecord[];
  rounds: WorldRound[];
  games: WorldGame[];
  /** Published schedule revisions, by season. */
  revisions: { readonly seasonId: string; readonly number: number }[];
  drafts: DraftRecord[];
  assignments: { readonly gameId: string; readonly accountId: string }[];
  corrections: (NewGameCorrection & { readonly on: string })[];
  sessions: ScoringSession[];
  states: { readonly gameId: string; readonly seq: number; readonly state: unknown }[];
  events: NewGameEvent[];
  /** Box score lines, with the number worn: the tracker's and the grid's, one table. */
  lines: LiveGameLine[];
  /** Games whose plays the tracker recorded before this process started (none kept here). */
  playsBefore: string[];
  standingsRows: Record<string, SavedStandingsRow[]>;
  playerTotals: Record<string, SavedPlayerTotals[]>;
  adjustments: (SeasonAdjustment & { readonly seasonId: string; readonly binned: boolean })[];
  imports: ImportRecord[];
  settings: WorldSetting[];
  activity: ActivityEntry[];
};

/** A league that holds nothing yet. */
export function emptyLeagueWorld(
  leagueId: string,
  facts: Pick<LeagueWorld, 'audience' | 'timeZone' | 'minimumGames'>,
): LeagueWorld {
  return {
    leagueId,
    ...facts,
    currentSeasonId: null,
    seasons: [],
    divisions: [],
    teams: [],
    people: [],
    roster: [],
    venues: [],
    courts: [],
    rounds: [],
    games: [],
    revisions: [],
    drafts: [],
    assignments: [],
    corrections: [],
    sessions: [],
    states: [],
    events: [],
    lines: [],
    playsBefore: [],
    standingsRows: {},
    playerTotals: {},
    adjustments: [],
    imports: [],
    settings: [],
    activity: [],
  };
}
