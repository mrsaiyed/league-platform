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
