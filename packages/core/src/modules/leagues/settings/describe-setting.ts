// What a screen needs to draw a setting's field, worked out from its declaration alone
// (T-98): the kind of field, the choices or limits its schema carries, and its default.
// No setting is described by hand anywhere; a setting declared with a new schema shows
// the right field with no change to the screen.
import { z } from 'zod';
import type { Setting } from './define-setting.ts';

type Json = { readonly [key: string]: unknown };
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null;

/** What a field is, as far as a screen can draw it. */
export type SettingKind =
  /** One of a fixed list of words. */
  | { readonly kind: 'choice'; readonly choices: readonly string[] }
  /** Yes or no. */
  | { readonly kind: 'toggle' }
  /** A number between two limits; `whole` when only whole numbers are accepted. */
  | {
      readonly kind: 'number';
      readonly min: number;
      readonly max: number;
      readonly whole: boolean;
    }
  /** Text of at most `maxLength` characters. */
  | { readonly kind: 'text'; readonly maxLength: number }
  /** A list or a group of values, which this screen only shows. */
  | { readonly kind: 'other' };

export type SettingField = {
  readonly key: string;
  /** The message key of the setting's words. */
  readonly label: string;
  readonly default: unknown;
  readonly field: SettingKind;
  /**
   * The values saving which asks the admin to confirm first (R-14), worded by the
   * message `setting.<key>.confirm`. Empty for most settings.
   */
  readonly confirm: readonly unknown[];
};

const strings = (v: unknown): readonly string[] | undefined =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined;

/** The kind of field a declared setting's schema is, from the schema described as JSON Schema. */
export function kindOf(schema: unknown): SettingKind {
  if (!isObject(schema)) return { kind: 'other' };
  if (typeof schema['const'] === 'string') return { kind: 'choice', choices: [schema['const']] };
  const choices = strings(schema['enum']);
  if (choices !== undefined) return { kind: 'choice', choices };
  switch (schema['type']) {
    case 'boolean':
      return { kind: 'toggle' };
    case 'number':
    case 'integer': {
      const { minimum, maximum } = schema;
      return typeof minimum === 'number' && typeof maximum === 'number'
        ? { kind: 'number', min: minimum, max: maximum, whole: schema['type'] === 'integer' }
        : { kind: 'other' };
    }
    case 'string': {
      const max = schema['maxLength'];
      return typeof max === 'number' ? { kind: 'text', maxLength: max } : { kind: 'other' };
    }
    default:
      return { kind: 'other' };
  }
}

export function describeSetting(setting: Setting): SettingField {
  return {
    key: setting.key,
    label: setting.label,
    default: setting.default,
    field: kindOf(z.toJSONSchema(setting.type, { io: 'input' })),
    confirm: setting.confirm,
  };
}
