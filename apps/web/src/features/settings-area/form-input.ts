// A settings form's text fields turned into a command's input (step 2.48). Nothing here
// decides whether a value is allowed: the command checks it against the setting's own
// declaration and refuses what is not. This only turns what a field of that kind sends
// (a choice's word, "true" or "false", a typed number) into the value the schema reads.
import type { SettingKind } from '@srleagues/core';

/** The button that puts a setting back to its default, as the form names it. */
export const clearIntent = 'clear';

export type Fields = Readonly<Record<string, string>>;

/** The value a field of this kind sent; undefined when it sent nothing usable (the command refuses). */
export function valueOf(field: SettingKind, raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  switch (field.kind) {
    case 'choice':
    case 'text':
      return raw;
    case 'toggle':
      return raw === 'true' ? true : raw === 'false' ? false : undefined;
    case 'number': {
      const typed = raw.trim();
      return typed === '' ? undefined : Number(typed);
    }
    case 'other':
      return undefined;
  }
}

/** The version the person was looking at (A-8): null when the setting had none; NaN when garbled. */
export function versionOf(fields: Fields): number | null {
  const typed = (fields['version'] ?? '').trim();
  return typed === '' ? null : Number(typed);
}
