// Transfers: reading what another system kept, for the runner that brings it into a
// league (F-7). The reader never writes to the source; the transfer writes to a local
// platform database only, through the product's commands.
export { readTrackerBackup } from './read-tracker-backup.ts';
export type { ReadTrackerBackupOptions } from './read-tracker-backup.ts';
export { TrackerBackupError } from './tracker-backup.ts';
export { isDatabaseAddress, transferTrackerGamesInFolder } from './transfer-in-folder.ts';
export { transferTrackerGames } from './transfer-tracker-games.ts';
export type {
  TransferOutcome,
  TransferSetupProblem,
  TransferTrackerGamesOptions,
} from './transfer-tracker-games.ts';
export type {
  BackupEvent,
  BackupGame,
  BackupGameStatus,
  BackupLine,
  BackupPlayer,
  BackupTeam,
  TrackerBackup,
  TrackerBackupProblem,
} from './tracker-backup.ts';
