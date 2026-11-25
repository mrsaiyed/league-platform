// What "Start the season" does (step 2.130), apart from the page check and the answer
// (actions.ts): the form's fields as leagues.start_season takes them, an empty date left
// out, in the program the form names (the shown season's: the one the admin is working
// in), or the league's default one when there is no season yet. The command checks every
// field; a refusal names the box it is about (step 2.245, as step 2.155's forms), so the
// form is drawn again with what was typed and that box marked. The context comes from the
// session, never from the form (T-23).
import {
  clockModes,
  seasonCarryChoices,
  startSeason,
  type CommandContext,
  type CommandDeps,
  type LeaguesTx,
} from '@srleagues/core';

export type StartedSeason =
  | {
      readonly kind: 'started';
      /** The new season's short name. */
      readonly seasonSlug: string;
    }
  | {
      readonly kind: 'refused';
      /** The command's error code (or the form's own `invalid-input`). */
      readonly code: string;
      /** The box the refusal is about, or undefined when it is about none. */
      readonly field: StartField | undefined;
    };

/** The boxes of the start form, in the order they are on the screen. */
export const startFields = [
  'name',
  'slug',
  'startsOn',
  'endsOn',
  'clockMode',
  'mercyLead',
  'carry',
] as const;
export type StartField = (typeof startFields)[number];

const typed = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
};

/** The form's own code for a mercy lead that is not a whole number from 1 to 100. */
export const mercyLeadNumber = 'mercy-lead-number';

const refused = (code: string, field: StartField | undefined): StartedSeason => ({
  kind: 'refused',
  code,
  field,
});

/** The box an issue's path is about: `gameRules.mercyLead` is the mercy box. */
function fieldOfPath(path: string): StartField | undefined {
  const parts = path.split('.');
  const name = parts[0] === 'gameRules' ? parts[1] : parts[0];
  return startFields.find((field) => field === name);
}

export async function runStartSeason(
  context: CommandContext,
  fields: Readonly<Record<string, string>>,
  deps: CommandDeps<LeaguesTx>,
): Promise<StartedSeason> {
  const carry = seasonCarryChoices.find((c) => c === fields['carry']);
  const slug = typed(fields['slug']);
  const startsOn = typed(fields['startsOn']);
  const endsOn = typed(fields['endsOn']);
  const programId = typed(fields['programId']);
  // The game rules asked (S-106, step 2.245): an empty mercy lead is none; the command
  // checks the pair against the season's settings' own contract.
  // An unknown clock word is refused, as the command refuses it (review L1).
  const clockTyped = typed(fields['clockMode']);
  const clockMode = clockModes.find((mode) => mode === clockTyped);
  const mercyTyped = typed(fields['mercyLead']);
  const mercyLead =
    mercyTyped === undefined ? null : /^\d{1,3}$/.test(mercyTyped) ? Number(mercyTyped) : undefined;
  if (typed(fields['name']) === undefined) return refused('invalid-input', 'name');
  if (slug === undefined) return refused('invalid-input', 'slug');
  if (clockTyped !== undefined && clockMode === undefined) {
    return refused('invalid-input', 'clockMode');
  }
  if (mercyLead === undefined) return refused(mercyLeadNumber, 'mercyLead');
  if (carry === undefined) return refused('invalid-input', 'carry');
  const result = await startSeason(
    context,
    {
      ...(programId === undefined ? {} : { programId }),
      slug,
      name: fields['name'] ?? '',
      carry,
      gameRules: { ...(clockMode === undefined ? {} : { clockMode }), mercyLead },
      ...(startsOn === undefined ? {} : { startsOn }),
      ...(endsOn === undefined ? {} : { endsOn }),
    },
    deps,
  );
  if (result.ok) return { kind: 'started', seasonSlug: slug };
  const error = result.error;
  switch (error.code) {
    case 'invalid-input':
      return refused(
        error.code,
        error.issues.map((issue) => fieldOfPath(issue.path)).find((f) => f !== undefined),
      );
    case 'game-rule-refused':
      // With a stop clock the mercy lead can only be refused for its number (review L2).
      return refused(
        error.question === 'mercyLead' && clockMode === 'stop' ? mercyLeadNumber : error.code,
        error.question,
      );
    case 'season-slug-taken':
      return refused(error.code, 'slug');
    default:
      return refused(error.code, undefined);
  }
}
