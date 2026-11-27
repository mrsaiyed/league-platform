// "Show as" on a person's record in Admin → People (step 2.146, R-23): what the form
// posted, read into the command's input, and the reason a refusal gives. The command
// (`people.set_name_request`) decides; this only reads the form and words the answer.
import {
  nameRequestReasons,
  nameRequests,
  readOnlyLeagueStatuses,
  type NameRequest,
  type NameRequestReason,
} from '@srleagues/core';
import type { TypedFields } from '../list-forms/form-state.ts';

/** The three choices as the form offers them, "as the league shows everyone" first. */
export const showAsChoices: readonly NameRequest[] = nameRequests;

export type NameRequestInput = {
  readonly personId: string;
  readonly version: number;
  readonly showAs: NameRequest;
  readonly reason: NameRequestReason;
};

const isChoice = (value: string): value is NameRequest =>
  (nameRequests as readonly string[]).includes(value);
const isReason = (value: string): value is NameRequestReason =>
  (nameRequestReasons as readonly string[]).includes(value);

/** The form's fields as the command's input; undefined when a choice or the reason is missing. */
export function nameRequestInputOf(fields: TypedFields): NameRequestInput | undefined {
  const showAs = (fields['showAs'] ?? '').trim();
  const reason = (fields['reason'] ?? '').trim();
  const version = Number(fields['version'] ?? '');
  if (!isChoice(showAs) || !isReason(reason)) return undefined;
  if (!Number.isInteger(version) || version < 1) return undefined;
  return { personId: (fields['personId'] ?? '').trim().toLowerCase(), version, showAs, reason };
}

/**
 * The code a refusal is worded by. In an archived or suspended league the command lets a
 * change through only when it shows less of the person (R-26) and otherwise refuses as
 * not allowed: the screen then says why, naming the league's state, instead of "You are
 * not allowed". Any other refusal keeps its own code.
 */
export function nameRequestRefusalCode(code: string, leagueStatus: string): string {
  if (code !== 'not-allowed' || !readOnlyLeagueStatuses.includes(leagueStatus)) return code;
  return leagueStatus === 'archived' ? 'league-archived' : 'league-suspended';
}
