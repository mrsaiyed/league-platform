// What the people module needs from storage. packages/database supplies it, bound to
// one transaction for one league, so none of these take a league id (T-28).
import type { CommandTx } from '../../command/index.ts';
import type { AccessReader, ActivityLog } from '../access/index.ts';

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
};

export type PeopleSearch = {
  /** Part of a name (and, when `sensitive`, of a contact email), in any capitals. */
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
  /** Whether the person is on a team's roster now (an entry with no leaving date). */
  readonly isOnRoster: (personId: string) => Promise<boolean>;
};

/** A people command's transaction: its store, the permission reader and the activity log. */
export type PeopleTx = CommandTx & {
  readonly people: PeopleStore;
  readonly access: AccessReader;
  readonly activity: ActivityLog;
};
