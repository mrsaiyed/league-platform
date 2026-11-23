// What the two seed leagues (seed-data.ts) gain once their seasons are under way (step
// 2.59, T-195): a venue with its courts, where the seed's one game scored live through the
// tracker is played. Every name here is made up. Kept apart from seed-data.ts, which other
// steps change, and keyed by the league's short name, as the data names it.

export type SeedVenue = {
  readonly name: string;
  readonly address: string;
  readonly courts: readonly string[];
};

/** Each seed league's venue, by the league's short name. */
export const seedVenues: Readonly<Record<string, SeedVenue>> = {
  lakeside: {
    name: 'Lakeside Community Gym',
    address: '100 Shoreline Way, Lakeside',
    courts: ['Court 1', 'Court 2'],
  },
  'maple-street': {
    name: 'Maple Street Rec Center',
    address: '42 Maple Street',
    courts: ['Main Court'],
  },
};

/** How many days ago the tracked game was played, at the seed's usual start time. */
export const trackedGameDaysAgo = 3;
