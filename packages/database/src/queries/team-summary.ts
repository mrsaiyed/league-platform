// What a team query returns: built field by field (T-29), so a new private column
// reaches no caller until someone adds it here.

export type TeamSummary = {
  id: string;
  seasonId: string;
  divisionId: string | null;
  slug: string;
  name: string;
  color: string | null;
  statsVisibility: string;
  lineageId: string;
  /** In the bin (A-5). */
  binned: boolean;
  version: number;
};

/** The columns teamSummary reads. */
export const teamSummaryColumns = [
  'id',
  'season_id',
  'division_id',
  'slug',
  'name',
  'color',
  'stats_visibility',
  'lineage_id',
  'deleted_at',
  'version',
] as const;

type TeamRow = {
  id: string;
  season_id: string;
  division_id: string | null;
  slug: string;
  name: string;
  color: string | null;
  stats_visibility: string;
  lineage_id: string;
  deleted_at: Date | null;
  version: number;
};

export function teamSummary(row: TeamRow): TeamSummary {
  return {
    id: row.id,
    seasonId: row.season_id,
    divisionId: row.division_id,
    slug: row.slug,
    name: row.name,
    color: row.color,
    statsVisibility: row.stats_visibility,
    lineageId: row.lineage_id,
    binned: row.deleted_at !== null,
    version: row.version,
  };
}
