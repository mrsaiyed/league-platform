// "BE THIS MADE-UP PERSON" ON THE MADE-UP DATABASE (step 2.96). LOCAL WORK AND TESTS ONLY.
//
// With LOCAL_DATA=made-up-database the people are the seed leagues' owners and staff
// (packages/database's seed data, every address ending in .test): the very rows the
// made-up database is loaded from when the app starts (startup.ts). They are listed from
// that data, not read back across leagues: no query lists the people of every league,
// and none is added for this. None of them has a password: one is signed in by an emailed
// code, read from the capture in memory, as anyone signs up (be-made-up-person.ts). The
// made-up member, who has a password on the sign-in stand-in here too, is listed as well.
import type { Role } from '@srleagues/core';
import type { LocalTools, MadeUpChoice } from './local-tools.ts';
import type { StandInSignIn } from './stand-in-ports.ts';

/** What is read of one seed league (packages/database's SeedLeague). */
export type SeedLeagueFacts = {
  readonly slug: string;
  readonly name: string;
  readonly owner: { readonly email: string; readonly displayName: string };
  readonly members: readonly {
    readonly email: string;
    readonly displayName: string;
    readonly role: Role;
  }[];
};

/** The made-up member of the sign-in stand-in (standInMember), who signs in with a password. */
export type MadeUpMember = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export function madeUpDatabaseTools(
  seed: readonly SeedLeagueFacts[],
  member: MadeUpMember,
  signIn: Pick<StandInSignIn, 'keptEmails' | 'watchForCode'>,
): LocalTools {
  const byEmail = new Map<string, MadeUpChoice>();
  const add = (email: string, name: string, place: MadeUpChoice['places'][number]) => {
    const key = email.toLowerCase();
    const known = byEmail.get(key);
    byEmail.set(key, {
      key,
      name: known?.name ?? name,
      email: key,
      places: [...(known?.places ?? []), place],
    });
  };
  for (const league of seed) {
    add(league.owner.email, league.owner.displayName, {
      slug: league.slug,
      name: league.name,
      memberships: ['owner'],
    });
    for (const person of league.members) {
      add(person.email, person.displayName, {
        slug: league.slug,
        name: league.name,
        memberships: [person.role],
      });
    }
  }
  const memberKey = member.email.toLowerCase();
  const people: readonly MadeUpChoice[] = [
    ...byEmail.values(),
    ...(byEmail.has(memberKey)
      ? []
      : [{ key: memberKey, name: member.name, email: memberKey, places: [] }]),
  ];
  return {
    keptEmails: signIn.keptEmails,
    watchForCode: signIn.watchForCode,
    madeUpPeople: async () => people,
    madeUpSignInOf: (key) => {
      if (key === memberKey)
        return { kind: 'password', email: member.email, password: member.password };
      const chosen = byEmail.get(key);
      return chosen === undefined ? undefined : { kind: 'code', email: chosen.email };
    },
  };
}
