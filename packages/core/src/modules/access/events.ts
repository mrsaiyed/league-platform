// What the access module announces (T-24). Other modules react without this one
// knowing they exist.

export const roleGranted = 'access.role_granted';
export const roleRevoked = 'access.role_revoked';

export type RoleGranted = {
  readonly type: typeof roleGranted;
  readonly leagueId: string;
  readonly grantId: string;
};
export type RoleRevoked = {
  readonly type: typeof roleRevoked;
  readonly leagueId: string;
  readonly grantId: string;
};
