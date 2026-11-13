// What the access module needs from storage. packages/database supplies it, bound
// to one transaction for one league, so none of these take a league id: they can
// only ever reach the league the transaction is for (T-28). Every read is fresh
// from the database, so removing someone's access works at once (T-75).
import type { CommandTx } from '../../command/index.ts';
import type { InvitationStatus } from './access-values.ts';
import type { Role } from './roles.ts';
import type { Scope } from './scopes.ts';

/** "This account has this role here" (T3 §5). */
export type Grant = {
  readonly id: string;
  readonly accountId: string;
  readonly role: Role;
  readonly scope: Scope;
  readonly grantedByAccountId: string | null;
  /** Null while the grant is in force. */
  readonly revokedAt: string | null;
};

export type Invitation = {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly scope: Scope;
  /** Worked out by the database from its own clock, so expiry needs no clock here. */
  readonly status: InvitationStatus;
  readonly invitedByAccountId: string | null;
  readonly expiresAt: string;
};

export type NewInvitation = {
  readonly email: string;
  readonly role: Role;
  readonly scope: Scope;
  /** SHA-256 of the link's token, as hex. The token itself is never stored. */
  readonly tokenHash: string;
  readonly invitedByAccountId: string;
  /** The link works for this many days from now (the database's now). */
  readonly lifetimeDays: number;
};

export type NewGrant = {
  readonly accountId: string;
  readonly role: Role;
  readonly scope: Scope;
  readonly grantedByAccountId: string | null;
};

/** What a permission check reads (policy.ts). Other modules' transactions offer it too. */
export type AccessReader = {
  /** The league's one owner (O-7), or undefined if the league is in the bin or out of sight. */
  readonly ownerAccountId: () => Promise<string | undefined>;
  /** The account's grants in force in this league. */
  readonly activeGrantsOf: (accountId: string) => Promise<readonly Grant[]>;
};

export type AccessStore = AccessReader & {
  readonly programExists: (programId: string) => Promise<boolean>;
  /** Whether a pending, unexpired invitation for this email, role and scope exists. */
  readonly hasPendingInvitation: (email: string, role: Role, scope: Scope) => Promise<boolean>;
  readonly createInvitation: (invitation: NewInvitation) => Promise<Invitation>;
  readonly findInvitation: (invitationId: string) => Promise<Invitation | undefined>;
  readonly findInvitationByTokenHash: (tokenHash: string) => Promise<Invitation | undefined>;
  /**
   * A new link and a new expiry for an invitation not accepted or cancelled, which
   * ends the old link: undefined if it was accepted or cancelled.
   */
  readonly renewInvitation: (
    invitationId: string,
    tokenHash: string,
    lifetimeDays: number,
  ) => Promise<Invitation | undefined>;
  /** Cancels an invitation not accepted or cancelled: false if it was. */
  readonly cancelInvitation: (invitationId: string) => Promise<boolean>;
  /** Marks a pending, unexpired invitation accepted by the account: false if it is not. */
  readonly acceptInvitation: (invitationId: string, accountId: string) => Promise<boolean>;
  readonly createGrant: (grant: NewGrant) => Promise<Grant>;
  readonly findGrant: (grantId: string) => Promise<Grant | undefined>;
  /** Ends a grant in force, at once: false if it was already ended. */
  readonly revokeGrant: (grantId: string, byAccountId: string) => Promise<boolean>;
  /** Every grant in force. */
  readonly listGrants: () => Promise<readonly Grant[]>;
  /** Every invitation neither accepted nor cancelled (pending or expired). */
  readonly listOpenInvitations: () => Promise<readonly Invitation[]>;
};

/** One entry of the activity log (A-6). Ids and fixed words only, never personal details. */
export type ActivityEntry = {
  readonly actorAccountId: string | null;
  /** The command's name, `module.action`. */
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  /** A message key (T-187): the page turns it into words, filled from `details`. */
  readonly summary: string;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
};

export type ActivityRecord = ActivityEntry & { readonly id: string; readonly at: string };

/** Where to carry on reading the log from: the last entry already shown. */
export type ActivityCursor = { readonly at: string; readonly id: string };

export type ActivityLog = {
  readonly record: (entry: ActivityEntry) => Promise<void>;
  /** Newest first, at most `limit`, older than `before` when given. */
  readonly list: (
    limit: number,
    before: ActivityCursor | undefined,
  ) => Promise<readonly ActivityRecord[]>;
};

/** A transaction a permission check can run in: any module's that offers `access`. */
export type PermissionsTx = CommandTx & { readonly access: AccessReader };

/** A transaction whose commands write the activity log. */
export type ActivityTx = CommandTx & { readonly activity: ActivityLog };

export type AccessTx = CommandTx & {
  readonly access: AccessStore;
  readonly activity: ActivityLog;
};
