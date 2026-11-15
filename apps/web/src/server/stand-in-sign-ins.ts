// THE MADE-UP PEOPLE WHO SIGN IN WITH A PASSWORD. FOR LOCAL WORK AND TESTS ONLY.
//
// The stand-in's league staff were "signed in" only by a session cookie set by hand
// (stand-in-ports.ts), so nobody could walk the product by tapping "Sign in". Here the
// made-up owner, scheduler, scorekeeper and coach of the first made-up league, and the
// made-up member, get a made-up email and password each, given accounts on the sign-in
// stand-in when the app starts (signUpMadeUp in stand-in-ports.ts). They exist only in
// this process's memory, in the made-up world on this computer: the stand-in refuses to
// start for anything but APP_ENV local or test on a site address of this computer or a
// test name (standInSignIn). docs/operations/run-it-locally.md lists them.
//
// The sign-in stand-in names each account by an id of its own. Like the database's link of
// a sign-in to an account by its proved address (record 052), the stand-in then answers
// for the made-up person whose address the sign-in service holds for the session.

/** A made-up person who signs in with a password, and who they are in the made-up leagues. */
export type MadeUpSignIn = {
  readonly email: string;
  readonly password: string;
  /** Who they are among the stand-in's made-up people (standInPeople, stand-in-ports.ts). */
  readonly person: StaffPerson;
};

/** The made-up staff who sign in with a password. */
export type StaffPerson = 'owner' | 'scheduler' | 'scorekeeper' | 'coach';

/** The made-up member: no role anywhere, a roster place in three leagues (stand-in-my-leagues.ts). */
export const standInMemberAccountId = '01900000-0000-7000-8000-0000000000ac';

/** The made-up staff of the first made-up league, by role. */
export const standInStaffSignIns = {
  owner: {
    email: 'owner@example.test',
    password: 'made-up owner password',
    person: 'owner',
  },
  scheduler: {
    email: 'scheduler@example.test',
    password: 'made-up scheduler password',
    person: 'scheduler',
  },
  scorekeeper: {
    email: 'scorekeeper@example.test',
    password: 'made-up scorekeeper password',
    person: 'scorekeeper',
  },
  coach: {
    email: 'coach@example.test',
    password: 'made-up coach password',
    person: 'coach',
  },
} as const satisfies Record<string, MadeUpSignIn>;

/**
 * The made-up account the sign-in service's proved address is, if it is one of the
 * made-up people's; addresses are matched as the service keeps them, in lower case.
 */
export function madeUpAccountOf(
  email: string,
  memberEmail: string,
  people: Readonly<Record<StaffPerson, { readonly accountId: string }>>,
): string | undefined {
  const address = email.toLowerCase();
  if (address === memberEmail.toLowerCase()) return standInMemberAccountId;
  const staff = Object.values(standInStaffSignIns).find((made) => made.email === address);
  return staff === undefined ? undefined : people[staff.person].accountId;
}
