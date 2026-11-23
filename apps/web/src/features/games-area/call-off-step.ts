// What a post of "Forfeit, postpone or cancel" (or "Put it back on its date") asks the
// server to do (step 2.158; A-5), worked out from the form's fields and the server's clock
// alone, so it is tested without a page:
//
// - `back`: the question's "No"; nothing changes.
// - `refused`: the form's one choice was left empty (the team that forfeits, why a game is
//   put back on its date); nothing is sent to a command.
// - `ask`: the question, with the time it was first asked. Any post that is not the
//   question's own confirmed "Yes" asks anew, stamped with the server's time; a "Yes" asks
//   again, keeping the FIRST time (step 2.221: the wait never starts again), when it was
//   sent sooner than `askRestMs` after the question was drawn, or when the server knows no
//   question for it (a "Yes" from a form that never asked, a hand-made post). That time is
//   kept on the server with the form's one-time token (server/question-times.ts), never
//   read from the form. A "Yes" too soon is the second tap of a double tap: with scripts on,
//   "Yes" is never drawn under the button just touched and is drawn as not ready, taking
//   no tap, until `readyInMs` has passed; with scripts off the page is drawn anew wherever
//   the browser lands, so the server waits too.
// - `run`: the change, confirmed.
import { callOffActs, type CallOffAct, type TypedFields } from './form-state.ts';

/** How long after a question is drawn its "Yes" is taken as read (ms). */
export const askRestMs = 1000;

export type CallOffStep =
  | { readonly kind: 'back' }
  | { readonly kind: 'refused'; readonly code: string; readonly field: string }
  | {
      readonly kind: 'ask';
      readonly act: CallOffAct;
      readonly askedAt: number;
      /** How much longer "Yes" takes no tap (ms): `askRestMs` less the time already read. */
      readonly readyInMs: number;
    }
  | { readonly kind: 'run'; readonly act: CallOffAct };

/** The form's one choice, for the changes that have one. */
export const choiceOf: Partial<Record<CallOffAct, { field: string; code: string }>> = {
  forfeit: { field: 'forfeitingTeamId', code: 'choose-team' },
  restore: { field: 'reason', code: 'choose-reason' },
};

/**
 * `firstAsked` is the time the server keeps for this form's question, if it keeps one.
 */
export function callOffStep(
  fields: TypedFields,
  now: number,
  firstAsked?: number,
): CallOffStep | undefined {
  const act = callOffActs.find((a) => a === fields['act']);
  if (act === undefined) return undefined;
  if (fields['step'] === 'back') return { kind: 'back' };
  const choice = choiceOf[act];
  if (choice !== undefined && (fields[choice.field] ?? '').trim() === '') {
    return { kind: 'refused', code: choice.code, field: choice.field };
  }
  const yes = fields['step'] === 'confirm' && fields['confirmed'] === 'yes';
  const known = firstAsked !== undefined && firstAsked <= now ? firstAsked : undefined;
  if (yes && known !== undefined && now - known >= askRestMs) return { kind: 'run', act };
  // A "Yes" too soon keeps the question's first time; anything else is a question anew.
  const askedAt = yes ? (known ?? now) : now;
  return { kind: 'ask', act, askedAt, readyInMs: Math.max(0, askRestMs - (now - askedAt)) };
}

/** Postponing's second "Yes" sends this as `newDate` (S-49): postponed, then to its new date. */
export const newDateNow = 'now';

/**
 * Postponing's "give it a new date now" sent by someone who may not edit the schedule (step
 * 2.53 fix round): refused, nothing changed, as the answer is not offered to them either.
 */
export function newDateRefused(
  fields: Readonly<Record<string, string | undefined>>,
  mayGiveNewDates: boolean,
): boolean {
  return fields['newDate'] === newDateNow && !mayGiveNewDates;
}
