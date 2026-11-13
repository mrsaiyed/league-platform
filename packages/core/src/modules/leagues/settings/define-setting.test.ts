// T-98: a setting cannot be declared without a default, limits, a label and a permission.
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { declaredSettings } from './declarations.ts';
import {
  defineSetting,
  hasLimits,
  settingRegistry,
  SettingDeclarationError,
} from './define-setting.ts';

const good = {
  key: 'notifications.reminderLeadHours',
  type: z.number().int().min(1).max(72),
  default: 24,
  levels: ['league', 'season'] as const,
  permission: 'league.settings' as const,
  label: 'setting.notifications.reminderLeadHours.label',
};

/** Declares with one field changed or removed, past the compiler, as bad code could. */
const declare = (change: Record<string, unknown>) =>
  defineSetting({ ...good, ...change } as unknown as typeof good);

describe('defineSetting', () => {
  it('declares a complete setting', () => {
    const setting = defineSetting(good);
    expect(setting).toMatchObject({ key: good.key, default: 24, version: 1 });
  });

  it('refuses a setting with no default', () => {
    expect(() => declare({ default: undefined })).toThrow(SettingDeclarationError);
  });

  it('refuses a default its own schema refuses', () => {
    expect(() => declare({ default: 100 })).toThrow(/default/);
  });

  it('refuses a schema with no limits', () => {
    expect(() => declare({ type: z.number().min(1), default: 2 })).toThrow(/limits/);
    expect(() => declare({ type: z.array(z.boolean()), default: [] })).toThrow(/limits/);
    expect(() => declare({ type: z.object({ a: z.string() }), default: { a: '' } })).toThrow(
      /limits/,
    );
    expect(() => declare({ type: z.string(), default: 'x' })).toThrow(/limits/);
    expect(() => declare({ type: z.number().int(), default: 1 })).toThrow(/limits/);
  });

  it('accepts limits of every kind', () => {
    const ok = [
      [z.boolean(), true],
      [z.enum(['a', 'b']), 'a'],
      [z.string().max(40), 'x'],
      [z.number().min(0).max(5), 1],
      [z.array(z.string().max(10)).max(3), []],
      [z.object({ n: z.number().int().min(0).max(9) }), { n: 1 }],
    ] as const;
    for (const [type, value] of ok) expect(() => declare({ type, default: value })).not.toThrow();
  });

  it('refuses a missing or unknown permission', () => {
    expect(() => declare({ permission: undefined })).toThrow(/permission/);
    expect(() => declare({ permission: 'settings.anything' })).toThrow(/permission/);
  });

  it('refuses a missing label, or one that is not its own key', () => {
    expect(() => declare({ label: undefined })).toThrow(/label/);
    expect(() => declare({ label: '' })).toThrow(/label/);
    expect(() => declare({ label: 'Send game reminders' })).toThrow(/label/);
    expect(() => declare({ label: 'setting.other.key.label' })).toThrow(/label/);
  });

  it('refuses missing, empty, repeated or unknown levels', () => {
    for (const levels of [undefined, [], ['league', 'league'], ['team']]) {
      expect(() => declare({ levels })).toThrow(/levels/);
    }
  });

  it('refuses a key that is not a dotted camelCase name', () => {
    for (const key of ['', 'reminder', 'Notifications.x', 'a.b-c', `a.${'x'.repeat(100)}`]) {
      expect(() => declare({ key, label: `setting.${key}.label` })).toThrow(/key/);
    }
  });

  it('refuses a schema that cannot be described', () => {
    expect(() => declare({ type: z.custom<number>(() => true), default: 1 })).toThrow();
  });

  it('refuses the same key twice in one list', () => {
    const one = defineSetting(good);
    expect(() => settingRegistry([one, one])).toThrow(/twice/);
  });
});

describe('hasLimits', () => {
  it('judges whole descriptions, including choices', () => {
    expect(hasLimits({ type: 'string' })).toBe(false);
    expect(hasLimits({ anyOf: [{ type: 'string', maxLength: 3 }, { type: 'string' }] })).toBe(
      false,
    );
    expect(hasLimits({ anyOf: [{ type: 'string', maxLength: 3 }, { type: 'boolean' }] })).toBe(
      true,
    );
    expect(hasLimits(undefined)).toBe(false);
  });
});

describe('the settings stage 2 declares', () => {
  it('all have a default, levels, a permission and a label', () => {
    for (const setting of declaredSettings.all()) {
      expect(setting.type.safeParse(setting.default).success).toBe(true);
      expect(setting.levels.length).toBeGreaterThan(0);
      expect(setting.label).toBe(`setting.${setting.key}.label`);
    }
  });

  it('start members at the league home (P2 section 3)', () => {
    expect(declaredSettings.get('members.startPage')?.default).toBe('leagueHome');
  });
});
