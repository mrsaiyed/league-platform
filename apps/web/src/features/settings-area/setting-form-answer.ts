// What a refused or saved League settings form of one setting marks and says (step 2.155
// part 4, T-417; A-4): the box a refusal is about and a sentence from the message files
// that names the setting ("Who may score: That value is not one this setting accepts…");
// after a save, which setting the "Saved" line stands beside and its words. The fixed
// words of a command's error only, never anything typed (T-187).
import { catalogs } from '@srleagues/site';
import { t, type TextKey } from '../../server/messages.ts';
import { problemKey } from './answer.ts';

/**
 * A setting's short name (T-419): `setting.<key>.name` beside its `.label`, a few words with
 * no full stop, so "Saved: <name>." reads as one sentence. A label with no name (a setting
 * declared only in a test) is used as it is.
 */
export function settingName(label: TextKey): TextKey {
  const name = label.replace(/\.label$/, '.name');
  return name !== label && Object.hasOwn(catalogs['en'] ?? {}, name) ? (name as TextKey) : label;
}

/** What a saved setting form leaves in the notice (its `said`); its `thing` is the key. */
export const settingSaids = ['setting', 'settingCleared'] as const;
export type SettingSaid = (typeof settingSaids)[number];

export type SettingRefusal = { readonly wrong: readonly string[]; readonly said: string };

/**
 * The boxes to mark and the sentence. A setting's form has one box, `value`, or, for a
 * yes-or-no drawn as one tick (record 065), only the tick `confirmed`; a refusal for the
 * missing confirmation marks the tick. A refusal about no box (the league changed
 * meanwhile, not allowed) marks none and is said beside the buttons.
 */
export function settingRefusal(
  label: TextKey,
  command: string,
  code: string,
  drawnAsTick: boolean,
): SettingRefusal {
  const key = problemKey({ problem: `${command}.${code}` }) ?? 'error.unknown';
  // Changed meanwhile: the screen keeps what was typed with "Saved now" beside it, so the
  // sentence says that, not the general "the page now shows the latest".
  const why = t(code === 'changed-since-read' ? 'adminSettings.changedMeanwhile' : key);
  const box =
    code === 'confirmation-needed'
      ? 'confirmed'
      : code === 'invalid-value' || code === 'invalid-input'
        ? drawnAsTick
          ? 'confirmed'
          : 'value'
        : undefined;
  return box === undefined
    ? { wrong: [], said: why }
    : {
        wrong: [box],
        said: t('adminSettings.fieldRefused', { field: t(settingName(label)), why }),
      };
}

/** The setting a notice's "Saved" line stands beside, and its words; undefined for another notice. */
export function settingSaved(
  notice: { readonly thing: string; readonly said: string } | undefined,
  labelOf: (key: string) => TextKey | undefined,
): { readonly key: string; readonly text: string } | undefined {
  const said = settingSaids.find((name) => name === notice?.said);
  const label = notice === undefined ? undefined : labelOf(notice.thing);
  if (said === undefined || notice === undefined || label === undefined) return undefined;
  return {
    key: notice.thing,
    text: t(`adminSettings.saved.${said}`, { setting: t(settingName(label)) }),
  };
}
