// Invites someone to a role (P4 §4): an email, a role, and where it applies. It
// records the invitation and an `email.send` job holding its id, in the same
// transaction (T-130); the worker makes the link as it sends (T-226). Whoever
// may manage access at a scope may invite to it, so a program's admin can invite to
// that program and not to the whole league.
import { z } from 'zod';
import { defineCommand, fail, ok, type Result } from '../../../command/index.ts';
import { recordActivity } from '../activity.ts';
import { invitationLifetimeDays, invitationEmailJob } from '../access-values.ts';
import { newInvitationToken } from '../invitation-token.ts';
import { hasPermission, isOpenForNewPeople } from '../policy.ts';
import type { AccessTx } from '../ports.ts';
import { roles } from '../roles.ts';
import {
  availableScopeTypes,
  leagueScope,
  roleScopeTypes,
  scopeDetails,
  scopeInput,
} from '../scopes.ts';

export type InviteError = {
  readonly code:
    | 'role-does-not-fit-scope'
    | 'scope-not-available'
    | 'program-not-found'
    | 'already-invited'
    | 'league-read-only';
};

export const invite = defineCommand({
  name: 'access.invite',
  // The same limits as the invitations table (0004). Emails are kept in lower case.
  input: z.object({
    email: z
      .string()
      .trim()
      .max(320)
      .pipe(z.email())
      .transform((e) => e.toLowerCase()),
    role: z.enum(roles),
    scope: scopeInput.default(leagueScope),
  }),
  allowed: (context, input, tx: AccessTx) =>
    hasPermission(context, tx, 'access.manage', input.scope),
  run: async ({
    context,
    input,
    tx,
  }): Promise<Result<{ invitationId: string; expiresAt: string }, InviteError>> => {
    const { email, role, scope } = input;
    if (!(await isOpenForNewPeople(tx))) return fail({ code: 'league-read-only' });
    if (!roleScopeTypes[role].includes(scope.type))
      return fail({ code: 'role-does-not-fit-scope' });
    if (!availableScopeTypes.includes(scope.type)) return fail({ code: 'scope-not-available' });
    if (scope.type === 'program' && !(await tx.access.programExists(scope.id))) {
      return fail({ code: 'program-not-found' });
    }
    // One open invitation per person, role and place: re-send that one instead.
    if (await tx.access.hasPendingInvitation(email, role, scope)) {
      return fail({ code: 'already-invited' });
    }
    // allowed() refused a visitor, so someone is signed in.
    const invitedBy = context.accountId;
    if (invitedBy === null) throw new Error('access.invite: nobody is signed in.');
    // No link yet: the email job makes it as it sends (issueInvitationLink, T-226).
    const { tokenHash } = await newInvitationToken();
    const invitation = await tx.access.createInvitation({
      email,
      role,
      scope,
      tokenHash,
      invitedByAccountId: invitedBy,
      lifetimeDays: invitationLifetimeDays,
    });
    await tx.jobs.enqueue({
      type: invitationEmailJob,
      leagueId: context.leagueId,
      ids: { invitationId: invitation.id },
    });
    await recordActivity(tx, context, {
      action: 'access.invite',
      target: { type: 'invitation', id: invitation.id },
      details: { role, ...scopeDetails(scope) },
    });
    return ok({ invitationId: invitation.id, expiresAt: invitation.expiresAt });
  },
});
