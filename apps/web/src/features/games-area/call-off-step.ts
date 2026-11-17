// What a post of "Forfeit, postpone or cancel" (or "Put it back on its date") asks the
// server to do (step 2.158; A-5), worked out from the form's fields and the server's clock
// alone, so it is tested without a page:
//
// - `back`: the question's "No"; nothing changes.
// - `refused`: the form's one choice was left empty (the team that forfeits, why a game is
//   put back on its date); nothing is sent to a command.
// - `ask`: the question, stamped with the server's time. Any post that is not the
//   question's own confirmed "Yes" only asks: a skipped question, a "Yes" from a form that
//   never asked, and a "Yes" sent sooner than `askRestMs` after the question was drawn.
//   That last one is the second tap of a double tap: with scripts on, "Yes" is never
//   drawn under the button just touched and takes no tap for half a second; with scripts
//   off the page is drawn anew wherever the browser lands, so the server waits too.
// - `run`: the change, confirmed.
import { callOffActs, type CallOffAct, type TypedFields } from './form-state.ts';

/** How long after a question is drawn its "Yes" is taken as read (ms). */
export const askRestMs = 800;

export type CallOffStep =
  | { readonly kind: 'back' }
  | { readonly kind: 'refused'; readonly code: string; readonly field: string }
  | { readonly kind: 'ask'; readonly act: CallOffAct; readonly askedAt: number }
  | { readonly kind: 'run'; readonly act: CallOffAct };

/** The form's one choice, for the changes that have one. */
export const choiceOf: Partial<Record<CallOffAct, { field: string; code: string }>> = {
  forfeit: { field: 'forfeitingTeamId', code: 'choose-team' },
  restore: { field: 'reason', code: 'choose-reason' },
};

export function callOffStep(fields: TypedFields, now: number): CallOffStep | undefined {
  const act = callOffActs.find((a) => a === fields['act']);
  if (act === undefined) return undefined;
  if (fields['step'] === 'back') return { kind: 'back' };
  const choice = choiceOf[act];
  if (choice !== undefined && (fields[choice.field] ?? '').trim() === '') {
    return { kind: 'refused', code: choice.code, field: choice.field };
  }
  const askedAt = Number(fields['askedAt']);
  const read =
    fields['step'] === 'confirm' &&
    fields['confirmed'] === 'yes' &&
    Number.isInteger(askedAt) &&
    askedAt <= now &&
    now - askedAt >= askRestMs;
  return read ? { kind: 'run', act } : { kind: 'ask', act, askedAt: now };
}
