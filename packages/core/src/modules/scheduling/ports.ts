// What the scheduling module needs from storage for venues and courts. packages/database
// supplies it, bound to one transaction for one league, so none of these take a
// league id (T-28).
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';

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

export type SchedulingStore = {
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
