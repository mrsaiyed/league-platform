import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { declaredSettings } from './declarations.ts';
import { defineSetting } from './define-setting.ts';
import { describeSetting } from './describe-setting.ts';

const declare = <S extends z.ZodType>(type: S, value: z.output<S>) =>
  defineSetting({
    key: 'test.example',
    type,
    default: value,
    levels: ['league'],
    permission: 'league.settings',
    label: 'setting.test.example.label',
  });

describe('describing a setting for a screen', () => {
  it('turns a list of choices, a yes or no, a number and a text into their fields', () => {
    expect(describeSetting(declare(z.enum(['a', 'b']), 'a')).field).toEqual({
      kind: 'choice',
      choices: ['a', 'b'],
    });
    expect(describeSetting(declare(z.boolean(), true)).field).toEqual({ kind: 'toggle' });
    expect(describeSetting(declare(z.number().int().min(2).max(9), 3)).field).toEqual({
      kind: 'number',
      min: 2,
      max: 9,
      whole: true,
    });
    expect(describeSetting(declare(z.string().max(40), 'hi')).field).toEqual({
      kind: 'text',
      maxLength: 40,
    });
  });

  it('carries the key, the label key and the default', () => {
    expect(describeSetting(declare(z.boolean(), false))).toMatchObject({
      key: 'test.example',
      label: 'setting.test.example.label',
      default: false,
    });
  });

  it('leaves lists and groups as something to show, not to edit here', () => {
    expect(describeSetting(declare(z.array(z.string().max(5)).max(3), [])).field).toEqual({
      kind: 'other',
    });
  });

  it('describes every setting the product declares', () => {
    for (const setting of declaredSettings.all()) {
      expect(describeSetting(setting).field.kind).not.toBe('other');
    }
  });
});
