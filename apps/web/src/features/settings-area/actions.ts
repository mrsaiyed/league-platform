'use server';
// The League settings screen's server action (step 2.48): one form for each setting,
// which saves its value or goes back to the default. Plain form posts, so the screen
// works with no script in the page, and each runs the product's own command
// (runSettingsAction): who is acting and in which league come from the session.
import { clearSetting, declaredSettings, describeSetting, setSetting } from '@srleagues/core';
import { done, refused } from './answer.ts';
import { clearIntent, valueOf, versionOf } from './form-input.ts';
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
    const value =
      setting === undefined ? undefined : valueOf(describeSetting(setting).field, fields['value']);
    const result = await setSetting(context, { level: 'league', key, value, version }, ports.deps);
    return result.ok ? done('saved') : refused(setSetting.commandName, result.error.code);
  });
}
