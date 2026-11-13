// The access module (T2 §3): roles, invitations, permission checks, the activity
// log. Other modules and packages use only what is here.
export {
  acceptInvitation,
  type AcceptedInvitation,
  type AcceptInvitationError,
} from './commands/accept-invitation.ts';
export { cancelInvitation } from './commands/cancel-invitation.ts';
export { invite, type InviteError } from './commands/invite.ts';
export {
  resendInvitation,
  type InvitationClosedError,
} from './commands/resend-invitation.ts';
export { revokeGrant, type RevokeGrantError } from './commands/revoke-grant.ts';
export { listAccess, type AccessList } from './queries/list-access.ts';
export { listActivity } from './queries/list-activity.ts';
export { myAccess, type MyAccess } from './queries/my-access.ts';
export {
  activityPageLimit,
  invitationLifetimeDays,
  invitationStatuses,
  sendInvitationJob,
  type InvitationStatus,
} from './access-values.ts';
export { activitySummaryKey, recordActivity, type ActivityChange } from './activity.ts';
export { roleGranted, roleRevoked, type RoleGranted, type RoleRevoked } from './events.ts';
export { hashInvitationToken } from './invitation-token.ts';
export { accessOf, allows, hasPermission, type AccessHolder } from './policy.ts';
export type {
  AccessReader,
  AccessStore,
  AccessTx,
  ActivityCursor,
  ActivityEntry,
  ActivityLog,
  ActivityRecord,
  ActivityTx,
  Grant,
  Invitation,
  NewGrant,
  NewInvitation,
  PermissionsTx,
} from './ports.ts';
export {
  ownerOnlyPermissions,
  permissions,
  roleHasPermission,
  rolePermissions,
  roles,
  type Permission,
  type Role,
} from './roles.ts';
export {
  availableScopeTypes,
  covers,
  leagueScope,
  roleScopeTypes,
  scopeTypes,
  type Scope,
  type ScopeType,
} from './scopes.ts';
