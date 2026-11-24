// What the scheduling module needs from storage for venues and courts. packages/database
// supplies it, bound to one transaction for one league, so none of these take a
// league id (T-28).
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';
import type { ScheduleState } from './rules/schedule-types.ts';
import type { DraftDocument } from './draft-document.ts';

/** A place games are played, in or out of the bin (T3 §4). */
export type VenueRecord = {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  /** A web address (https) that opens a map. */
  readonly mapLink: string | null;
  readonly binned: boolean;
  readonly version: number;
};

/** A court at a venue; it stays at that venue for good. */
export type CourtRecord = {
  readonly id: string;
  readonly venueId: string;
  readonly name: string;
  readonly sort: number;
  readonly binned: boolean;
  readonly version: number;
};

export type VenueWithCourts = VenueRecord & { readonly courts: readonly CourtRecord[] };

/**
 * How many published games not in the bin are at one place (a venue, and a court of it or
 * none): with a final or forfeited result, and without a result yet (scheduled, postponed,
 * or being played now). A cancelled game is in neither.
 */
export type PlacePublishedGames = {
  readonly venueId: string;
  readonly courtId: string | null;
  readonly played: number;
  readonly toCome: number;
};

/**
 * What the league's games are at its venues and courts (step 2.49): the published ones by
 * place, and every season's schedule draft as stored, whose games count too
 * (place-games.ts reads them).
 */
export type PlaceGamesRecord = {
  readonly published: readonly PlacePublishedGames[];
  readonly drafts: readonly { readonly seasonId: string; readonly changes: unknown }[];
};

export type NewVenue = {
  readonly name: string;
  readonly address: string | null;
  readonly mapLink: string | null;
};

/** What a venue change sets; a field left out stays as it is, null clears. */
export type VenueChange = {
  readonly name?: string;
  readonly address?: string | null;
  readonly mapLink?: string | null;
};

export type NewCourt = { readonly venueId: string; readonly name: string; readonly sort: number };

export type CourtChange = { readonly name?: string; readonly sort?: number };

/** A season's one schedule draft (A-9), its changes as stored: parse them with parseDraftDocument. */
export type DraftRecord = {
  /** Tells this draft from one started after it was discarded, whatever the version (A-8). */
  readonly id: string;
  readonly seasonId: string;
  readonly changes: unknown;
  /** The revision of the season's schedule the draft was started on; null before the first publication. */
  readonly basedOnRevision: number | null;
  readonly version: number;
};

/** What publishing needs to know of a game that already exists, binned or dated or not. */
export type GameFacts = {
  readonly id: string;
  readonly status: string;
  readonly binned: boolean;
  /**
   * Whether its events keep it out of the bin: a play since it was last marked not started,
   * or events in a game that was ever decided (record 061). Such a game is never removed.
   */
  readonly hasEvents: boolean;
};

/**
 * A game a publication creates; it is always scheduled, with the time in the league's zone. The store gives each the next game number of its season,
 * after the highest any game of the season holds or held, in the order given (the plan
 * orders them by date and time; step 2.53, S-90), like the games made with the schedule.
 */
export type NewPublishedGame = {
  readonly id: string;
  readonly roundId: string | null;
  readonly date: string;
  readonly time: string;
  readonly venueId: string | null;
  /** The court's name at the venue; the store finds the court. */
  readonly court: string | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  /** How the database spells it: final, box or live. */
  readonly captureMode: 'final' | 'box' | 'live';
};

/** What a publication changes in a game that exists; a field left out stays as it is. */
export type PublishedGameChange = {
  readonly slot?: Pick<NewPublishedGame, 'roundId' | 'date' | 'time' | 'venueId' | 'court'>;
  readonly captureMode?: NewPublishedGame['captureMode'];
  /** A postponed game the publication gives a new slot is scheduled again (T-326). */
  readonly status?: 'scheduled';
};

/** A round a publication creates (step 2.160), with the number the draft gave it. */
export type NewRound = {
  readonly id: string;
  readonly number: number;
  readonly label: string;
  /** YYYY-MM-DD, or null for none. */
  readonly date: string | null;
};

/** A game that is in a round and not in the bin, dated or not, scored or not. */
export type GameInRound = { readonly id: string; readonly roundId: string };

export type NewScheduleRevision = {
  readonly number: number;
  readonly publishedByAccountId: string | null;
  /** A small versioned document of ids and counts only (T-220). */
  readonly summary: unknown;
};

export type SchedulingStore = {
  /** The program a season belongs to, or undefined if the season is not in this league. */
  readonly findSeason: (seasonId: string) => Promise<{ readonly programId: string } | undefined>;
  /** Whether the season is archived, so read-only (O-12, step 2.130); false if not here. */
  readonly seasonArchived: (seasonId: string) => Promise<boolean>;
  /** The number of the season's latest published schedule revision, or null if none yet. */
  readonly latestRevision: (seasonId: string) => Promise<number | null>;
  readonly findDraft: (seasonId: string) => Promise<DraftRecord | undefined>;
  /**
   * Starts the season's draft: its id and version (1), 'exists' if the season already has
   * one, or 'no-season' if the season is not in this league.
   */
  readonly insertDraft: (
    seasonId: string,
    changes: DraftDocument,
    basedOnRevision: number | null,
  ) => Promise<{ readonly id: string; readonly version: number } | 'exists' | 'no-season'>;
  /**
   * Saves the draft's changes if it is that draft and still at `version` (A-8, T-46): the
   * new version, or undefined.
   */
  readonly updateDraft: (
    seasonId: string,
    draftId: string,
    changes: DraftDocument,
    version: number,
  ) => Promise<number | undefined>;
  /** Removes the draft if it is that draft and still at `version`; false if not. */
  readonly deleteDraft: (seasonId: string, draftId: string, version: number) => Promise<boolean>;
  /**
   * The season's published schedule as the rules read it: its rounds and its games not in
   * the bin that have a date, with dates and times in the league's time zone and a game's
   * court by name. A round with no label is called "Round n".
   */
  readonly loadSchedule: (seasonId: string) => Promise<ScheduleState>;
  /** The season's rules as stored (read them with upgradeSeasonRules), or undefined if the season is not in this league. */
  readonly seasonRules: (seasonId: string) => Promise<unknown>;
  /** The season's games with these ids, in the bin or not, dated or not. */
  readonly gamesById: (
    seasonId: string,
    gameIds: readonly string[],
  ) => Promise<readonly GameFacts[]>;
  /** How many people are on the current rosters of these teams of the season (each counted once). */
  readonly countPeopleOnTeams: (seasonId: string, teamIds: readonly string[]) => Promise<number>;
  /**
   * Creates the games (and the season's regular stage if it has none yet); divisions follow
   * the teams. How many were made: a game whose id any game has already, in this league or
   * another (ids are the database's own across leagues), is not made, so the caller refuses.
   */
  readonly insertPublishedGames: (
    seasonId: string,
    games: readonly NewPublishedGame[],
  ) => Promise<number>;
  /** Changes a game that has not started; false if it is not there, is in the bin or has started. */
  readonly updatePublishedGame: (
    seasonId: string,
    gameId: string,
    change: PublishedGameChange,
  ) => Promise<boolean>;
  /** Moves games that were never scored and have not been decided to the bin; how many went. */
  readonly binPublishedGames: (seasonId: string, gameIds: readonly string[]) => Promise<number>;
  /** Changes a round's label or date. */
  readonly updateRound: (
    seasonId: string,
    roundId: string,
    change: { readonly label?: string; readonly date?: string },
  ) => Promise<boolean>;
  /**
   * Adds rounds to the season with their numbers (step 2.160): how many were added. One
   * whose id or number is taken is not added.
   */
  readonly insertRounds: (seasonId: string, rounds: readonly NewRound[]) => Promise<number>;
  /**
   * Removes these rounds of the season that no game outside the bin is in: which went. The
   * games in the bin that are in them lose their round and keep everything else (S-60):
   * which, so the publication's log entry keeps that they had one.
   */
  readonly deleteRounds: (
    seasonId: string,
    roundIds: readonly string[],
  ) => Promise<{ readonly roundIds: readonly string[]; readonly gameIds: readonly string[] }>;
  /** The season's games not in the bin, dated or not, that are in any of these rounds (S-60). */
  readonly gamesInRounds: (
    seasonId: string,
    roundIds: readonly string[],
  ) => Promise<readonly GameInRound[]>;
  /** Writes the season's next revision; false if its number is already taken. */
  readonly insertRevision: (seasonId: string, revision: NewScheduleRevision) => Promise<boolean>;
  /** Which of these teams are teams of the season that are not in the bin. */
  readonly teamsOfSeason: (
    seasonId: string,
    teamIds: readonly string[],
  ) => Promise<readonly string[]>;
  /** Which of these teams of the season have left the league (S-87): offered for no new game. */
  readonly leftTeamsOfSeason: (
    seasonId: string,
    teamIds: readonly string[],
  ) => Promise<readonly string[]>;
  /** The venue with this id, in the bin or not, or undefined if it is not in this league. */
  readonly findVenue: (venueId: string) => Promise<VenueRecord | undefined>;
  /** Venues not in the bin, by name, each with its courts not in the bin, in order. */
  readonly listVenues: () => Promise<readonly VenueWithCourts[]>;
  /** Adds a venue: its id, or 'name-taken' (another venue not in the bin has the name). */
  readonly createVenue: (venue: NewVenue) => Promise<string | 'name-taken'>;
  /**
   * Changes a venue not in the bin if it is still at `version` (T-46): the new
   * version, 'name-taken', or undefined if it is not there or moved on.
   */
  readonly updateVenue: (
    venueId: string,
    change: VenueChange,
    version: number,
  ) => Promise<number | 'name-taken' | undefined>;
  /** Moves a venue to the bin or brings it back ('name-taken' if another took its name). */
  readonly setVenueBinned: (venueId: string, binned: boolean) => Promise<boolean | 'name-taken'>;
  /** Whether any court of this venue is not in the bin. */
  readonly hasLiveCourts: (venueId: string) => Promise<boolean>;
  /** The venue's courts not in the bin, in order (by sort, then name). */
  readonly listCourts: (venueId: string) => Promise<readonly CourtRecord[]>;
  readonly findCourt: (courtId: string) => Promise<CourtRecord | undefined>;
  /** Adds a court to a venue: its id, or 'name-taken' (the venue has a court of that name). */
  readonly createCourt: (court: NewCourt) => Promise<string | 'name-taken'>;
  /** As updateVenue; the version is optional (ordering carries none). */
  readonly updateCourt: (
    courtId: string,
    change: CourtChange,
    version?: number,
  ) => Promise<number | 'name-taken' | undefined>;
  readonly setCourtBinned: (courtId: string, binned: boolean) => Promise<boolean | 'name-taken'>;
  /** The league's games at its venues and courts, and its schedule drafts (step 2.49). */
  readonly placeGames: () => Promise<PlaceGamesRecord>;
};

/** A scheduling command's transaction: its store, the permission reader and the activity log. */
export type SchedulingTx = CommandTx & {
  readonly scheduling: SchedulingStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
