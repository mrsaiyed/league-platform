// The made-up league shaped like the demo league (step 2.59, T-195; P9 §3, F-6): a large
// association's one program, a 2025–26 season played from November to January, several
// districts as divisions, dozens of teams, one team's games scored live in the tracker and
// every other team's results as final scores. It is shaped like a big league, never a copy
// of one: every league, school, place, venue and person here is invented, and the email
// addresses end in .test.
//
// The schedule and its results are not here: they are the fixtures file in
// supabase/seed/demo-league, which the loader (seed-demo-league.ts) imports through the
// product's own fixture import, and which doubles as the template for real results. Its
// results were played from each school's `strength` below (a home side a few points better
// than on the road); the tracked team's games, which the file leaves without a score, are
// made up from the same strengths as a backup of the current live tracker would hold them
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
  /** How good the team is, from -1 to 1: what its results were played from. */
  readonly strength: number;
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
   * The made-up tracker's rosters, by team short name, each team's five starters first:
   * the tracked team's and those of the teams it played, as the tracker keeps both sides'
   * players.
   */
  readonly trackerPlayers: Readonly<Record<string, readonly DemoTrackerPlayer[]>>;
  /**
   * Every made-up player's surname is one of these coined words, in the style of the
   * school names: no real family name. The seed's checks read this one list (no surname
   * in full on a public page, and none of them a real name).
   */
  readonly madeUpSurnames: readonly string[];
};

const team = (
  name: string,
  shortName: string,
  color: string,
  address: string,
  strength: number,
): DemoTeam => ({ name, shortName, color, venue: { name: `${name} Gym`, address }, strength });

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
  season: { slug: '2025-26', name: '2025–26' },
  divisions: [
    {
      name: 'District 1',
      teams: [
        team('Nettlewyn Charter', 'nettlewyn', '#1d4e89', '100 Lanternwick Road', 0.55),
        team('Amberwick Collegiate', 'amberwick', '#7a1f2b', '107 Quillstone Road', -0.1),
        team('Sablewynd Prep', 'sablewynd', '#2456a6', '114 Copperbell Road', 0.2),
        team('Kestrelmark STEM', 'kestrelmark', '#3c6e47', '121 Mistralen Road', -0.35),
        team('Dunmorrow Academy', 'dunmorrow', '#5b3a8c', '128 Gorsebury Road', 0.05),
        team('Willowquill Prep', 'willowquill', '#2f7d6d', '135 Tinderlark Road', -0.25),
      ],
    },
    {
      name: 'District 2',
      teams: [
        team('Glimmerstone Academy', 'glimmerstone', '#8c6d1f', '142 Bramblecourt Road', 0.3),
        team('Hazelmoor Collegiate', 'hazelmoor', '#0f5c4a', '149 Saltwhistle Road', 0.15),
        team('Pebblewick Charter', 'pebblewick', '#4a4a4a', '156 Dapplebrook Road', -0.2),
        team('Junipine STEM', 'junipine', '#2e6b30', '163 Thistlecroft Road', 0.0),
        team('Umberfell Prep', 'umberfell', '#a3461f', '170 Ravenmoss Road', -0.35),
        team('Briarquill Academy', 'briarquill', '#1f5f8c', '177 Gilderwisp Road', 0.1),
      ],
    },
    {
      name: 'District 3',
      teams: [
        team('Marrowbrook Prep', 'marrowbrook', '#6b2d5c', '184 Lanternwick Road', 0.85),
        team('Cobaltine Academy', 'cobaltine', '#3d7a2a', '191 Quillstone Road', -0.05),
        team('Yarrowmere Charter', 'yarrowmere', '#7b5a2e', '198 Copperbell Road', 0.15),
        team('Fernquill Collegiate', 'fernquill', '#335c99', '205 Mistralen Road', -0.3),
        team('Tamblewick STEM', 'tamblewick', '#6e6e2a', '212 Gorsebury Road', 0.25),
        team('Ironwhistle Academy', 'ironwhistle', '#9c2f2f', '219 Tinderlark Road', -0.15),
      ],
    },
    {
      name: 'District 4',
      teams: [
        team('Quarrymoor Charter', 'quarrymoor', '#2b2b5c', '226 Bramblecourt Road', -0.85),
        team('Lindenquay Academy', 'lindenquay', '#5c7a1f', '233 Saltwhistle Road', 0.2),
        team('Elderfen Prep', 'elderfen', '#8a4b1d', '240 Dapplebrook Road', 0.4),
        team('Vantmesa Collegiate', 'vantmesa', '#1f7a7a', '247 Thistlecroft Road', 0.0),
        team('Oakmistle Charter', 'oakmistle', '#4f6b2e', '254 Ravenmoss Road', -0.2),
        team('Rushfennel STEM', 'rushfennel', '#7a3d1f', '261 Gilderwisp Road', 0.1),
      ],
    },
  ],
  fixturesFile: 'supabase/seed/demo-league/fixtures.csv',
  trackedTeam: 'hazelmoor',
  trackerPlayers: {
    hazelmoor: [
      ['3', 'Kit Cindermarsh'],
      ['33', 'Jasper Dapplemere'],
      ['20', 'Cyrus Gorsewick'],
      ['11', 'Tatum Quenderwick'],
      ['52', 'Rowan Bramblequill'],
      ['0', 'Joss Larkspindle'],
      ['1', 'Marlow Emberwhit'],
      ['15', 'Gray Saltmere'],
      ['21', 'Fitz Mossglade'],
      ['42', 'Reese Thistlewyn'],
      ['34', 'Vance Copperwick'],
      ['13', 'Hayes Kettleburr'],
    ],
    glimmerstone: [
      ['52', 'Jules Saltmere'],
      ['44', 'Nash Quenderwick'],
      ['10', 'Lev Brindlemoor'],
      ['33', 'Arlo Wrenhallow'],
      ['31', 'Finley Copperwick'],
      ['3', 'Quincy Ravelthorn'],
      ['11', 'Teo Thistlewyn'],
      ['14', 'Tobin Fallowmint'],
      ['42', 'Silas Kettleburr'],
    ],
    pebblewick: [
      ['12', 'Kendall Cindermarsh'],
      ['44', 'Logan Brindlemoor'],
      ['30', 'Ezra Gorsewick'],
      ['10', 'Lennox Fallowmint'],
      ['22', 'Cameron Copperwick'],
      ['32', 'Mack Wrenhallow'],
      ['4', 'Callum Saltmere'],
      ['42', 'Dex Quenderwick'],
      ['23', 'Noel Thistlewyn'],
    ],
    junipine: [
      ['0', 'Wells Brindlemoor'],
      ['20', 'Bodhi Kettleburr'],
      ['35', 'Dakota Dapplemere'],
      ['34', 'Avery Gorsewick'],
      ['22', 'Rhys Fallowmint'],
      ['3', 'Blake Quenderwick'],
      ['31', 'Hollis Emberwhit'],
      ['5', 'Zeke Thistlewyn'],
      ['4', 'Pike Bramblequill'],
    ],
    umberfell: [
      ['33', 'Wren Ravelthorn'],
      ['11', 'Bram Fallowmint'],
      ['20', 'Orion Saltmere'],
      ['22', 'Knox Mossglade'],
      ['21', 'Idris Dapplemere'],
      ['30', 'Sawyer Thistlewyn'],
      ['14', 'Dorian Quenderwick'],
      ['50', 'Nico Wrenhallow'],
      ['25', 'Gideon Emberwhit'],
    ],
    briarquill: [
      ['10', 'Ellis Wrenhallow'],
      ['2', 'Otis Kettleburr'],
      ['15', 'Soren Dapplemere'],
      ['22', 'Harper Copperwick'],
      ['11', 'Oakley Saltmere'],
      ['42', 'Emerson Brindlemoor'],
      ['50', 'Milo Cindermarsh'],
      ['13', 'Flynn Thistlewyn'],
      ['12', 'Parker Fallowmint'],
    ],
  },
  madeUpSurnames: [
    'Brindlemoor',
    'Thistlewyn',
    'Copperwick',
    'Saltmere',
    'Larkspindle',
    'Wrenhallow',
    'Emberwhit',
    'Cindermarsh',
    'Bramblequill',
    'Ravelthorn',
    'Quenderwick',
    'Mossglade',
    'Fallowmint',
    'Gorsewick',
    'Dapplemere',
    'Kettleburr',
  ],
};
