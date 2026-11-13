// Every command in core, by name. A command that is not listed here fails the
// two-league harness's coverage check (packages/database/src/isolation), so a new
// one cannot skip the isolation cases (T-65). The role matrix
// (packages/database/src/stores/role-matrix.test.ts) fails on one it has no row for.
import { commandRegistry } from './command/index.ts';
import {
  acceptInvitation,
  cancelInvitation,
  invite,
  listAccess,
  listActivity,
  myAccess,
  resendInvitation,
  revokeGrant,
} from './modules/access/index.ts';
import {
  clearSetting,
  setSetting,
  createLeague,
  createSeason,
  renameShortName,
  setCurrentSeason,
  setLeagueName,
  setLeagueStatus,
} from './modules/leagues/index.ts';

export const commands = commandRegistry([
  setLeagueName,
  createLeague,
  renameShortName,
  setLeagueStatus,
  createSeason,
  setCurrentSeason,
  setSetting,
  clearSetting,
  invite,
  resendInvitation,
  cancelInvitation,
  acceptInvitation,
  revokeGrant,
  listAccess,
  listActivity,
  myAccess,
]);
