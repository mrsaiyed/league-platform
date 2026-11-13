// What a division query returns: built field by field (T-29), so a new private column
// reaches no caller until someone adds it here.

export type DivisionSummary = {
  id: string;
  seasonId: string;
  parentDivisionId: string | null;
  name: string;
  color: string | null;
  sort: number;
  /** In the bin (A-5). */
  binned: boolean;
  version: number;
};

/** The columns divisionSummary reads. */
export const divisionSummaryColumns = [
  'id',
  'season_id',
  'parent_division_id',
  'name',
  'color',
  'sort',
  'deleted_at',
  'version',
] as const;

type DivisionRow = {
  id: string;
  season_id: string;
  parent_division_id: string | null;
  name: string;
  color: string | null;
  sort: number;
  deleted_at: Date | null;
  version: number;
};

export function divisionSummary(row: DivisionRow): DivisionSummary {
  return {
    id: row.id,
    seasonId: row.season_id,
    parentDivisionId: row.parent_division_id,
    name: row.name,
    color: row.color,
    sort: row.sort,
    binned: row.deleted_at !== null,
    version: row.version,
  };
}
