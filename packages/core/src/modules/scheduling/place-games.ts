// What the league's venues and courts have of games (step 2.49), as Admin → Schedule →
// Venues says before anything is removed, and as removing a court or a venue checks: how
// many games there have a final or forfeited result, and how many have none yet
// (scheduled, postponed, or being played now), in the published schedule or in a season's
// schedule draft. A cancelled game counts for neither, so it never holds a place.
//
// A published game counts where it is published, even when the draft moves it away or
// removes it: the public sees it there until the draft is published. A game the draft adds
// at a place, or moves there, counts there too, as "in the draft". A draft this code cannot
// read adds nothing.
import { parseDraftDocument } from './draft-document.ts';
import type { SchedulingTx, VenueWithCourts } from './ports.ts';
import { applyDraft } from './rules/apply-draft.ts';
import type { ScheduleGame } from './rules/schedule-types.ts';

export type PlaceGames = {
  /** Games with a final or forfeited result. */
  readonly played: number;
  /** Games without a result yet, published or only in a draft. */
  readonly toCome: number;
  /** Of those, the games only a draft puts here: not public until it is published. */
  readonly inDraft: number;
};

/** A venue's games, all its courts' and those with no court together, and each court's. */
export type VenueGames = PlaceGames & {
  readonly venueId: string;
  readonly courts: Readonly<Record<string, PlaceGames>>;
};

const none: PlaceGames = { played: 0, toCome: 0, inDraft: 0 };
const toComeStates: readonly string[] = ['scheduled', 'postponed', 'live'];

const plus = (a: PlaceGames, b: Partial<PlaceGames>): PlaceGames => ({
  played: a.played + (b.played ?? 0),
  toCome: a.toCome + (b.toCome ?? 0),
  inDraft: a.inDraft + (b.inDraft ?? 0),
});

const placeKey = (g: Pick<ScheduleGame, 'venueId' | 'court'>) =>
  `${g.venueId ?? ''}|${g.court ?? ''}`;

/** The games of each venue not in the bin, and of each of its courts not in the bin. */
export async function placeGamesOf(
  tx: SchedulingTx,
  venues: readonly VenueWithCourts[],
): Promise<readonly VenueGames[]> {
  const stored = await tx.scheduling.placeGames();
  const venueCounts = new Map<string, PlaceGames>();
  const courtCounts = new Map<string, PlaceGames>();
  const add = (venueId: string, courtId: string | null, counts: Partial<PlaceGames>) => {
    venueCounts.set(venueId, plus(venueCounts.get(venueId) ?? none, counts));
    if (courtId !== null) courtCounts.set(courtId, plus(courtCounts.get(courtId) ?? none, counts));
  };
  for (const row of stored.published) {
    add(row.venueId, row.courtId, { played: row.played, toCome: row.toCome });
  }
  // A draft names a court by its name at its venue.
  const courtIdOf = new Map<string, string>(
    venues.flatMap((v) => v.courts.map((c) => [`${v.id}|${c.name}`, c.id] as const)),
  );
  for (const draft of stored.drafts) {
    const document = parseDraftDocument(draft.changes);
    if (document === undefined || document.changes.length === 0) continue;
    const published = await tx.scheduling.loadSchedule(draft.seasonId);
    const wasAt = new Map(published.games.map((g) => [g.id, placeKey(g)]));
    const { state } = applyDraft(published, document.changes, []);
    for (const game of state.games) {
      if (game.venueId === null || !toComeStates.includes(game.status)) continue;
      if (wasAt.get(game.id) === placeKey(game)) continue;
      const courtId = game.court === null ? null : (courtIdOf.get(placeKey(game)) ?? null);
      add(game.venueId, courtId, { toCome: 1, inDraft: 1 });
    }
  }
  return venues.map((venue) => ({
    venueId: venue.id,
    ...(venueCounts.get(venue.id) ?? none),
    courts: Object.fromEntries(venue.courts.map((c) => [c.id, courtCounts.get(c.id) ?? none])),
  }));
}

/** The games of one venue (with `courtId`, of one court of it); none when it has none. */
export async function gamesAtPlace(
  tx: SchedulingTx,
  venueId: string,
  courtId?: string,
): Promise<PlaceGames> {
  const venues = await tx.scheduling.listVenues();
  const found = (await placeGamesOf(tx, venues)).find((v) => v.venueId === venueId);
  if (found === undefined) return none;
  return courtId === undefined ? found : (found.courts[courtId] ?? none);
}
