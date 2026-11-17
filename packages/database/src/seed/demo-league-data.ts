// The made-up league shaped like the demo league (step 2.59, T-195; P9 §3, F-6): a large
// association's one program, a 2026–27 season, several districts as divisions, dozens of
// teams, one team's games scored live in the tracker and every other team's results as
// final scores. It is shaped like a big league, never a copy of one: every league, school,
// place, venue and person here is invented, and the email addresses end in .test.
//
// The schedule and its results are not here: they are the fixtures file in
// supabase/seed/demo-league, which the loader (seed-demo-league.ts) imports through the
// product's own fixture import, and which doubles as the template for real results. The
// tracked team's games are made up as a backup of the current live tracker would hold them
// (demo-tracker-backup.ts) and brought in by the transfer (step 2.58).
import type { StartingDesignKey } from '@srleagues/contracts';
import type { Audience } from '@srleagues/core';
import type { SeedMember } from './seed-data.ts';

export type DemoTeam = {
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  /** The school's own gym, where its home games are played. */
  readonly venue: { readonly name: string; readonly address: string };
};

export type DemoDivision = { readonly name: string; readonly teams: readonly DemoTeam[] };

/** A player as the tracker keeps them: their number and their full name. */
export type DemoTrackerPlayer = readonly [jersey: string, name: string];

export type DemoLeague = {
  readonly slug: string;
  readonly name: string;
  readonly timeZone: string;
  /** School teams: its players are students, shown as children are (R-14, R-15). */
  readonly audience: Audience;
  readonly design: StartingDesignKey;
  readonly owner: { readonly email: string; readonly displayName: string };
  /** Grants across the whole league; the admin is the one who runs the transfer. */
  readonly members: readonly SeedMember[];
  readonly season: { readonly slug: string; readonly name: string };
  readonly divisions: readonly DemoDivision[];
  /** The fixtures file, from the repository's root: games, times, venues, final scores. */
  readonly fixturesFile: string;
  /** The team whose games were scored live in the tracker, by its short name. */
  readonly trackedTeam: string;
  /**
   * The made-up tracker's rosters, by team short name: the tracked team's and those of
   * the teams it played, as the tracker keeps both sides' players.
   */
  readonly trackerPlayers: Readonly<Record<string, readonly DemoTrackerPlayer[]>>;
  /**
   * Surnames every made-up player has one of. Each is a word, not a family name, so no
   * player can be mistaken for a real student (the seed's no-real-names check reads it).
   */
  readonly madeUpSurnames: readonly string[];
};

const team = (name: string, shortName: string, color: string, address: string): DemoTeam => ({
  name,
  shortName,
  color,
  venue: { name: `${name} Gym`, address },
});

export const demoLeague: DemoLeague = {
  slug: 'larkvale',
  name: 'Larkvale Charter Athletic Association',
  timeZone: 'America/Chicago',
  audience: 'youth',
  design: 'clean-court',
  owner: { email: 'owner@larkvale.example.test', displayName: 'Lark Owner' },
  members: [
    { email: 'admin@larkvale.example.test', displayName: 'Lark Admin', role: 'admin' },
    { email: 'scheduler@larkvale.example.test', displayName: 'Lark Scheduler', role: 'scheduler' },
    { email: 'scorer@larkvale.example.test', displayName: 'Lark Scorer', role: 'scorekeeper' },
  ],
  season: { slug: '2026-27', name: '2026–27' },
  divisions: [
    {
      name: 'District 1',
      teams: [
        team('Amberwick Academy', 'amberwick', '#1d4e89', '100 Lantern Road'),
        team('Briarquill Prep', 'briarquill', '#7a1f2b', '107 Quillstone Road'),
        team('Cobaltine Charter', 'cobaltine', '#2456a6', '114 Copperbell Road'),
        team('Dunmorrow STEM', 'dunmorrow', '#3c6e47', '121 Mistral Road'),
        team('Elderfen Collegiate', 'elderfen', '#5b3a8c', '128 Harrowgate Road'),
        team('Fernquill Academy', 'fernquill', '#2f7d6d', '135 Tinderbox Road'),
      ],
    },
    {
      name: 'District 2',
      teams: [
        team('Glimmerstone Prep', 'glimmerstone', '#8c6d1f', '142 Bramblecourt Road'),
        team('Hazelmoor Collegiate', 'hazelmoor', '#0f5c4a', '149 Saltmarsh Road'),
        team('Ironwhistle Charter', 'ironwhistle', '#4a4a4a', '156 Whistledown Road'),
        team('Junipine Academy', 'junipine', '#2e6b30', '163 Thistlecroft Road'),
        team('Kestrelmark STEM', 'kestrelmark', '#a3461f', '170 Ravenmoss Road'),
        team('Lindenquay Prep', 'lindenquay', '#1f5f8c', '177 Gilderwisp Road'),
      ],
    },
    {
      name: 'District 3',
      teams: [
        team('Marrowbrook Academy', 'marrowbrook', '#6b2d5c', '184 Lantern Road'),
        team('Nettlewyn Charter', 'nettlewyn', '#3d7a2a', '191 Quillstone Road'),
        team('Oakmistle Prep', 'oakmistle', '#7b5a2e', '198 Copperbell Road'),
        team('Pebblewick Collegiate', 'pebblewick', '#335c99', '205 Mistral Road'),
        team('Quarrymoor STEM', 'quarrymoor', '#6e6e2a', '212 Harrowgate Road'),
        team('Rushfennel Academy', 'rushfennel', '#9c2f2f', '219 Tinderbox Road'),
      ],
    },
    {
      name: 'District 4',
      teams: [
        team('Sablewynd Prep', 'sablewynd', '#2b2b5c', '226 Bramblecourt Road'),
        team('Thornquist Charter', 'thornquist', '#5c7a1f', '233 Saltmarsh Road'),
        team('Umberfell Collegiate', 'umberfell', '#8a4b1d', '240 Whistledown Road'),
        team('Vantmesa Academy', 'vantmesa', '#1f7a7a', '247 Thistlecroft Road'),
        team('Willowquill STEM', 'willowquill', '#4f6b2e', '254 Ravenmoss Road'),
        team('Yarrowmere Prep', 'yarrowmere', '#7a3d1f', '261 Gilderwisp Road'),
      ],
    },
  ],
  fixturesFile: 'supabase/seed/demo-league/fixtures.csv',
  trackedTeam: 'hazelmoor',
  trackerPlayers: {
    hazelmoor: [
      ['0', 'Avery Madeup'],
      ['4', 'Blake Testerly'],
      ['12', 'Cameron Pretend'],
      ['20', 'Dakota Placeholt'],
      ['24', 'Emerson Fictive'],
      ['33', 'Finley Inventa'],
      ['1', 'Gray Notreal'],
      ['5', 'Harper Dreamley'],
      ['13', 'Jules Imagino'],
      ['21', 'Kendall Storyfield'],
      ['25', 'Logan Sampleby'],
      ['34', 'Marlow Makebelieve'],
    ],
    glimmerstone: [
      ['20', 'Noel Mockwell'],
      ['24', 'Oakley Madeup'],
      ['33', 'Parker Testerly'],
      ['1', 'Quincy Pretend'],
      ['5', 'Reese Placeholt'],
      ['13', 'Sawyer Fictive'],
      ['21', 'Tatum Inventa'],
      ['25', 'Wren Notreal'],
      ['34', 'Arlo Dreamley'],
    ],
    ironwhistle: [
      ['34', 'Bodhi Imagino'],
      ['2', 'Callum Storyfield'],
      ['10', 'Dorian Sampleby'],
      ['14', 'Ellis Makebelieve'],
      ['22', 'Flynn Mockwell'],
      ['30', 'Gideon Madeup'],
      ['35', 'Hollis Testerly'],
      ['3', 'Jasper Pretend'],
      ['11', 'Kit Placeholt'],
    ],
    junipine: [
      ['11', 'Lennox Fictive'],
      ['15', 'Milo Inventa'],
      ['23', 'Nico Notreal'],
      ['32', 'Orion Dreamley'],
      ['0', 'Rowan Imagino'],
      ['4', 'Silas Storyfield'],
      ['12', 'Teo Sampleby'],
      ['20', 'Wells Makebelieve'],
      ['24', 'Zeke Mockwell'],
    ],
    kestrelmark: [
      ['24', 'Bram Madeup'],
      ['33', 'Cyrus Testerly'],
      ['1', 'Dex Pretend'],
      ['5', 'Ezra Placeholt'],
      ['13', 'Fitz Fictive'],
      ['21', 'Hayes Inventa'],
      ['25', 'Idris Notreal'],
      ['34', 'Joss Dreamley'],
      ['2', 'Knox Imagino'],
    ],
    lindenquay: [
      ['2', 'Lev Storyfield'],
      ['10', 'Mack Sampleby'],
      ['14', 'Nash Makebelieve'],
      ['22', 'Otis Mockwell'],
      ['30', 'Pike Madeup'],
      ['35', 'Rhys Testerly'],
      ['3', 'Soren Pretend'],
      ['11', 'Tobin Placeholt'],
      ['15', 'Vance Fictive'],
    ],
  },
  madeUpSurnames: [
    'Madeup',
    'Pretend',
    'Fictive',
    'Notreal',
    'Imagino',
    'Sampleby',
    'Mockwell',
    'Testerly',
    'Placeholt',
    'Inventa',
    'Dreamley',
    'Storyfield',
    'Makebelieve',
  ],
};
