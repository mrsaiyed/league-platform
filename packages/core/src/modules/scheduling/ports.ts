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
  readonly seasonId: string;
  readonly changes: unknown;
  /** The revision of the season's schedule the draft was started on; null before the first publication. */
  readonly basedOnRevision: number | null;
  readonly version: number;
};

export type SchedulingStore = {
  /** The program a season belongs to, or undefined if the season is not in this league. */
  readonly findSeason: (seasonId: string) => Promise<{ readonly programId: string } | undefined>;
  /** The number of the season's latest published schedule revision, or null if none yet. */
  readonly latestRevision: (seasonId: string) => Promise<number | null>;
  readonly findDraft: (seasonId: string) => Promise<DraftRecord | undefined>;
  /** Starts the season's draft: its version (1), or 'exists' if the season already has one. */
  readonly insertDraft: (
    seasonId: string,
    changes: DraftDocument,
    basedOnRevision: number | null,
  ) => Promise<number | 'exists'>;
  /** Saves the draft's changes if it is still at `version` (A-8, T-46): the new version, or undefined. */
  readonly updateDraft: (
    seasonId: string,
    changes: DraftDocument,
    version: number,
  ) => Promise<number | undefined>;
  /** Removes the draft if it is still at `version`; false if it is not there or moved on. */
  readonly deleteDraft: (seasonId: string, version: number) => Promise<boolean>;
  /**
   * The season's published schedule as the rules read it: its rounds and its games not in
   * the bin that have a date, with dates and times in the league's time zone and a game's
   * court by name. A round with no label is called "Round n".
   */
  readonly loadSchedule: (seasonId: string) => Promise<ScheduleState>;
  /** Which of these teams are teams of the season that are not in the bin. */
  readonly teamsOfSeason: (
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
};

/** A scheduling command's transaction: its store, the permission reader and the activity log. */
export type SchedulingTx = CommandTx & {
  readonly scheduling: SchedulingStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
