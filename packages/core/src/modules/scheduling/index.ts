// The scheduling module (T2 §3). Other modules and packages use only what is here.
export { applyDraftChange, type ApplyChangeResult } from './rules/apply-change.ts';
export { applyDraft, type ApplyDraftResult } from './rules/apply-draft.ts';
export { findClashes } from './rules/find-clashes.ts';
export type {
  ChangeError,
  Clash,
  DraftChange,
  GameRecording,
  ScheduleGame,
  ScheduleRound,
  ScheduleSlot,
  ScheduleState,
} from './rules/schedule-types.ts';
export {
  placeRounds,
  type PublicGame,
  type PublicGameTeam,
  type PublicRound,
  type PublicSchedule,
  type PublicSeasonChoice,
  type RoundPhase,
  type RoundToPlace,
} from './public-schedule.ts';
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
export { addDraftGame, type AddDraftGameError } from './commands/add-draft-game.ts';
export {
  changeDraftRoundDate,
  type ChangeDraftRoundDateError,
} from './commands/change-draft-round-date.ts';
export {
  discardScheduleDraft,
  type DiscardScheduleDraftError,
} from './commands/discard-schedule-draft.ts';
export {
  getScheduleDraft,
  type GetScheduleDraftError,
  type ScheduleDraftView,
} from './commands/get-schedule-draft.ts';
export { moveDraftGame, type MoveDraftGameError } from './commands/move-draft-game.ts';
export { removeDraftGame, type RemoveDraftGameError } from './commands/remove-draft-game.ts';
export { renameDraftRound, type RenameDraftRoundError } from './commands/rename-draft-round.ts';
export { setDraftRecording, type SetDraftRecordingError } from './commands/set-draft-recording.ts';
export { swapDraftGames, type SwapDraftGamesError } from './commands/swap-draft-games.ts';
export {
  emptyDraft,
  maxDraftBytes,
  parseDraftDocument,
  type DraftDocument,
} from './draft-document.ts';
export type { DraftEditError, DraftEditValue } from './draft-edit.ts';
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
  DraftRecord,
  NewCourt,
  NewVenue,
  SchedulingStore,
  SchedulingTx,
  VenueChange,
  VenueRecord,
  VenueWithCourts,
} from './ports.ts';
export {
  previewSchedulePublish,
  type PreviewSchedulePublishError,
  type SchedulePublishPreview,
} from './commands/preview-schedule-publish.ts';
export {
  publishSchedule,
  type PublishScheduleError,
  type PublishScheduleValue,
} from './commands/publish-schedule.ts';
export type { PublishBlocker } from './publish-plan.ts';
export type {
  GameFacts,
  NewPublishedGame,
  NewScheduleRevision,
  PublishedGameChange,
} from './ports.ts';
