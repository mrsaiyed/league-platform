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

/**
 * Adds someone not in the league list yet and puts them on the roster: two commands,
 * so nothing is left half done. The team, role and number are checked first; if the
 * roster still refuses (a number worn, say), the new person is moved to the bin again
 * and the answer says so, so no orphan stays in the league list. (Whether the season
 * asks for different numbers is the roster's rule, so a worn number is found by it.)
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
  // The same shapes the roster commands accept (roster-fields.ts), checked before anyone is made.
  const fine =
    (rosterRoles as readonly string[]).includes(input.role) &&
    (input.jerseyNumber === undefined || /^(0|00|[1-9][0-9]?)$/.test(input.jerseyNumber));
  if (!fine) return { answer: refused(command, 'invalid-input'), teamId };
  const made = await createPerson(context, newPersonInput(fields), deps);
  if (!made.ok) return { answer: refused(createPerson.commandName, made.error.code), teamId };
  const personId = made.value.personId;
  const added = await addToRoster(context, { ...input, personId }, deps);
  if (added.ok) return { answer: done('added'), teamId };
  await removePerson(context, { personId }, deps);
  return { answer: refused(command, added.error.code), teamId };
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
  const direction = fields['moveUp'] !== undefined ? 'up' : 'down';
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
