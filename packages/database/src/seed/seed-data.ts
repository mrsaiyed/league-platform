// The two made-up seed leagues (T-195) as plain data. Every name, address and team is
// invented; email addresses end in .test, which can never be a real mailbox. Nothing here
// is a person. A league is data: the loader (seed-leagues.ts) reads this list and
// treats every entry the same way, so adding a third league means adding an entry.
import type { StartingDesignKey } from '@srleagues/contracts';
import type { Audience, Role } from '@srleagues/core';

export type SeedMember = {
  readonly email: string;
  readonly displayName: string;
  /** The role the account holds: across the whole league, or in one program only. */
  readonly role: Role;
  /** The short name of the league's other program the role is limited to (`programs`). */
  readonly program?: string;
  /**
   * The short name of the season's team a coach's or captain's role is for: such a role is
   * always one team's (T3 §5). The team's staff see its players' numbers where the team
   * keeps them from the public (S-22, step 2.46).
   */
  readonly team?: string;
};

/** A program of the league besides its hidden default one (U-3, U-12). */
export type SeedProgram = { readonly slug: string; readonly name: string };

export type SeedTeam = {
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
};

export type SeedDivision = { readonly name: string; readonly teams: readonly SeedTeam[] };

/**
 * A person added to the league's list by hand. The private fields are made up too: they
 * are there so the public pages' scans (T-81) have private values to look for.
 */
export type SeedPerson = {
  readonly firstName: string;
  readonly lastName: string;
  readonly contactEmail?: string;
  readonly birthDate?: string;
  /** Left out: the league does not know (R-15). */
  readonly isMinor?: boolean;
};

export type SeedLeague = {
  readonly slug: string;
  readonly name: string;
  readonly timeZone: string;
  /** Who plays: decides who counts as a child when their age is not known (R-15). */
  readonly audience: Audience;
  /** The starting design its first site release is published in (step 2.187). */
  readonly design: StartingDesignKey;
  readonly owner: { readonly email: string; readonly displayName: string };
  readonly members: readonly SeedMember[];
  /**
   * Programs besides the default one, with no season, so a role can be limited to one
   * that is not the season's: what shows a scheduler of another program is told nothing
   * of a season not public yet (P4 §4, step 2.93 part 4).
   */
  readonly programs?: readonly SeedProgram[];
  readonly season: { readonly slug: string; readonly name: string };
  readonly divisions: readonly SeedDivision[];
  /** People added to the league's list by hand. */
  readonly people: readonly SeedPerson[];
};

/** The account that creates the leagues, as our own staff does (A-3). */
export const seedStaff = { email: 'seed-staff@example.test', displayName: 'Seed Staff' } as const;

export const seedLeagues: readonly SeedLeague[] = [
  {
    slug: 'lakeside',
    name: 'Lakeside Hoops League',
    timeZone: 'America/Chicago',
    audience: 'adult',
    design: 'crest',
    owner: { email: 'owner@lakeside.example.test', displayName: 'Ola Lakeside' },
    members: [
      { email: 'admin@lakeside.example.test', displayName: 'Adele Admin', role: 'admin' },
      { email: 'scheduler@lakeside.example.test', displayName: 'Sam Scheduler', role: 'scheduler' },
      { email: 'scorer@lakeside.example.test', displayName: 'Sky Scorer', role: 'scorekeeper' },
      // A scheduler of the league's other program only, not of the season's.
      {
        email: 'camp-scheduler@lakeside.example.test',
        displayName: 'Cam Scheduler',
        role: 'scheduler',
        program: 'summer-camp',
      },
      // A coach of each of two teams, by a role on that one team (step 2.46).
      {
        email: 'herons-coach@lakeside.example.test',
        displayName: 'Hollis Coach',
        role: 'coach',
        team: 'herons',
      },
      {
        email: 'otters-coach@lakeside.example.test',
        displayName: 'Oakley Coach',
        role: 'coach',
        team: 'otters',
      },
    ],
    programs: [{ slug: 'summer-camp', name: 'Summer Camp' }],
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
      {
        // Not "Pat": the name scans look for a withheld first name anywhere in a page, and
        // "pat" is in every drawn shield's <path>.
        firstName: 'Morgan',
        lastName: 'Example',
        contactEmail: 'morgan@lakeside.example.test',
        birthDate: '1990-04-12',
        isMinor: false,
      },
      // A child in an adult league: shown by first name and last initial (R-14).
      { firstName: 'Quinn', lastName: 'Sample', birthDate: '2012-09-03', isMinor: true },
      { firstName: 'Robin', lastName: 'Placeholder', contactEmail: 'robin@lakeside.example.test' },
    ],
  },
  {
    slug: 'maple-street',
    name: 'Maple Street Rec League',
    timeZone: 'America/New_York',
    // A youth league: a player whose age is not known is shown as a child (R-15).
    audience: 'youth',
    // Not the neutral design, so its pages show it is drawn in a design of its own.
    design: 'midnight-gold',
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
      {
        firstName: 'Jordan',
        lastName: 'Imaginary',
        contactEmail: 'jordan.parent@maple.example.test',
        birthDate: '2013-06-02',
        isMinor: true,
      },
      { firstName: 'Casey', lastName: 'Fictional' },
    ],
  },
];
