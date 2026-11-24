'use server';
// The League settings screen's server action (step 2.48): one form for each setting,
// which saves its value or goes back to the default. Plain form posts, so the screen
// works with no script in the page, and each runs the product's own command
// (runSettingsAction): who is acting and in which league come from the session.
import {
  clearSetting,
  declaredSettings,
  describeSetting,
  renameShortName,
  setLeagueAudience,
  setLeagueName,
  setLeagueProfile,
  setSetting,
} from '@srleagues/core';
import { done, refused } from './answer.ts';
import { clearIntent, tickValue, valueOf, versionOf } from './form-input.ts';
import { runArchive, runPublish } from './run-publish.ts';
import { runSettingsAction } from './run-settings-action.ts';

export async function saveSettingAction(form: FormData): Promise<never> {
  return runSettingsAction(form, async ({ context, ports, fields }) => {
    const key = fields['key'] ?? '';
    const version = versionOf(fields);
    if (fields['intent'] === clearIntent) {
      // Going back to the default needs the version of the value being removed.
      const result = await clearSetting(
        context,
        { level: 'league', key, version: version ?? Number.NaN },
        ports.deps,
      );
      return result.ok ? done('cleared') : refused(clearSetting.commandName, result.error.code);
    }
    const setting = declaredSettings.get(key);
    // The box ticked to confirm a value that asks for it (R-14); the command checks it.
    const confirmed = fields['confirmed'] === 'yes';
    // A yes-or-no setting drawn as one box to tick (the parents' confirmation, record
    // 065): ticked is yes and confirmed, unticked is no.
    const field = setting === undefined ? undefined : describeSetting(setting).field;
    const value =
      field === undefined
        ? undefined
        : field.kind === 'toggle' && fields['value'] === tickValue
          ? confirmed
          : valueOf(field, fields['value']);
    const result = await setSetting(
      context,
      { level: 'league', key, value, version, confirmed },
      ports.deps,
    );
    return result.ok ? done('saved') : refused(setSetting.commandName, result.error.code);
  });
}

/**
 * Publishes the league (step 2.240, U-9): the Publish button's form, after the page asked
 * once. What it does is runPublish's; the league and the person come from the session.
 */
export async function publishLeagueAction(form: FormData): Promise<never> {
  return runSettingsAction(form, ({ context, ports, fields }) =>
    runPublish(context, ports.deps, versionOf(fields) ?? Number.NaN),
  );
}

// League settings → Profile (step 2.125 part 2): each form runs the product's own command.

/** The name the league shows (setLeagueName). */
export async function saveLeagueNameAction(form: FormData): Promise<never> {
  return runSettingsAction(form, async ({ context, ports, fields }) => {
    const input = { name: fields['name'] ?? '', version: versionOf(fields) ?? Number.NaN };
    const result = await setLeagueName(context, input, ports.deps);
    return result.ok ? done('saved') : refused(setLeagueName.commandName, result.error.code);
  });
}

/** The short name in the league's address; the old one forwards for 12 months (U-7). */
export async function renameShortNameAction(form: FormData): Promise<never> {
  return runSettingsAction(form, async ({ context, ports, fields }) => {
    const input = { slug: fields['slug'] ?? '', version: versionOf(fields) ?? Number.NaN };
    const result = await renameShortName(context, input, ports.deps);
    return result.ok ? done('renamed') : refused(renameShortName.commandName, result.error.code);
  });
}

/** How people reach the league, where it plays, its clock and its listing (U-10). */
export async function saveLeagueProfileAction(form: FormData): Promise<never> {
  return runSettingsAction(form, async ({ context, ports, fields }) => {
    const input = {
      contactEmail: fields['contactEmail'] ?? '',
      city: fields['city'] ?? '',
      timeZone: fields['timeZone'] ?? '',
      listed: fields['listed'] === 'yes',
      version: versionOf(fields) ?? Number.NaN,
    };
    const result = await setLeagueProfile(context, input, ports.deps);
    return result.ok ? done('saved') : refused(setLeagueProfile.commandName, result.error.code);
  });
}

/** Who plays (R-14, R-29): the tick a move toward adults asks for; the command decides. */
export async function saveLeagueAudienceAction(form: FormData): Promise<never> {
  return runSettingsAction(form, async ({ context, ports, fields }) => {
    const input = {
      audience: fields['audience'] ?? '',
      confirmed: fields['confirmed'] === 'yes',
      version: versionOf(fields) ?? Number.NaN,
    };
    const result = await setLeagueAudience(context, input, ports.deps);
    if (!result.ok) return refused(setLeagueAudience.commandName, result.error.code);
    return done(result.value.clearedChildrenInFull ? 'audienceClearedFullNames' : 'saved');
  });
}

/** Archive a published league, or bring an archived one back (U-9, U-14). */
export async function changeLeagueStatusAction(form: FormData): Promise<never> {
  return runSettingsAction(form, ({ context, ports, fields }) =>
    runArchive(
      context,
      ports.deps,
      fields['to'] === 'archived' ? 'archived' : 'live',
      versionOf(fields) ?? Number.NaN,
    ),
  );
}
