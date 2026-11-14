// The two roster changes that are more than one command (step 2.51), kept apart from
// the server actions so they are tested without a server.
import {
  addToRoster,
  createPerson,
  listRoster,
  removePerson,
  reorderRoster,
  rosterRoles,
  type CommandContext,
  type CommandDeps,
} from '@srleagues/core';
import type { AdminTeamsTx } from '../../server/admin-teams.ts';
import { done, refused } from './answer.ts';
import { addToRosterInput, movedOrder, newPersonInput, type Fields } from './form-input.ts';
import type { TeamsActionResult } from './run-teams-action.ts';

/** The jersey number core's roster-fields.ts accepts: 0 to 99, or 00. */
const jerseyShape = /^(0|00|[1-9][0-9]?)$/;

/**
 * Adds someone not in the league list yet and puts them on the roster. These are two
 * commands, each its own transaction, so the pair can be left half done; this tries
 * to avoid it and says truthfully when it could not. The team, role and number are
 * checked first. If the roster still refuses (a number worn, say), the new person is
 * moved to the bin again and the answer gives the roster's reason. If that undo is
 * refused or fails too, the person stays in the league list and the answer says so
 * (`not-undone`), so the admin can remove them by hand. (Whether the season asks for
 * different numbers is the roster's rule, so a worn number is found by it.)
 */
export async function addNewPerson(
  context: CommandContext,
  deps: CommandDeps<AdminTeamsTx>,
  fields: Fields,
): Promise<TeamsActionResult> {
  const teamId = fields['team'] ?? '';
  const command = 'teams.add_new_person';
  const input = addToRosterInput(fields, '');
  const roster = await listRoster(context, { teamId }, deps);
  if (!roster.ok) return { answer: refused(command, roster.error.code), teamId };
  // The same shapes the roster commands accept, checked before anyone is made. The
  // roles come from core's teams index; the number's schema (roster-fields.ts) is not
  // exported there, and a module is used only through its index, so its pattern is
  // repeated here. Keep the two the same.
  const fine =
    (rosterRoles as readonly string[]).includes(input.role) &&
    (input.jerseyNumber === undefined || jerseyShape.test(input.jerseyNumber));
  if (!fine) return { answer: refused(command, 'invalid-input'), teamId };
  const made = await createPerson(context, newPersonInput(fields), deps);
  if (!made.ok) return { answer: refused(createPerson.commandName, made.error.code), teamId };
  const personId = made.value.personId;
  const added = await addToRoster(context, { ...input, personId }, deps);
  if (added.ok) return { answer: done('added'), teamId };
  const undone = await undoNewPerson(context, deps, personId);
  return { answer: refused(command, undone ? added.error.code : 'not-undone'), teamId };
}

/** Moves the just-made person to the bin again; false when that was refused or failed. */
async function undoNewPerson(
  context: CommandContext,
  deps: CommandDeps<AdminTeamsTx>,
  personId: string,
): Promise<boolean> {
  try {
    return (await removePerson(context, { personId }, deps)).ok;
  } catch {
    return false;
  }
}

/**
 * Moves one player a place up or down. The order the admin saw travels in the form
 * (`order`); it is used only while it is still exactly the roster's open entries in that order, else
 * the answer says the roster changed. A player who is not an open entry is refused.
 */
export async function moveEntry(
  context: CommandContext,
  deps: CommandDeps<AdminTeamsTx>,
  fields: Fields,
): Promise<TeamsActionResult> {
  const teamId = fields['team'] ?? '';
  const command = reorderRoster.commandName;
  const up = fields['moveUp'] !== undefined;
  const down = fields['moveDown'] !== undefined;
  // Exactly one of the two buttons; a post with neither (or both) is not a move.
  if (up === down) return { answer: refused(command, 'invalid-input'), teamId };
  const direction = up ? 'up' : 'down';
  const roster = await listRoster(context, { teamId }, deps);
  if (!roster.ok) return { answer: refused(listRoster.commandName, roster.error.code), teamId };
  const open = roster.value.filter((line) => line.leftOn === null).map((line) => line.id);
  const entry = fields['entry'] ?? '';
  if (!open.includes(entry)) return { answer: refused(command, 'roster-entry-not-found'), teamId };
  const seen = (fields['order'] ?? '').split(',').filter((id) => id !== '');
  const sameAsNow = seen.length === open.length && seen.every((id, at) => open[at] === id);
  if (!sameAsNow) return { answer: refused(command, 'roster-incomplete'), teamId };
  const order = movedOrder(seen, entry, direction);
  const result = await reorderRoster(context, { teamId, rosterEntryIds: order }, deps);
  return result.ok
    ? { answer: done('moved'), teamId }
    : { answer: refused(command, result.error.code), teamId };
}
