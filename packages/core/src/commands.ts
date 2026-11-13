// Every command in core, by name. A command that is not listed here fails the
// two-league harness's coverage check (packages/database/src/isolation), so a new
// one cannot skip the isolation cases (T-65).
import { commandRegistry } from './command/index.ts';
import {
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
]);
