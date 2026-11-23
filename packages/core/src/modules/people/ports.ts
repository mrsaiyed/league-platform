// What the people module needs from storage. packages/database supplies it, bound to
// one transaction for one league, so none of these take a league id (T-28).
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';
import type { Audience, StoredSettingRow } from '../leagues/index.ts';
import type { NameRequest } from './rules/name-policy.ts';

/** What only people allowed to see sensitive fields are given (R-16, T-76). */
export type PersonSensitiveFields = {
  readonly contactEmail: string | null;
  /** A date, `2011-04-05`; the league only has one where it asks for it. */
  readonly birthDate: string | null;
  /** Null when the league does not know. */
  readonly isMinor: boolean | null;
};

/**
 * A person as one league knows them, in or out of the bin. `sensitive` is there only
 * when the query was asked for it, which the command does only for a role holding
 * `people.read_sensitive`: for anyone else the query does not select those columns
 * at all, so the key is absent, not empty (T-76).
 */
export type PersonRecord = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  /** The name the person asked to be shown by, if any (R-15). */
  readonly publicName: string | null;
  /** What they asked for on public pages: none, initials or removed. */
  readonly visibility: string;
  /** In the bin (A-5, T-45). */
  readonly binned: boolean;
  readonly version: number;
  readonly sensitive?: PersonSensitiveFields;
};

export type NewPerson = {
  readonly firstName: string;
  readonly lastName: string;
  readonly publicName: string | null;
} & PersonSensitiveFields;

/** What a person change sets; a field left out stays as it is, null clears. */
export type PersonChange = {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly publicName?: string | null;
  readonly contactEmail?: string | null;
  readonly birthDate?: string | null;
  readonly isMinor?: boolean | null;
  /** What they asked for on public pages (R-23): set only by setNameRequest. */
  readonly visibility?: NameRequest;
};

export type PeopleSearch = {
  /** Part of a name, in any capitals; never part of an email, whoever asks. */
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
  /** Whether the sensitive columns are selected at all. */
  readonly sensitive: boolean;
};

export type PeopleStore = {
  /** The person with this id, in the bin or not, or undefined if not in this league. */
  readonly find: (personId: string, sensitive: boolean) => Promise<PersonRecord | undefined>;
  /** People not in the bin, by last name, first name, then id. */
  readonly list: (search: PeopleSearch) => Promise<readonly PersonRecord[]>;
  /** Adds one: its id. */
  readonly create: (person: NewPerson) => Promise<string>;
  /**
   * Changes a person not in the bin if still at `version` (T-46): the new version, or
   * undefined if they are not there or moved on.
   */
  readonly update: (
    personId: string,
    change: PersonChange,
    version: number,
  ) => Promise<number | undefined>;
  /** Moves a person to the bin or brings them back: false if they are not there. */
  readonly setBinned: (personId: string, binned: boolean) => Promise<boolean>;
  /**
   * Whether the person is on a team's roster now: an entry with no leaving date, on a
   * team not in the bin (A-16: a place on a team in the bin does not hold them).
   */
  readonly isOnRoster: (personId: string) => Promise<boolean>;
  /**
   * Who plays in the league (adult, youth or mixed), which decides who counts as a child
   * when their age is not known (R-15, R-25). A league whose audience cannot be read
   * counts as youth: the careful reading.
   */
  readonly leagueAudience: () => Promise<Audience>;
  /**
   * Whether the person counts as a child (R-28, the rule isMinorOn states), on the league's
   * own today by the database's clock: true, false, or null where the league does not know.
   * Worked out where the birth date is kept, so the date never leaves it (record 080). A
   * person not in this league counts as a child: the careful reading.
   */
  readonly isMinor: (personId: string) => Promise<boolean | null>;
  /**
   * The league's own today (yyyy-mm-dd) in its own time zone, by the store's clock: a
   * birth date may not be after it (the day R-28 measures an age on).
   */
  readonly leagueToday: () => Promise<string>;
  /** The league's own stored values of one setting (the name policy's, R-25). */
  readonly leagueSettingRows: (key: string) => Promise<readonly StoredSettingRow[]>;
};

/** A people command's transaction: its store, the permission reader and the activity log. */
export type PeopleTx = CommandTx & {
  readonly people: PeopleStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
