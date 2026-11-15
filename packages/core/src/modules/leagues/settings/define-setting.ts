// Declaring a setting (T5 §6, T-98). Every setting in the product is declared once,
// in code, with a key, a schema with limits, a default, the levels it can be set at,
// the permission to change it and a label in the message files. Declaring one that
// lacks any of these throws, so a setting cannot exist half-described and the admin
// screens (generated from the declarations) never show one.
import { z } from 'zod';
import { isPermission, type Permission } from '../../access/index.ts';
import { audiences, type Audience } from '../league-values.ts';

export const settingLevels = ['league', 'program', 'season'] as const;
export type SettingLevel = (typeof settingLevels)[number];

/** The same shape the database accepts (setting_values_key_format, record 019). */
const keyFormat = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

export type SettingDeclaration<Schema extends z.ZodType> = {
  /** An area and a camelCase name, dotted: `members.startPage`. */
  readonly key: string;
  /** What a value may be. Must carry limits (a number's range, a text's length, a list's size). */
  readonly type: Schema;
  readonly default: z.output<Schema>;
  /**
   * A starting value that depends on who plays in the league (record 065, T-268): a
   * league of a listed audience starts there instead of at `default`, which stays the
   * start of every other league and of a place whose league is not known. Read each
   * time, so a league that changes who plays and has saved nothing starts again from
   * its new audience's value.
   */
  readonly startsAs?: Readonly<Partial<Record<Audience, z.output<Schema>>>>;
  /** Where it can be set. Most specific wins when read: season, program, league. */
  readonly levels: readonly SettingLevel[];
  /** Who may change it (T4 §4). */
  readonly permission: Permission;
  /** The message key (T-187) of the words the admin screen shows: `setting.<key>.label`. */
  readonly label: string;
  /** The format version of a stored value (record 019). Raise it when the shape changes. */
  readonly version?: number;
  /** Brings a value stored at an older version to the current one. */
  readonly upgrade?: (fromVersion: number, value: unknown) => unknown;
  /**
   * Values the admin must confirm before saving (R-14: full names, confirming the league
   * has the permission it needs). The words of what they confirm are the message
   * `setting.<key>.confirm`; the command refuses such a value unless it is confirmed.
   * Where such a value is the league's own starting value (`startsAs`), it is not asked
   * to be confirmed: saved unconfirmed, it puts the league back on its start, so a
   * stored value of this kind is always a confirmed one (record 065).
   */
  readonly confirm?: readonly z.output<Schema>[];
  /**
   * For a setting that decides how much of people is public (R-26): its values from the
   * one that shows the most to the one that shows the least, each once. Moving the
   * league's value to a later one protects people, so it works even while the league is
   * archived or suspended; every other change is refused there (U-9).
   */
  readonly protectiveOrder?: readonly z.output<Schema>[];
};

export type Setting<Value = unknown> = {
  readonly key: string;
  readonly type: z.ZodType<Value>;
  readonly default: Value;
  /** Starting values by who plays in the league; empty for most settings (record 065). */
  readonly startsAs: Readonly<Partial<Record<Audience, Value>>>;
  readonly levels: readonly SettingLevel[];
  readonly permission: Permission;
  readonly label: string;
  readonly version: number;
  readonly upgrade: ((fromVersion: number, value: unknown) => unknown) | undefined;
  /** Values that need confirming before they are saved; empty for most settings. */
  readonly confirm: readonly Value[];
  /** From the most shown to the least (R-26); empty for most settings. */
  readonly protectiveOrder: readonly Value[];
};

export class SettingDeclarationError extends Error {
  constructor(key: unknown, problem: string) {
    super(`Setting ${String(key)} cannot be declared: ${problem}.`);
    this.name = 'SettingDeclarationError';
  }
}

/** A bound this large is zod's own safe-integer bound, not a limit somebody chose. */
const isChosen = (bound: unknown) =>
  typeof bound === 'number' && Math.abs(bound) < Number.MAX_SAFE_INTEGER;

type Json = { [key: string]: unknown };
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null;
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : []);

/** Whether every part of a schema (described as JSON Schema) has limits. */
export function hasLimits(schema: unknown): boolean {
  if (!isObject(schema)) return false;
  const alternatives = [...list(schema.anyOf), ...list(schema.oneOf)];
  if (alternatives.length > 0) return alternatives.every(hasLimits);
  if (schema.const !== undefined || Array.isArray(schema.enum)) return true;
  switch (schema.type) {
    case 'boolean':
      return true;
    case 'number':
    case 'integer':
      return isChosen(schema.minimum) && isChosen(schema.maximum);
    case 'string':
      return isChosen(schema.maxLength);
    case 'array':
      return isChosen(schema.maxItems) && hasLimits(schema.items);
    case 'object':
      // A fixed set of named parts only: a record, a loose object or a catchall accepts
      // any number of extra keys, which is no limit.
      if (!isObject(schema.properties) || schema.propertyNames !== undefined) return false;
      if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
        return false;
      }
      return Object.values(schema.properties).every(hasLimits);
    default:
      return false;
  }
}

function check(declaration: Record<string, unknown>): void {
  const { key } = declaration;
  const refuse = (problem: string) => new SettingDeclarationError(key, problem);
  if (typeof key !== 'string' || !keyFormat.test(key) || key.length > 100) {
    throw refuse('its key must be a dotted camelCase name of at most 100 characters');
  }
  if (!(declaration.type instanceof z.ZodType)) throw refuse('it has no schema');
  if (declaration.default === undefined) throw refuse('it has no default');
  const { levels } = declaration;
  if (
    !Array.isArray(levels) ||
    levels.length === 0 ||
    levels.some((l) => !settingLevels.includes(l as SettingLevel)) ||
    new Set(levels).size !== levels.length
  ) {
    throw refuse('it must name the levels it can be set at, each once');
  }
  if (!isPermission(declaration.permission)) throw refuse('it names no known permission');
  if (declaration.label !== `setting.${key}.label`) {
    throw refuse('it needs a label in the message files, named setting.<key>.label');
  }
  const { version } = declaration;
  if (version !== undefined && (!Number.isInteger(version) || (version as number) < 1)) {
    throw refuse('its version must be a whole number from 1');
  }
  let described: unknown;
  try {
    described = z.toJSONSchema(declaration.type, { io: 'input' });
  } catch {
    throw refuse('its schema cannot be described, so its limits cannot be shown');
  }
  try {
    z.toJSONSchema(declaration.type, { io: 'output' });
  } catch {
    // A transform stores one thing and reads another, so the limits shown would be wrong.
    throw refuse('its schema transforms the value, which a stored setting must not');
  }
  if (declaration.type.safeParse(undefined).success) {
    throw refuse('its schema accepts no value at all (optional), which cannot be stored');
  }
  if (!hasLimits(described)) {
    throw refuse('its schema has no limits (a range, a length or a list of choices)');
  }
  if (!declaration.type.safeParse(declaration.default).success) {
    throw refuse('its default does not pass its own schema');
  }
  const schema = declaration.type;
  const { startsAs } = declaration;
  if (
    startsAs !== undefined &&
    (typeof startsAs !== 'object' ||
      startsAs === null ||
      Array.isArray(startsAs) ||
      Object.entries(startsAs).some(
        ([audience, value]) =>
          !audiences.includes(audience as Audience) || !schema.safeParse(value).success,
      ))
  ) {
    throw refuse('its starting values must be given by audience, each passing its schema');
  }
  const { confirm } = declaration;
  if (
    confirm !== undefined &&
    (!Array.isArray(confirm) || confirm.some((value) => !schema.safeParse(value).success))
  ) {
    throw refuse('the values it asks to confirm must be a list of values that pass its schema');
  }
  const order = declaration.protectiveOrder;
  if (
    order !== undefined &&
    (!Array.isArray(order) ||
      order.length === 1 ||
      order.some((value) => !schema.safeParse(value).success) ||
      new Set(order.map((value) => JSON.stringify(value))).size !== order.length)
  ) {
    throw refuse('its protective order must list none, or two or more of its values, each once');
  }
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Whether the setting's starting value depends on who plays in the league (record 065). */
export function startsByAudience(setting: Setting): boolean {
  return Object.keys(setting.startsAs).length > 0;
}

/**
 * Where a league of this audience starts: its own starting value, or the default. An
 * audience that is not known starts at the default.
 */
export function startingValue<Value>(setting: Setting<Value>, audience?: Audience): Value {
  if (audience === undefined || !Object.hasOwn(setting.startsAs, audience)) return setting.default;
  return setting.startsAs[audience] as Value;
}

/** Whether saving this value asks the admin to confirm first (R-14). */
export function needsConfirming(setting: Setting, value: unknown): boolean {
  return setting.confirm.some((candidate) => sameValue(candidate, value));
}

/**
 * The values that ask to be confirmed in a league of this audience: all of them but
 * the league's own starting value, which never needed a confirmation (record 065).
 */
export function confirmedValuesFor(setting: Setting, audience?: Audience): readonly unknown[] {
  const start = startingValue(setting, audience);
  return setting.confirm.filter((value) => !sameValue(value, start));
}

/** Whether two setting values are the same. */
export const sameSettingValue = sameValue;

/**
 * Whether moving from `from` to `to` shows less of people (R-26): both are in the
 * setting's protective order and `to` comes later. A setting with no order, or a value
 * not in it, never counts.
 */
export function showsLess(setting: Setting, from: unknown, to: unknown): boolean {
  const before = setting.protectiveOrder.findIndex((value) => sameValue(value, from));
  const after = setting.protectiveOrder.findIndex((value) => sameValue(value, to));
  return before >= 0 && after > before;
}

export function defineSetting<Schema extends z.ZodType>(
  declaration: SettingDeclaration<Schema>,
): Setting<z.output<Schema>> {
  check(declaration as unknown as Record<string, unknown>);
  return Object.freeze({
    key: declaration.key,
    type: declaration.type as z.ZodType<z.output<Schema>>,
    default: declaration.default,
    startsAs: Object.freeze({ ...(declaration.startsAs ?? {}) }),
    levels: Object.freeze([...declaration.levels]),
    permission: declaration.permission,
    label: declaration.label,
    version: declaration.version ?? 1,
    upgrade: declaration.upgrade,
    confirm: Object.freeze([...(declaration.confirm ?? [])]),
    protectiveOrder: Object.freeze([...(declaration.protectiveOrder ?? [])]),
  });
}

export type SettingRegistry = {
  readonly get: (key: string) => Setting | undefined;
  readonly all: () => readonly Setting[];
};

/** A list of declared settings by key. The same key twice throws. */
export function settingRegistry(settings: readonly Setting[]): SettingRegistry {
  const byKey = new Map<string, Setting>();
  for (const setting of settings) {
    if (byKey.has(setting.key)) {
      throw new SettingDeclarationError(setting.key, 'it is declared twice');
    }
    byKey.set(setting.key, setting);
  }
  return { get: (key) => byKey.get(key), all: () => [...byKey.values()] };
}
