// THE STAND-IN'S MADE-UP CAST. FOR LOCAL WORK AND TESTS ONLY, NEVER FOR PRODUCTION.
//
// The made-up leagues (one in each state) and the made-up people who hold roles in them,
// by id: what the stand-in (stand-in-ports.ts), its one world (stand-in-world-seed.ts) and
// its names and designs (stand-in-league-sites.ts) all name. Every one is made up (T-201).
import type { LeagueStatus } from '@srleagues/core';
import type { SeedCast } from './stand-in-world-seed.ts';

type MadeUpLeague = {
  readonly id: string;
  readonly slug: string;
  /** Its own name, shown first in its header (U-8); its short name where it has none. */
  readonly name: string;
  readonly status: LeagueStatus;
  readonly inBin: boolean;
  readonly ownerAccountId: string;
  /** Former short names, still forwarding (U-7). */
  readonly formerSlugs: readonly string[];
};

type MadeUpPerson = { readonly accountId: string; readonly token: string };

const id = (n: number) => `01900000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

/** The made-up people. A token is the session cookie's value for being that person. */
export const standInPeople = {
  owner: { accountId: id(0xa1), token: 'local-owner-token' },
  scheduler: { accountId: id(0xa2), token: 'local-scheduler-token' },
  coach: { accountId: id(0xa3), token: 'local-coach-token' },
  stranger: { accountId: id(0xa4), token: 'local-stranger-token' },
  scorekeeper: { accountId: id(0xa5), token: 'local-scorekeeper-token' },
  // The other staff roles, in the draft league only (step 2.87).
  admin: { accountId: id(0xa6), token: 'local-admin-token' },
  registrar: { accountId: id(0xa7), token: 'local-registrar-token' },
  editor: { accountId: id(0xa8), token: 'local-editor-token' },
  clubAdmin: { accountId: id(0xa9), token: 'local-club-admin-token' },
  /** A scheduler for one program of the draft league only. */
  programScheduler: { accountId: id(0xaa), token: 'local-program-scheduler-token' },
  /** The admin of another league, a draft too, and nothing in the others. */
  otherAdmin: { accountId: id(0xab), token: 'local-other-admin-token' },
} as const satisfies Record<string, MadeUpPerson>;

function league(
  n: number,
  slug: string,
  status: LeagueStatus,
  formerSlugs: readonly string[] = [],
  name: string = slug,
): MadeUpLeague {
  const ownerAccountId = standInPeople.owner.accountId;
  return { id: id(n), slug, name, status, inBin: false, ownerAccountId, formerSlugs };
}

/**
 * The made-up leagues, one in each state, all owned by the made-up owner, and a
 * second draft league with an admin of its own who holds nothing elsewhere, to show
 * that one draft's staff do not see another's.
 */
export const standInLeagues = {
  live: league(1, 'north-valley', 'live', ['north-vale'], 'North Valley League'),
  other: league(2, 'harbor-city', 'live', [], 'Harbor City League'),
  draft: league(3, 'quiet-pines', 'draft', ['quiet-pine']),
  archived: league(4, 'old-meadow', 'archived'),
  suspended: league(5, 'closed-gate', 'suspended'),
  inBin: { ...league(6, 'binned-league', 'live'), inBin: true },
  otherDraft: league(7, 'still-waters', 'draft'),
} as const satisfies Record<string, MadeUpLeague>;

/** The draft league's one program: a made-up scheduler is given that program only. */
export const standInDraftProgramId = id(0xc1);

/** A made-up id of the cast's own kind (grants and the like). */
export const castId = id;

/** Who the one world's seed (stand-in-world-seed.ts) is made for. */
export const standInSeedCast: SeedCast = {
  adultLeague: standInLeagues.live,
  youthLeague: standInLeagues.other,
  // The draft league has the same tracked games, but scores assigned games only, and its
  // admin is given the live ones: its scorekeeper is refused those (P7 §5.1).
  draftLeague: standInLeagues.draft,
  draftProgramId: standInDraftProgramId,
  otherLeagues: [
    standInLeagues.archived,
    standInLeagues.suspended,
    standInLeagues.inBin,
    standInLeagues.otherDraft,
  ],
  // The made-up coach has a roster place on a team of each league.
  memberAccountId: standInPeople.coach.accountId,
  assignees: [standInPeople.scorekeeper.accountId, standInPeople.owner.accountId],
  draftAssignees: [standInPeople.admin.accountId, standInPeople.scorekeeper.accountId],
};
