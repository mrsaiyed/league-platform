// How a Teams form's answer reaches the page (step 2.155 part 6, T-435): never the address.
// The form's action leaves the answer as the server's one-time notice (server/saved-notice.ts)
// for the person who sent it, keyed by the team whose page it goes back to (or the list);
// the page takes it once as it is drawn and reads it with the same readers as before
// (answer.ts), so every word, and the line or panel it is said beside, is as it was. A
// reload or Back says nothing old, and an address with `done=` or `problem=` in it says
// nothing. Only fixed words, ids, a jersey number and a date-shaped leaving date ride in the
// notice, as they rode in the address; names are read from the roster as the page is drawn.
import type { RosterLine } from '@srleagues/core';
import type { SavedNotice } from '../../server/saved-notice.ts';
import { answerQuery, type Answer } from './answer.ts';

type Query = Readonly<Record<string, string | string[] | undefined>>;

/** The notice's `thing` for an answer said on the list of teams, not a team's page. */
export const teamsListThing = 'list';

/** What a Teams answer leaves as `said` (its words as answer.ts writes them), and where the browser lands. */
export function teamsAnswerSaid(answer: Answer): {
  readonly said: string;
  readonly anchor: string;
} {
  const written = answerQuery(answer);
  const cut = written.indexOf('#');
  return cut < 0
    ? { said: written, anchor: '' }
    : { said: written.slice(0, cut), anchor: written.slice(cut) };
}

/** The answer the page took, as the readers in answer.ts read it; empty for none or another page's. */
export function answerQueryOf(notice: SavedNotice | undefined, thing: string): Query {
  if (notice === undefined || notice.screen !== 'teams' || notice.thing !== thing) return {};
  if (!notice.said.startsWith('?')) return {};
  return Object.fromEntries(new URLSearchParams(notice.said.slice(1)));
}

/**
 * What a kept answer needs beside it to be checked again: the roster's open order a move left
 * (step 2.155 part 6 fix round).
 */
export type KeptTruth = { readonly openOrder: readonly string[] };

/**
 * Whether a kept answer to a form sent again is still the truth (server/same-request.ts): a
 * player said marked as left is still marked, one put back still on the roster, a team said
 * left or back still so, a team removed still gone, a move's order still the roster's. Any other kept "done" is not checked, so the form
 * runs again and its command answers as things are now; a kept refusal holds.
 */
export function answerHolds(
  answer: Answer,
  now: {
    readonly lines: readonly RosterLine[] | undefined;
    readonly team: { readonly left: boolean } | undefined;
  },
  truth?: KeptTruth,
): boolean {
  if (answer.kind === 'refused') return true;
  const line = now.lines?.find((candidate) => candidate.id === answer.at?.entry);
  switch (answer.done) {
    case 'left':
      return line !== undefined && line.leftOn !== null;
    case 'putBack':
    case 'putBackNoNumber':
      return line !== undefined && line.leftOn === null;
    case 'teamLeft':
      return now.team?.left === true;
    case 'teamBack':
      return now.team?.left === false;
    case 'removed':
      return now.team === undefined;
    case 'moved': {
      if (truth === undefined || now.lines === undefined) return false;
      const open = now.lines.filter((l) => l.leftOn === null).map((l) => l.id);
      const order = truth.openOrder;
      return open.length === order.length && open.every((id, at) => order[at] === id);
    }
    default:
      return false;
  }
}
