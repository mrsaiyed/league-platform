// Declaring a setting (T5 §6, T-98). Every setting in the product is declared once,
// in code, with a key, a schema with limits, a default, the levels it can be set at,
// the permission to change it and a label in the message files. Declaring one that
// lacks any of these throws, so a setting cannot exist half-described and the admin
// screens (generated from the declarations) never show one.
import { z } from 'zod';
import { isPermission, type Permission } from '../../access/index.ts';

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
};

export type Setting<Value = unknown> = {
  readonly key: string;
  readonly type: z.ZodType<Value>;
  readonly default: Value;
  readonly levels: readonly SettingLevel[];
  readonly permission: Permission;
  readonly label: string;
  readonly version: number;
  readonly upgrade: ((fromVersion: number, value: unknown) => unknown) | undefined;
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
}

export function defineSetting<Schema extends z.ZodType>(
  declaration: SettingDeclaration<Schema>,
): Setting<z.output<Schema>> {
  check(declaration as unknown as Record<string, unknown>);
  return Object.freeze({
    key: declaration.key,
    type: declaration.type as z.ZodType<z.output<Schema>>,
    default: declaration.default,
    levels: Object.freeze([...declaration.levels]),
    permission: declaration.permission,
    label: declaration.label,
    version: declaration.version ?? 1,
    upgrade: declaration.upgrade,
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
