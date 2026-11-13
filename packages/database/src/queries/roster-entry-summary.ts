// What the roster queries return: built field by field (T-29). A date column is read
// as text (yyyy-mm-dd) so no time zone can move it.
import { sql } from 'kysely';

export type RosterEntrySummary = {
  id: string;
  teamId: string;
  personId: string;
  jerseyNumber: string | null;
  role: string;
  joinedOn: string | null;
  leftOn: string | null;
  sort: number;
  version: number;
};

type RosterEntryRow = {
  id: string;
  team_id: string;
  person_id: string;
  jersey_number: string | null;
  role: string;
  joined_on: string | null;
  left_on: string | null;
  sort: number;
  version: number;
};

/** The roster_entries columns the summary reads (dates as text). */
export const rosterEntryColumns = [
  'roster_entries.id as id',
  'roster_entries.team_id as team_id',
  'roster_entries.person_id as person_id',
  'roster_entries.jersey_number as jersey_number',
  'roster_entries.role as role',
  sql<string | null>`to_char(roster_entries.joined_on, 'YYYY-MM-DD')`.as('joined_on'),
  sql<string | null>`to_char(roster_entries.left_on, 'YYYY-MM-DD')`.as('left_on'),
  'roster_entries.sort as sort',
  'roster_entries.version as version',
] as const;

export function rosterEntrySummary(row: RosterEntryRow): RosterEntrySummary {
  return {
    id: row.id,
    teamId: row.team_id,
    personId: row.person_id,
    jerseyNumber: row.jersey_number,
    role: row.role,
    joinedOn: row.joined_on,
    leftOn: row.left_on,
    sort: row.sort,
    version: row.version,
  };
}
