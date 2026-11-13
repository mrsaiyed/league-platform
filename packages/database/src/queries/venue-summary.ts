// What the venue and court queries return: built field by field (T-29), so a new
// private column reaches no caller until someone adds it here.

export type VenueSummary = {
  id: string;
  name: string;
  address: string | null;
  mapLink: string | null;
  /** In the bin (A-5). */
  binned: boolean;
  version: number;
};

export type CourtSummary = {
  id: string;
  venueId: string;
  name: string;
  sort: number;
  /** In the bin (A-5). */
  binned: boolean;
  version: number;
};

export const venueSummaryColumns = [
  'id',
  'name',
  'address',
  'map_link',
  'deleted_at',
  'version',
] as const;

export const courtSummaryColumns = [
  'id',
  'venue_id',
  'name',
  'sort',
  'deleted_at',
  'version',
] as const;

type VenueRow = {
  id: string;
  name: string;
  address: string | null;
  map_link: string | null;
  deleted_at: Date | null;
  version: number;
};

type CourtRow = {
  id: string;
  venue_id: string;
  name: string;
  sort: number;
  deleted_at: Date | null;
  version: number;
};

export function venueSummary(row: VenueRow): VenueSummary {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    mapLink: row.map_link,
    binned: row.deleted_at !== null,
    version: row.version,
  };
}

export function courtSummary(row: CourtRow): CourtSummary {
  return {
    id: row.id,
    venueId: row.venue_id,
    name: row.name,
    sort: row.sort,
    binned: row.deleted_at !== null,
    version: row.version,
  };
}
