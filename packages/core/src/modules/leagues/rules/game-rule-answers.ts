// The game rules asked when a league is made and when a season is started (step 2.245,
// S-106): each question is one rule of the season's rules document, with the answer an
// admin may leave alone. The answers are put into a whole rules document and checked by
// the settings' own contract (`SeasonRules`), so these questions hold no second copy of
// the rules' limits: what the season's settings refuse, these refuse too (S-113: a
// mercy lead with a running clock, until step 2.248).
//
// One more question is one more entry in `gameRuleQuestions`, one more field in
// `gameRuleAnswers` and one more line in `withGameRuleAnswers`. The third, when team
// fouls start again, came after step 2.123: an answer is saved as the season's settings
// save it (`foulsWithReset`, marked as chosen, T-422); left alone, or the same as the
// base counts, the base's fouls are kept, marker or no marker.
import { foulsWithReset, SeasonRules, teamFoulsCounted } from '@srleagues/contracts';
import { z } from 'zod';

/** The questions, in the order a screen asks them. */
export const gameRuleQuestions = ['clockMode', 'mercyLead', 'teamFoulsReset'] as const;
export type GameRuleQuestion = (typeof gameRuleQuestions)[number];

/** The clock modes a season may have, as the contract names them. */
export const clockModes = SeasonRules.shape.clock.shape.mode.options;
export type ClockMode = (typeof clockModes)[number];

/** When team fouls may start again, as the contract names the choices (step 2.123). */
export const teamFoulsResets = SeasonRules.shape.fouls.shape.teamFoulsReset.options;
export type TeamFoulsResetAnswer = (typeof teamFoulsResets)[number];

/**
 * The answers, each optional: one left out keeps what the season would have had. Only
 * the kind of each answer is checked here; its limits are the contract's.
 */
export const gameRuleAnswers = z.object({
  clockMode: z.enum(clockModes).optional(),
  /** A lead that switches a stop-clock game to a running clock; null for none. */
  mercyLead: z.number().int().nullable().optional(),
  /** Each period, each half (also with quarters) or never: the whole game. */
  teamFoulsReset: z.enum(teamFoulsResets).optional(),
});
export type GameRuleAnswers = z.infer<typeof gameRuleAnswers>;

/** Where each question's answer lives in the rules document. */
const pathOf: Readonly<Record<GameRuleQuestion, readonly string[]>> = {
  clockMode: ['clock', 'mode'],
  mercyLead: ['clock', 'mercyLead'],
  teamFoulsReset: ['fouls', 'teamFoulsReset'],
};

/** Each question's answer in a rules document: what a screen shows as the default. */
export function gameRuleAnswersOf(rules: SeasonRules): Required<GameRuleAnswers> {
  return {
    clockMode: rules.clock.mode,
    mercyLead: rules.clock.mercyLead,
    teamFoulsReset: teamFoulsCounted(rules),
  };
}

export type GameRuleRefusal = {
  readonly code: 'game-rule-refused';
  /** The question the refusal is about. */
  readonly question: GameRuleQuestion;
};

/**
 * The rules document with the answers in it, checked whole. A stop clock has no
 * last-minutes stop clock (the contract refuses the pair, and no screen of this step
 * asks it), so answering "stop clock" clears one copied from a running-clock season
 * (T-428). A refusal names the question it is about.
 */
export function withGameRuleAnswers(
  base: SeasonRules,
  answers: GameRuleAnswers,
): { readonly ok: true; readonly rules: SeasonRules } | ({ readonly ok: false } & GameRuleRefusal) {
  const mode = answers.clockMode ?? base.clock.mode;
  const clock = {
    ...base.clock,
    mode,
    mercyLead: answers.mercyLead === undefined ? base.clock.mercyLead : answers.mercyLead,
    stopClockLastSeconds: answers.clockMode === 'stop' ? null : base.clock.stopClockLastSeconds,
  };
  const reset = answers.teamFoulsReset;
  const fouls =
    reset === undefined || reset === teamFoulsCounted(base)
      ? base.fouls
      : foulsWithReset(base.fouls, reset);
  const checked = SeasonRules.safeParse({ ...base, clock, fouls });
  if (checked.success) return { ok: true, rules: checked.data };
  const question =
    gameRuleQuestions.find((q) =>
      checked.error.issues.some((issue) => pathOf[q].every((part, i) => issue.path[i] === part)),
    ) ?? questionOfOtherIssue(answers);
  return { ok: false, code: 'game-rule-refused', question };
}

/** A refusal elsewhere in the document can only follow from an answer given: the first. */
function questionOfOtherIssue(answers: GameRuleAnswers): GameRuleQuestion {
  return gameRuleQuestions.find((q) => answers[q] !== undefined) ?? 'clockMode';
}
