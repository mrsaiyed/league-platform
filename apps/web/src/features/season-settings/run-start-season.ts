// What "Start the season" does (step 2.130), apart from the page check and the redirect
// (actions.ts): the form's fields as leagues.start_season takes them, an empty date left
// out, in the program the form names (the shown season's: the one the admin is working
// in), or the league's default one when there is no season yet. The command checks every field; its refusal is answered by its own words. The
// context comes from the session, never from the form (T-23).
import {
  seasonCarryChoices,
  startSeason,
  type CommandContext,
  type CommandDeps,
  type LeaguesTx,
} from '@srleagues/core';
import { done, refusedBy, type Answer } from './answer.ts';

export type StartedSeason = {
  readonly answer: Answer;
  /** The new season's short name once it is made; undefined when nothing was made. */
  readonly seasonSlug: string | undefined;
};

const typed = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
};

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
  if (carry === undefined || slug === undefined) {
    return { answer: refusedBy(startSeason.commandName, 'invalid-input'), seasonSlug: undefined };
  }
  const result = await startSeason(
    context,
    {
      ...(programId === undefined ? {} : { programId }),
      slug,
      name: fields['name'] ?? '',
      carry,
      ...(startsOn === undefined ? {} : { startsOn }),
      ...(endsOn === undefined ? {} : { endsOn }),
    },
    deps,
  );
  return result.ok
    ? { answer: done('started'), seasonSlug: slug }
    : { answer: refusedBy(startSeason.commandName, result.error.code), seasonSlug: undefined };
}
