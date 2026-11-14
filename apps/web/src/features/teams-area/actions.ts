'use server';
// The Teams screens' server actions (step 2.51): one for each form. Each is a plain
// form post, so the screens work with no script in the page, and each runs the
// product's own command (runTeamsAction): who is acting and in which league come from
// the session, never from what the form sent.
import {
  addToRoster,
  changeRosterEntry,
  createPerson,
  createTeam,
  listRoster,
  markLeft,
  removePerson,
  removeTeam,
  reorderRoster,
  setTeamStatsVisibility,
  updateTeam,
  type Result,
} from '@srleagues/core';
import { done, refused, type DoneName } from './answer.ts';
import {
  addToRosterInput,
  changeEntryInput,
  changeTeamInput,
  markLeftInput,
  movedOrder,
  newPersonInput,
  newTeamInput,
  teamStatsInput,
} from './form-input.ts';
import { runTeamsAction, type TeamsActionResult } from './run-teams-action.ts';

type Named = { readonly commandName: string };

/** The answer for a command's result: what went well, or the refusal's code. */
function settle(
  command: Named,
  result: Result<unknown, { readonly code: string }>,
  name: DoneName,
  teamId?: string,
): TeamsActionResult {
  const answer = result.ok ? done(name) : refused(command.commandName, result.error.code);
  return teamId === undefined ? { answer } : { answer, teamId };
}

export async function createTeamAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, seasonId, fields }) => {
    if (seasonId === undefined) {
      return { answer: refused(createTeam.commandName, 'season-not-found') };
    }
    const result = await createTeam(context, newTeamInput(fields, seasonId), ports.deps);
    return result.ok
      ? { answer: done('created'), teamId: result.value.teamId }
      : settle(createTeam, result, 'created');
  });
}

export async function saveTeamAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const input = changeTeamInput(fields);
    return settle(
      updateTeam,
      await updateTeam(context, input, ports.deps),
      'updated',
      input.teamId,
    );
  });
}

export async function saveTeamStatsAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const input = teamStatsInput(fields);
    return settle(
      setTeamStatsVisibility,
      await setTeamStatsVisibility(context, input, ports.deps),
      'statsSaved',
      input.teamId,
    );
  });
}

export async function removeTeamAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const teamId = fields['team'] ?? '';
    const result = await removeTeam(context, { teamId }, ports.deps);
    // Gone, so back to the list; a refusal stays on the team's own page.
    return result.ok ? { answer: done('removed') } : settle(removeTeam, result, 'removed', teamId);
  });
}

export async function addToRosterAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const input = addToRosterInput(fields, fields['personId'] ?? '');
    return settle(
      addToRoster,
      await addToRoster(context, input, ports.deps),
      'added',
      input.teamId,
    );
  });
}

/** Adds someone not in the league list yet and puts them on the roster: two commands. */
export async function addNewPersonAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const teamId = fields['team'] ?? '';
    const made = await createPerson(context, newPersonInput(fields), ports.deps);
    if (!made.ok) return settle(createPerson, made, 'added', teamId);
    const input = addToRosterInput(fields, made.value.personId);
    return settle(addToRoster, await addToRoster(context, input, ports.deps), 'added', teamId);
  });
}

export async function changeEntryAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const result = await changeRosterEntry(context, changeEntryInput(fields), ports.deps);
    return settle(changeRosterEntry, result, 'entrySaved', fields['team']);
  });
}

export async function markLeftAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields, today }) => {
    const result = await markLeft(context, markLeftInput(fields, today), ports.deps);
    return settle(markLeft, result, 'left', fields['team']);
  });
}

/** Moves one player a place up or down: the roster's new order is worked out from the stored one. */
export async function moveEntryAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const teamId = fields['team'] ?? '';
    const direction = fields['moveUp'] !== undefined ? 'up' : 'down';
    const roster = await listRoster(context, { teamId }, ports.deps);
    if (!roster.ok) return settle(listRoster, roster, 'moved', teamId);
    const open = roster.value.filter((line) => line.leftOn === null).map((line) => line.id);
    const order = movedOrder(open, fields['entry'] ?? '', direction);
    const result = await reorderRoster(context, { teamId, rosterEntryIds: order }, ports.deps);
    return settle(reorderRoster, result, 'moved', teamId);
  });
}

/** Takes a person off the league list: refused while they are on a roster (R-17). */
export async function removePersonAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const result = await removePerson(context, { personId: fields['personId'] ?? '' }, ports.deps);
    return settle(removePerson, result, 'personRemoved', fields['team']);
  });
}
