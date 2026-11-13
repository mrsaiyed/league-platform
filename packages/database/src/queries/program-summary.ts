// What a program query returns: built field by field (T-29), so a new private
// column reaches no caller until someone adds it here.

export type ProgramSummary = {
  id: string;
  slug: string;
  name: string;
  sportKey: string;
  isDefault: boolean;
};

/** The columns programSummary reads. */
export const programSummaryColumns = ['id', 'slug', 'name', 'sport_key', 'is_default'] as const;

type ProgramRow = {
  id: string;
  slug: string;
  name: string;
  sport_key: string;
  is_default: boolean;
};

export function programSummary(row: ProgramRow): ProgramSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sportKey: row.sport_key,
    isDefault: row.is_default,
  };
}
