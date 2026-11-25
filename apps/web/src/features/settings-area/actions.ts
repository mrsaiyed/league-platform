'use server';
// The League settings screen's server action (step 2.48): one form for each setting,
// which saves its value or goes back to the default. Plain form posts, so the screen
// works with no script in the page, and each runs the product's own command
// (runSettingsAction): who is acting and in which league come from the session.
import {
  clearSetting,
  declaredSettings,
  describeSetting,
  leagueUrl,
  renameShortName,
  setLeagueAudience,
  setLeagueName,
  setLeagueProfile,
  setSetting,
} from '@srleagues/core';
import { done, refused } from './answer.ts';
import { clearIntent, tickValue, valueOf, versionOf } from './form-input.ts';
import { runArchive, runPublish } from './run-publish.ts';
import { runSettingsAction, type SettingsAction } from './run-settings-action.ts';
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
import { profileRefusal, type ProfileFormName, type ProfileSaid } from './profile-form-answer.ts';
import { profilePlace } from './profile-place.ts';

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
// Since step 2.155 part 3 (T-416) each answers in the response to the post: refused, every
// box as typed, the wrong one marked and named; saved, "Saved: …" beside the form, once.

type ProfileResult =
  | { readonly kind: 'done'; readonly said: ProfileSaid; readonly slug?: string }
  | {
      readonly kind: 'refused';
      readonly command: string;
      readonly code: string;
      readonly issues?: readonly { readonly path: string }[];
    };

const refusedBy = (
  command: { readonly commandName: string },
  error: { readonly code: string },
): ProfileResult => {
  const { issues } = error as { readonly issues?: readonly { readonly path: string }[] };
  return {
    kind: 'refused',
    command: command.commandName,
    code: error.code,
    ...(issues === undefined ? {} : { issues }),
  };
};

/**
 * One Profile form's post, carried out once (a second tap with the same token gets the
 * first answer) and answered where it was sent. The league and the person come from the
 * session (T-23); the page check refuses anyone who may not open League settings.
 */
async function answerProfileForm(
  formName: ProfileFormName,
  form: FormData,
  work: (action: SettingsAction) => Promise<ProfileResult>,
): Promise<FormState> {
  const fields = typedOf(form);
  const view = await loadLeaguePage(fields['league'] ?? '', 'admin', 'settings');
  const { adminSettings: ports } = await webPorts();
  const context = commandContextOf(view.context);
  const result = await sameRequestsHere<ProfileResult>().once(
    requestKeyOf(context, { ...fields, profileForm: formName }),
    () => work({ context, ports, fields }),
  );
  if (result.kind === 'refused') {
    const refusal = profileRefusal(formName, result.command, result.code, result.issues);
    // Not allowed: said where it was tapped, the page not drawn again (as a team's page).
    if (result.code === 'not-allowed') {
      return { kind: 'refused', code: result.code, typed: fields, wrong: [], said: refusal.said };
    }
    const savedNow =
      result.code === 'changed-since-read'
        ? {
            label: t('adminSettings.savedNow'),
            nothing: t('adminSettings.savedNowNothing'),
            ticked: t('adminSettings.savedNowTicked'),
            unticked: t('adminSettings.savedNowUnticked'),
          }
        : undefined;
    return refusedWith(result.code, fields, refusal.wrong, refusal.said, savedNow);
  }
  const notice = { screen: 'settings', thing: formName, said: result.said } as const;
  if (result.slug !== undefined) {
    // A new short name is a new address: the browser goes there, scripts on or off.
    const league = { ...view.context.league, slug: result.slug };
    const at = leagueUrl(league, 'admin-area', { area: 'settings' });
    return answerSavedAt(context, notice, `${at}#${profilePlace}`);
  }
  const at = leagueUrl(view.context.league, 'admin-area', { area: 'settings' });
  return answerSaved(context, notice, `${at}#${profilePlace}`);
}

/** The name the league shows (setLeagueName). */
export async function saveLeagueNameAction(_state: FormState, form: FormData): Promise<FormState> {
  return answerProfileForm('name', form, async ({ context, ports, fields }) => {
    const input = { name: fields['name'] ?? '', version: versionOf(fields) ?? Number.NaN };
    const result = await setLeagueName(context, input, ports.deps);
    return result.ok ? { kind: 'done', said: 'name' } : refusedBy(setLeagueName, result.error);
  });
}

/** The short name in the league's address; the old one forwards for 12 months (U-7). */
export async function renameShortNameAction(_state: FormState, form: FormData): Promise<FormState> {
  return answerProfileForm('shortName', form, async ({ context, ports, fields }) => {
    const input = { slug: fields['slug'] ?? '', version: versionOf(fields) ?? Number.NaN };
    const result = await renameShortName(context, input, ports.deps);
    return result.ok
      ? { kind: 'done', said: 'shortName', slug: result.value.slug }
      : refusedBy(renameShortName, result.error);
  });
}

/** How people reach the league, where it plays, its clock and its listing (U-10). */
export async function saveLeagueProfileAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  return answerProfileForm('profile', form, async ({ context, ports, fields }) => {
    const input = {
      contactEmail: fields['contactEmail'] ?? '',
      city: fields['city'] ?? '',
      timeZone: fields['timeZone'] ?? '',
      listed: fields['listed'] === 'yes',
      version: versionOf(fields) ?? Number.NaN,
    };
    const result = await setLeagueProfile(context, input, ports.deps);
    if (!result.ok) return refusedBy(setLeagueProfile, result.error);
    return {
      kind: 'done',
      said: result.value.clearedChildrenInFull === true ? 'firstChild' : 'profile',
    };
  });
}

/** Who plays (R-14, R-29): the tick a move toward adults asks for; the command decides. */
export async function saveLeagueAudienceAction(
  _state: FormState,
  form: FormData,
): Promise<FormState> {
  return answerProfileForm('whoPlays', form, async ({ context, ports, fields }) => {
    const input = {
      audience: fields['audience'] ?? '',
      confirmed: fields['confirmed'] === 'yes',
      version: versionOf(fields) ?? Number.NaN,
    };
    const result = await setLeagueAudience(context, input, ports.deps);
    if (!result.ok) return refusedBy(setLeagueAudience, result.error);
    const { clearedChildrenInFull, clearedNamesChoice, unlisted } = result.value;
    return {
      kind: 'done',
      said:
        clearedChildrenInFull || clearedNamesChoice || unlisted
          ? 'audienceClearedFullNames'
          : 'whoPlays',
    };
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
