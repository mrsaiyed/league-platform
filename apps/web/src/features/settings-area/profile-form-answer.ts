// What a refused or saved form of League settings → Profile marks and says (step 2.155
// part 3, T-416; A-4): the box a refusal is about and a sentence from the message files
// that names it ("Short name (in the address): Another league already has that short
// name…"); after a save, which form the "Saved" line stands beside and its words. The
// fixed words of a command's error only, never anything typed (T-187).
import { t, type TextKey } from '../../server/messages.ts';
import { problemKey } from './answer.ts';

/** The Profile forms that answer in the response to the post. */
export const profileForms = ['name', 'shortName', 'profile', 'whoPlays'] as const;
export type ProfileFormName = (typeof profileForms)[number];

/** Each form's boxes, in the order they are on the screen, with their labels. */
const boxesOf: Readonly<Record<ProfileFormName, Readonly<Record<string, TextKey>>>> = {
  name: { name: 'adminSettings.profile.name' },
  shortName: { slug: 'adminSettings.profile.shortName' },
  profile: {
    contactEmail: 'adminSettings.profile.contactEmail',
    city: 'adminSettings.profile.city',
    timeZone: 'adminSettings.profile.timeZone',
    listed: 'adminSettings.profile.listed',
  },
  whoPlays: {
    audience: 'adminSettings.profile.whoPlays',
    confirmed: 'adminSettings.profile.confirmTowardAdults',
  },
};

/** A refusal a command gives for one box, by its code. */
const boxOfCode: Readonly<Record<string, string>> = {
  'short-name-taken': 'slug',
  'short-name-blocked': 'slug',
  'confirmation-needed': 'confirmed',
};

export type ProfileRefusal = { readonly wrong: readonly string[]; readonly said: string };

/**
 * The boxes to mark and the sentence to say beside the first. A refusal about no one box
 * (the league changed meanwhile, say) marks none and is said beside the button.
 */
export function profileRefusal(
  form: ProfileFormName,
  command: string,
  code: string,
  issues: readonly { readonly path: string }[] = [],
): ProfileRefusal {
  const boxes = boxesOf[form];
  const names = Object.keys(boxes);
  const why = t(problemKey({ problem: `${command}.${code}` }) ?? 'error.unknown');
  let wrong = names.filter((box) =>
    issues.some((issue) => issue.path === box || issue.path.startsWith(`${box}.`)),
  );
  const own = boxOfCode[code];
  if (own !== undefined && own in boxes) wrong = [own];
  // A form of one box refused for what was typed: that box, whatever the issue's path.
  const only = names[0];
  if (wrong.length === 0 && code === 'invalid-input' && names.length === 1 && only !== undefined) {
    wrong = [only];
  }
  const first = wrong[0];
  const label = first === undefined ? undefined : boxes[first];
  return {
    wrong,
    said: label === undefined ? why : t('adminSettings.fieldRefused', { field: t(label), why }),
  };
}

/** What a saved Profile form leaves in the notice: the form, and what the save did. */
export const profileSaids = [
  'name',
  'shortName',
  'profile',
  'firstChild',
  'whoPlays',
  'audienceClearedFullNames',
] as const;
export type ProfileSaid = (typeof profileSaids)[number];

const formOfSaid: Readonly<Record<ProfileSaid, ProfileFormName>> = {
  name: 'name',
  shortName: 'shortName',
  profile: 'profile',
  firstChild: 'profile',
  whoPlays: 'whoPlays',
  audienceClearedFullNames: 'whoPlays',
};

/** The form a notice's "Saved" line stands beside, and its words; undefined for another notice. */
export function profileSaved(
  said: string | undefined,
): { readonly form: ProfileFormName; readonly text: string } | undefined {
  const found = profileSaids.find((name) => name === said);
  if (found === undefined) return undefined;
  return { form: formOfSaid[found], text: t(`adminSettings.saved.${found}` as TextKey) };
}
