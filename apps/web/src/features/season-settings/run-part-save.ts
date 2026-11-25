// What a post of one part of Season settings does (step 2.47), apart from the page check,
// the one-time notice and where the browser goes (part-actions.ts). The season is read
// fresh, through the season command's own read, in the league of the session (T-23,
// T-28); the part's boxes are read into the season's name and dates (update-season) or
// into its rules with only that part changed (set-season-rules). Nothing typed is saved
// until every box reads; a change that would move the standings after a game is decided
// is only asked about, with the teams it moves, and saved when the question's "Yes"
// comes back confirmed (S-1, step 2.25). Every refusal is said in words, beside the box
// it is about where there is one.
import {
  getSeason,
  setSeasonRules,
  updateSeason,
  type CommandContext,
  type CommandDeps,
  type LeaguesTx,
  type StandingsTx,
} from '@srleagues/core';
import { t, type TextKey } from '../../server/messages.ts';
import { typedOnly, type PartState, type TypedFields } from './part-form-state.ts';
import { askHeading, moveLines, wrongSaid, type MovedTeam } from './part-words.ts';
import {
  isGamePreset,
  isSeasonPart,
  nameFromPart,
  rulesFromPart,
  withPreset,
  type SeasonPart,
  type WrongField,
} from './season-parts.ts';

export type PartSaveDeps = {
  /** The season commands' transaction (the admin settings ports' `seasons`). */
  readonly seasons: CommandDeps<LeaguesTx & StandingsTx>;
  /** The season's teams by id, with their division's name where it has one. */
  readonly teamsOf: (seasonId: string) => Promise<ReadonlyMap<string, MovedTeam>>;
};

export type PartSaveResult =
  | {
      readonly kind: 'saved';
      readonly part: SeasonPart;
      readonly seasonId: string;
      /** The season's own short name, as read: never anything typed into the form. */
      readonly seasonSlug: string;
    }
  | { readonly kind: 'answer'; readonly state: PartState; readonly changed: boolean };

/** The refusals the screen has words of its own for; anything else is "could not be saved". */
const refusalCodes = ['changed-since-read', 'not-allowed', 'season-not-found'] as const;

function refusedFor(code: string, typed: TypedFields): PartSaveResult {
  const known = refusalCodes.find((c) => c === code);
  return {
    kind: 'answer',
    // The season may have changed: the page is drawn again as it is now, keeping what was typed.
    changed: code !== 'invalid-input',
    state: {
      kind: 'refused',
      typed,
      wrong: [],
      said: t(`seasonSettings.refused.${known ?? 'other'}` as TextKey),
      // Changed meanwhile (T-418): beside each box that differs, what is saved now.
      ...(code === 'changed-since-read'
        ? {
            savedNow: {
              label: t('seasonSettings.savedNow'),
              nothing: t('seasonSettings.savedNowNothing'),
              ticked: t('seasonSettings.savedNowTicked'),
              unticked: t('seasonSettings.savedNowUnticked'),
            },
          }
        : {}),
    },
  };
}

function wrongBoxes(wrong: readonly WrongField[], typed: TypedFields): PartSaveResult {
  const boxes = wrong.filter((w) => w.field !== '');
  return {
    kind: 'answer',
    changed: false,
    state: {
      kind: 'refused',
      typed,
      wrong: boxes.map((w) => ({ field: w.field, said: wrongSaid(w) })),
      said:
        boxes.length === wrong.length
          ? t('seasonSettings.refused.boxes')
          : wrongSaid({ field: '', why: 'rules' }),
    },
  };
}

export async function runPartSave(
  context: CommandContext,
  fields: TypedFields,
  deps: PartSaveDeps,
): Promise<PartSaveResult> {
  const typed = typedOnly(fields);
  const part = fields['part'];
  const seasonId = fields['seasonId'] ?? '';
  const version = Number(fields['version']);
  const step = fields['step'] ?? 'save';
  if (!isSeasonPart(part) || !/^\d{1,12}$/.test(fields['version'] ?? '')) {
    return refusedFor('invalid-input', typed);
  }
  const read = await getSeason(context, { seasonId }, deps.seasons);
  if (!read.ok) return refusedFor(read.error.code, typed);
  const season = read.value;

  // "No, change the rules": the boxes again, as they were typed.
  if (step === 'change') return { kind: 'answer', changed: false, state: { kind: 'enter', typed } };
  // A preset fills the game rules' boxes; nothing is saved.
  if (step === 'preset') {
    const preset = fields['preset'] ?? '';
    if (part !== 'game' || !isGamePreset(preset)) return refusedFor('invalid-input', typed);
    const filled = withPreset(preset, season.rules, typed);
    const said = t('seasonSettings.presetFilled', {
      preset: t(`seasonSettings.preset.${preset}`),
    });
    return { kind: 'answer', changed: false, state: { kind: 'enter', typed: filled, said } };
  }

  if (part === 'name') {
    const reading = nameFromPart(typed);
    if (!reading.ok) return wrongBoxes(reading.wrong, typed);
    const saved = await updateSeason(
      context,
      { seasonId, version, ...reading.value },
      deps.seasons,
    );
    if (saved.ok) return { kind: 'saved', part, seasonId, seasonSlug: season.slug };
    if (saved.error.code === 'season-dates-out-of-order') {
      return wrongBoxes([{ field: 'endsOn', why: 'datesOrder' }], typed);
    }
    return refusedFor(saved.error.code, typed);
  }

  const reading = rulesFromPart(part, season.rules, typed);
  if (!reading.ok) return wrongBoxes(reading.wrong, typed);
  const saved = await setSeasonRules(
    context,
    {
      seasonId,
      version,
      rules: reading.value,
      confirmed: step === 'confirm',
      statisticsSaved: part === 'recording',
    },
    deps.seasons,
  );
  if (saved.ok) return { kind: 'saved', part, seasonId, seasonSlug: season.slug };
  switch (saved.error.code) {
    case 'confirmation-needed': {
      const teams = await deps.teamsOf(seasonId);
      const lines = moveLines(saved.error.moves, (id) => teams.get(id));
      return {
        kind: 'answer',
        changed: false,
        state: {
          kind: 'ask',
          typed,
          heading: askHeading(saved.error.moves.length, season.name),
          lines,
          after: t('seasonSettings.ask.after'),
        },
      };
    }
    case 'unique-jerseys-clash':
      return wrongBoxes([{ field: 'uniqueJerseys', why: 'uniqueJerseys' }], typed);
    default:
      return refusedFor(saved.error.code, typed);
  }
}
