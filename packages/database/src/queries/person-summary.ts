// What the people queries return: built field by field (T-29). The sensitive columns
// (contact email, birth date, minor or not) are in a list of their own that a query
// adds only when it is asked for them, which the command does only for a role holding
// `people.read_sensitive` (R-16, T-76): for anyone else the database is never asked
// for them, so they are not merely hidden afterwards.

export type PersonSummary = {
  id: string;
  firstName: string;
  lastName: string;
  publicName: string | null;
  visibility: string;
  /** In the bin (A-5). */
  binned: boolean;
  version: number;
  sensitive?: {
    contactEmail: string | null;
    birthDate: string | null;
    isMinor: boolean | null;
  };
};

/** The columns every people query selects. */
export const publicPersonColumns = [
  'id',
  'first_name',
  'last_name',
  'public_name',
  'visibility',
  'deleted_at',
  'version',
] as const;

/** The columns only a query asked for sensitive fields adds. */
export const sensitivePersonColumns = ['contact_email', 'birth_date', 'is_minor'] as const;

export const allPersonColumns = [...publicPersonColumns, ...sensitivePersonColumns] as const;

type PersonRow = {
  id: string;
  first_name: string;
  last_name: string;
  public_name: string | null;
  visibility: string;
  deleted_at: Date | null;
  version: number;
};

type SensitiveRow = {
  contact_email: string | null;
  birth_date: string | null;
  is_minor: boolean | null;
};

export function personSummary(row: PersonRow): PersonSummary {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    publicName: row.public_name,
    visibility: row.visibility,
    binned: row.deleted_at !== null,
    version: row.version,
  };
}

export function personSummaryWithSensitive(row: PersonRow & SensitiveRow): PersonSummary {
  return {
    ...personSummary(row),
    sensitive: {
      contactEmail: row.contact_email,
      birthDate: row.birth_date,
      isMinor: row.is_minor,
    },
  };
}
