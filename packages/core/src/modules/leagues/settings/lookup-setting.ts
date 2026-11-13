// The value of a setting at a place: most specific first, season, then program, then
// league, then our default (T5 §6). A stored value that no longer passes the
// declaration (a limit tightened, a level it is no longer set at) is ignored, so the
// lookup falls to the next level and never returns something the schema refuses.
import type { Setting, SettingLevel } from './define-setting.ts';

/** A row of setting_values as storage hands it over: the level and the stored document. */
export type StoredSetting = { readonly level: SettingLevel; readonly document: unknown };

export type SettingValue<Value> = {
  readonly value: Value;
  /** Where it came from. */
  readonly source: SettingLevel | 'default';
};

const mostSpecificFirst: readonly SettingLevel[] = ['season', 'program', 'league'];

/** The value inside a stored `{version, value}` document, upgraded; undefined if it is not usable. */
function valueOf<Value>(setting: Setting<Value>, document: unknown): Value | undefined {
  if (typeof document !== 'object' || document === null) return undefined;
  const { version, value } = document as { version?: unknown; value?: unknown };
  if (typeof version !== 'number' || !Number.isInteger(version) || value === undefined) {
    return undefined;
  }
  let current: unknown = value;
  if (version !== setting.version) {
    if (version > setting.version || setting.upgrade === undefined) return undefined;
    try {
      current = setting.upgrade(version, value);
    } catch {
      return undefined;
    }
  }
  const parsed = setting.type.safeParse(current);
  return parsed.success ? parsed.data : undefined;
}

export function lookupSetting<Value>(
  setting: Setting<Value>,
  stored: readonly StoredSetting[],
): SettingValue<Value> {
  for (const level of mostSpecificFirst) {
    if (!setting.levels.includes(level)) continue;
    for (const row of stored) {
      if (row.level !== level) continue;
      const value = valueOf(setting, row.document);
      if (value !== undefined) return { value, source: level };
    }
  }
  return { value: setting.default, source: 'default' };
}

/** The document a value is stored as (record 019). */
export const settingDocument = (setting: Setting, value: unknown) => ({
  version: setting.version,
  value,
});
