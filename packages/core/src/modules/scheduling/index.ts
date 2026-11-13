// The scheduling module (T2 §3). Other modules and packages use only what is here.
export { applyDraftChange, type ApplyChangeResult } from './rules/apply-change.ts';
export { applyDraft, type ApplyDraftResult } from './rules/apply-draft.ts';
export { findClashes } from './rules/find-clashes.ts';
export type {
  ChangeError,
  Clash,
  DraftChange,
  ScheduleGame,
  ScheduleRound,
  ScheduleSlot,
  ScheduleState,
} from './rules/schedule-types.ts';
export { summarizePublish, type PublishSummary } from './rules/summarize-publish.ts';
export { generatePairings, maxTimesEachPair } from './rules/generate-pairings.ts';
export { fairnessReport } from './rules/fairness-report.ts';
export type {
  FairnessInput,
  FairnessIssue,
  FairnessReport,
  FairnessRules,
  Pairing,
  PairingRound,
  PairingTeam,
  PairingsError,
  PairingsInput,
  PairingsResult,
  TeamFairness,
  TeamUnavailableDate,
} from './rules/pairing-types.ts';
export { createCourt, type CreateCourtError } from './commands/create-court.ts';
export { createVenue, type CreateVenueError } from './commands/create-venue.ts';
export { listVenues } from './commands/list-venues.ts';
export { removeCourt, type RemoveCourtError } from './commands/remove-court.ts';
export { removeVenue, type RemoveVenueError } from './commands/remove-venue.ts';
export { restoreCourt, type RestoreCourtError } from './commands/restore-court.ts';
export { restoreVenue, type RestoreVenueError } from './commands/restore-venue.ts';
export { updateCourt, type UpdateCourtError } from './commands/update-court.ts';
export { updateVenue, type UpdateVenueError } from './commands/update-venue.ts';
export type {
  CourtChange,
  CourtRecord,
  NewCourt,
  NewVenue,
  SchedulingStore,
  SchedulingTx,
  VenueChange,
  VenueRecord,
  VenueWithCourts,
} from './ports.ts';
