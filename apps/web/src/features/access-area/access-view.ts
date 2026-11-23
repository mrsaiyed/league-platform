// What the Admins page shows (step 2.97, P4 §4 and §6), worked out from the access
// module's list (access.list_access), the names on it (A-14) and the activity log, as a
// plain function so it is tested without a server. Names are shown, never an account's
// email address (A-14); an invitation is shown by the address it was sent to, which is all
// there is of it until it is accepted.
import {
  roleScopeTypes,
  availableScopeTypes,
  roles,
  type AccessList,
  type ActivityRecord,
  type Role,
} from '@srleagues/core';

/** The roles this page offers: those that can be given for the whole league today. */
export const offeredRoles: readonly Role[] = roles.filter(
  (role) => roleScopeTypes[role].includes('league') && availableScopeTypes.includes('league'),
);

export type PersonLine = {
  readonly accountId: string;
  /** The name they gave; null for "No name yet" (A-14). */
  readonly name: string | null;
  readonly isOwner: boolean;
  readonly isYou: boolean;
  /** Each role they hold, with the grant that can be removed. The owner holds no grant. */
  readonly grants: readonly {
    readonly grantId: string;
    readonly role: Role;
    readonly program: boolean;
  }[];
};

export type InvitationLine = {
  readonly invitationId: string;
  readonly email: string;
  readonly role: Role;
  readonly program: boolean;
  readonly expired: boolean;
  readonly expiresAt: string;
};

export type ActivityLine = {
  readonly id: string;
  readonly at: string;
  /** Who did it: a name, null for "No name yet", undefined for someone without access now. */
  readonly who: string | null | undefined;
  /** The message key of what was done (activity.access.*). */
  readonly summary: string;
  readonly role: Role | undefined;
};

export type AdminsView = {
  readonly people: readonly PersonLine[];
  readonly invitations: readonly InvitationLine[];
  readonly activity: readonly ActivityLine[];
};

/** The newest entries of who-has-access changes the page lists. */
export const activityShown = 10;

const byName = (a: PersonLine, b: PersonLine) => {
  // The owner first, then people by name, those with none last; ties by id, so the order holds.
  if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
  if (a.name !== b.name) {
    if (a.name === null) return 1;
    if (b.name === null) return -1;
    const named = a.name.localeCompare(b.name, 'en');
    if (named !== 0) return named;
  }
  return a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0;
};

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (roles as readonly string[]).includes(value);

export function adminsView(options: {
  readonly list: AccessList;
  readonly names: ReadonlyMap<string, string | null>;
  readonly activity: readonly ActivityRecord[];
  /** The signed-in person, to mark their own line. */
  readonly you: string | null;
}): AdminsView {
  const { list, names, you } = options;
  const nameOf = (accountId: string) => {
    const name = names.get(accountId);
    return name === undefined || name === null || name.trim() === '' ? null : name.trim();
  };
  const people = new Map<string, PersonLine>();
  const line = (accountId: string, isOwner: boolean): PersonLine => ({
    accountId,
    name: nameOf(accountId),
    isOwner,
    isYou: accountId === you,
    grants: [],
  });
  if (list.ownerAccountId !== null) {
    people.set(list.ownerAccountId, line(list.ownerAccountId, true));
  }
  for (const grant of list.grants) {
    const found = people.get(grant.accountId) ?? line(grant.accountId, false);
    people.set(grant.accountId, {
      ...found,
      grants: [
        ...found.grants,
        { grantId: grant.id, role: grant.role, program: grant.scope.type !== 'league' },
      ],
    });
  }
  const invitations = [...list.invitations]
    .sort((a, b) => (a.expiresAt < b.expiresAt ? 1 : a.expiresAt > b.expiresAt ? -1 : 0))
    .map((invitation) => ({
      invitationId: invitation.id,
      email: invitation.email,
      role: invitation.role,
      program: invitation.scope.type !== 'league',
      expired: invitation.status === 'expired',
      expiresAt: invitation.expiresAt,
    }));
  const activity = options.activity
    .filter((entry) => entry.action.startsWith('access.'))
    .slice(0, activityShown)
    .map((entry) => ({
      id: entry.id,
      at: entry.at,
      who:
        entry.actorAccountId === null
          ? undefined
          : names.has(entry.actorAccountId)
            ? nameOf(entry.actorAccountId)
            : undefined,
      summary: entry.summary,
      role: isRole(entry.details['role']) ? entry.details['role'] : undefined,
    }));
  return { people: [...people.values()].sort(byName), invitations, activity };
}
