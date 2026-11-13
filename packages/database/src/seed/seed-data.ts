// The two made-up seed leagues (T-195) as plain data. Every name, address and team is
// invented; email addresses end in .test, which can never be a real mailbox. Nothing here
// is a person. A league is data: the loader (seed-leagues.ts) reads this list and
// treats every entry the same way, so adding a third league means adding an entry.
import type { Role } from '@srleagues/core';

export type SeedMember = {
  readonly email: string;
  readonly displayName: string;
  /** The role the account holds across the whole league. */
  readonly role: Role;
};

export type SeedTeam = {
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
};

export type SeedDivision = { readonly name: string; readonly teams: readonly SeedTeam[] };

export type SeedLeague = {
  readonly slug: string;
  readonly name: string;
  readonly timeZone: string;
  /** A starting design key of packages/site; the web app checks it is a real one. */
  readonly design: string;
  readonly owner: { readonly email: string; readonly displayName: string };
  readonly members: readonly SeedMember[];
  readonly season: { readonly slug: string; readonly name: string };
  readonly divisions: readonly SeedDivision[];
  /** Names of people added to the league's list by hand. */
  readonly people: readonly { readonly firstName: string; readonly lastName: string }[];
};

/** The account that creates the leagues, as our own staff does (A-3). */
export const seedStaff = { email: 'seed-staff@example.test', displayName: 'Seed Staff' } as const;

export const seedLeagues: readonly SeedLeague[] = [
  {
    slug: 'lakeside',
    name: 'Lakeside Hoops League',
    timeZone: 'America/Chicago',
    design: 'midnight-gold',
    owner: { email: 'owner@lakeside.example.test', displayName: 'Ola Lakeside' },
    members: [
      { email: 'admin@lakeside.example.test', displayName: 'Adele Admin', role: 'admin' },
      { email: 'scheduler@lakeside.example.test', displayName: 'Sam Scheduler', role: 'scheduler' },
      { email: 'scorer@lakeside.example.test', displayName: 'Sky Scorer', role: 'scorekeeper' },
    ],
    season: { slug: 'winter-seed', name: 'Winter Season' },
    divisions: [
      {
        name: 'North',
        teams: [
          { name: 'Lakeside Herons', shortName: 'herons', color: '#2f6fb0' },
          { name: 'Lakeside Otters', shortName: 'otters', color: '#8a5a2b' },
          { name: 'Lakeside Pines', shortName: 'pines', color: '#2d7a4b' },
        ],
      },
      {
        name: 'South',
        teams: [
          { name: 'Lakeside Gulls', shortName: 'gulls', color: '#7a7a7a' },
          { name: 'Lakeside Foxes', shortName: 'foxes', color: '#c0562a' },
          { name: 'Lakeside Owls', shortName: 'owls', color: '#6b4aa0' },
        ],
      },
    ],
    people: [
      { firstName: 'Pat', lastName: 'Example' },
      { firstName: 'Quinn', lastName: 'Sample' },
      { firstName: 'Robin', lastName: 'Placeholder' },
    ],
  },
  {
    slug: 'maple-street',
    name: 'Maple Street Rec League',
    timeZone: 'America/New_York',
    design: 'clean-court',
    owner: { email: 'owner@maple.example.test', displayName: 'Mara Maple' },
    members: [
      { email: 'admin@maple.example.test', displayName: 'Abe Admin', role: 'admin' },
      { email: 'editor@maple.example.test', displayName: 'Edie Editor', role: 'editor' },
    ],
    season: { slug: 'spring-seed', name: 'Spring Season' },
    divisions: [
      {
        name: 'Open',
        teams: [
          { name: 'Maple Comets', shortName: 'comets', color: '#d1342f' },
          { name: 'Maple Rockets', shortName: 'rockets', color: '#1f4fa3' },
          { name: 'Maple Hawks', shortName: 'hawks', color: '#2c2c2c' },
          { name: 'Maple Bears', shortName: 'bears', color: '#7b4a21' },
        ],
      },
    ],
    people: [
      { firstName: 'Jordan', lastName: 'Imaginary' },
      { firstName: 'Casey', lastName: 'Fictional' },
    ],
  },
];
