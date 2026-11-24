'use server';
// The Teams screens' server actions (step 2.51): one for each form. Each is a plain
// form post, so the screens work with no script in the page, and each runs the
// product's own command (runTeamsAction): who is acting and in which league come from
// the session, never from what the form sent.
import {
  addToRoster,
  changeRosterEntry,
  createTeam,
  markLeft,
  markTeamLeft,
  putBackOnRoster,
  removePerson,
  removeTeam,
  setTeamStatsVisibility,
  undoTeamLeft,
  updateTeam,
  leagueUrl,
  type Result,
} from '@srleagues/core';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t } from '../../server/messages.ts';
import { requestKeyOf, sameRequestsHere } from '../../server/same-request.ts';
import {
  answerSaved,
  answerSavedAt,
  refusedWith,
  typedOf,
  type FormState,
} from '../list-forms/index.ts';
import { createTeamRefusal } from './create-team-answer.ts';
import {
  addPlayerAnchor,
  done,
  entryAnchor,
  refused,
  teamDetailsAnchor,
  type DoneName,
} from './answer.ts';
import {
  addToRosterInput,
  changeEntryInput,
  changeTeamInput,
  markLeftInput,
  newTeamInput,
  putBackInput,
  shortNameNeeded,
  teamLeftInput,
  teamStatsInput,
} from './form-input.ts';
import { addNewPerson, moveEntry } from './roster-changes.ts';
import { runTeamsAction, type TeamsAction, type TeamsActionResult } from './run-teams-action.ts';
import { teamFormRefusal, type TeamFormName } from './team-form-answer.ts';

type Issues = readonly { readonly path: string }[];
type FormResult = TeamsActionResult & { readonly issues?: Issues };

const teamIdShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A form of a team's own page that answers in the response to the post (step 2.155; T-271,
 * record 067): refused, every box as typed and the wrong one marked, its sentence naming
 * it; saved, a one-time notice says it beside the thing saved, so a reload says nothing
 * old. A second post of the same form (a double tap) is answered as the first.
 */
async function answerTeamForm(
  formName: TeamFormName,
  form: FormData,
  work: (action: TeamsAction) => Promise<FormResult>,
  saved: (result: FormResult) => { readonly said: string; readonly about?: readonly string[] },
  anchor: (result: FormResult) => string,
): Promise<FormState> {
  const fields = typedOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'teams');
  const { adminTeams: ports } = await webPorts();
  const context = commandContextOf(view.context);
  const result = await sameRequestsHere<FormResult>().once(
    requestKeyOf(context, { ...fields, teamForm: formName }),
    async () => {
      const season = await ports.currentSeason(context);
      return work({ context, ports, seasonId: season?.id, fields });
    },
  );
  const answer = result.answer;
  if (answer.kind === 'refused') {
    const refusal = teamFormRefusal(formName, answer.command, answer.code, fields, result.issues);
    // Not allowed: said where it was tapped. Drawn again, the page would no longer offer
    // the form (step 2.157), and the sentence would go with it.
    if (answer.code === 'not-allowed') {
      return { kind: 'refused', code: answer.code, typed: fields, wrong: [], said: refusal.said };
    }
    // Someone else changed the team since the page was drawn (T-399): what was typed is
    // kept, and the page drawn again says beside each box what is saved now, so the next
    // tap saves over it knowing both.
    const savedNow =
      answer.code === 'changed-since-read'
        ? { label: t('adminTeams.savedNow'), nothing: t('adminTeams.savedNowNothing') }
        : undefined;
    return refusedWith(answer.code, fields, refusal.wrong, refusal.said, savedNow);
  }
  const teamId = (fields['team'] ?? '').toLowerCase();
  const page = leagueUrl(view.context.league, 'admin-area', {
    area: 'teams',
    ...(teamIdShape.test(teamId) ? { subpath: [teamId] } : {}),
  });
  return answerSaved(
    context,
    { screen: 'teams', thing: teamId, ...saved(result) },
    `${page}#${anchor(result)}`,
  );
}

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

type CreateOutcome = Result<
  { readonly teamId: string },
  { readonly code: string; readonly issues?: readonly { readonly path: string }[] }
>;

/**
 * "Add team" (step 2.155; T-271, record 067): refused in the response to the post, with
 * every box as typed and the wrong one marked; added, the browser goes to the new team's
 * page, where "Saved" names it at the top. A second post of the same form (a double tap
 * with scripts off) is answered as the first, so one team is added.
 */
export async function createTeamAction(_state: FormState, form: FormData): Promise<FormState> {
  const fields = typedOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'teams');
  const { adminTeams: ports } = await webPorts();
  const context = commandContextOf(view.context);
  const outcome = await sameRequestsHere<CreateOutcome>().once(
    requestKeyOf(context, fields),
    async (): Promise<CreateOutcome> => {
      const season = await ports.currentSeason(context);
      if (season === undefined) return { ok: false, error: { code: 'season-not-found' } };
      const input = newTeamInput(fields, season.id);
      if (shortNameNeeded(input)) return { ok: false, error: { code: 'short-name-needed' } };
      return createTeam(context, input, ports.deps);
    },
  );
  if (!outcome.ok) {
    const { code, issues } = outcome.error;
    const refusal = createTeamRefusal(code, issues);
    return refusedWith(code, fields, refusal.wrong, t(refusal.said));
  }
  const teamId = outcome.value.teamId;
  return answerSavedAt(
    context,
    { screen: 'teams', thing: teamId, said: 'created' },
    leagueUrl(view.context.league, 'admin-area', { area: 'teams', subpath: [teamId] }),
  );
}

/** "Team details": its name, short name, colors and division (step 2.155). */
export async function saveTeamAction(_state: FormState, form: FormData): Promise<FormState> {
  return answerTeamForm(
    'details',
    form,
    async ({ context, ports, fields }) => {
      const input = changeTeamInput(fields);
      if (shortNameNeeded(input)) {
        return { answer: refused(updateTeam.commandName, 'short-name-needed') };
      }
      const result = await updateTeam(context, input, ports.deps);
      if (result.ok) return { answer: done('updated') };
      const error = result.error as { readonly code: string; readonly issues?: Issues };
      return {
        answer: refused(updateTeam.commandName, error.code),
        ...(error.issues === undefined ? {} : { issues: error.issues }),
      };
    },
    () => ({ said: 'details' }),
    () => teamDetailsAnchor,
  );
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
    if (fields['confirm'] === undefined) {
      return { answer: refused(removeTeam.commandName, 'not-confirmed'), teamId };
    }
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

/** "Someone not in the list yet": a new person, put on the roster (step 2.155). */
export async function addNewPersonAction(_state: FormState, form: FormData): Promise<FormState> {
  return answerTeamForm(
    'newPlayer',
    form,
    ({ context, ports, fields }) => addNewPerson(context, ports.deps, fields),
    (result) => ({
      said: 'added',
      ...(result.answer.kind === 'done' && result.answer.at !== undefined
        ? { about: [result.answer.at.entry] }
        : {}),
    }),
    // The new line's own place, where it is said.
    (result) =>
      result.answer.kind === 'done' && result.answer.at !== undefined
        ? entryAnchor(result.answer.at.entry)
        : addPlayerAnchor,
  );
}

export async function changeEntryAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const result = await changeRosterEntry(context, changeEntryInput(fields), ports.deps);
    return settle(changeRosterEntry, result, 'entrySaved', fields['team']);
  });
}

export async function markLeftAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const input = markLeftInput(fields);
    const result = await markLeft(context, input, ports.deps);
    // Said on the player's "left" line, naming them and the team.
    if (result.ok) {
      return { answer: done('left', { entry: input.rosterEntryId }), teamId: fields['team'] };
    }
    // Said beside the line's leaving date, with the date typed kept in it.
    const at = { entry: input.rosterEntryId, leftOn: input.leftOn };
    return { answer: refused(markLeft.commandName, result.error.code, at), teamId: fields['team'] };
  });
}

/** Puts a player marked as left by mistake back on the roster (step 2.161). */
export async function putBackAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const input = putBackInput(fields);
    const result = await putBackOnRoster(context, input, ports.deps);
    if (!result.ok) return settle(putBackOnRoster, result, 'putBack', fields['team']);
    // Said on the player's own line; back with no number when theirs is worn (R-32).
    const dropped = result.value.numberDropped;
    const answer =
      dropped === null
        ? done('putBack', { entry: input.rosterEntryId })
        : done('putBackNoNumber', { entry: input.rosterEntryId, number: dropped });
    return { answer, teamId: fields['team'] };
  });
}

export async function moveEntryAction(form: FormData): Promise<never> {
  return runTeamsAction(form, ({ context, ports, fields }) =>
    moveEntry(context, ports.deps, fields),
  );
}

/** Takes a person off the league list: refused while they are on a roster (R-17). */
export async function removePersonAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    if (fields['confirm'] === undefined) {
      return { answer: refused(removePerson.commandName, 'not-confirmed'), teamId: fields['team'] };
    }
    const result = await removePerson(context, { personId: fields['personId'] ?? '' }, ports.deps);
    return settle(removePerson, result, 'personRemoved', fields['team']);
  });
}

/** S-87: marks the team as having left the league; its results and games stay. */
export async function markTeamLeftAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const input = teamLeftInput(fields);
    return settle(
      markTeamLeft,
      await markTeamLeft(context, input, ports.deps),
      'teamLeft',
      input.teamId,
    );
  });
}

/** S-87: takes the mark off, so the team is offered for new games again. */
export async function undoTeamLeftAction(form: FormData): Promise<never> {
  return runTeamsAction(form, async ({ context, ports, fields }) => {
    const input = teamLeftInput(fields);
    return settle(
      undoTeamLeft,
      await undoTeamLeft(context, input, ports.deps),
      'teamBack',
      input.teamId,
    );
  });
}
