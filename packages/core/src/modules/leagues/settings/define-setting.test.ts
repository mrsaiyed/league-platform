// T-98: a setting cannot be declared without a default, limits, a label and a permission.
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { isPermission, roleHasPermission, roles } from '../../access/index.ts';
import { declaredSettings } from './declarations.ts';
import {
  defineSetting,
  hasLimits,
  needsConfirming,
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

  it('refuses objects that take any other keys (records, loose objects, catchalls)', () => {
    const n = z.number().int().min(0).max(9);
    expect(() => declare({ type: z.record(z.string().max(5), n), default: {} })).toThrow(/limits/);
    expect(() => declare({ type: z.looseObject({ a: n }), default: { a: 1 } })).toThrow(/limits/);
    expect(() => declare({ type: z.object({ a: n }).catchall(n), default: { a: 1 } })).toThrow(
      /limits/,
    );
    expect(hasLimits({ type: 'object', additionalProperties: { type: 'boolean' } })).toBe(false);
    expect(hasLimits({ type: 'object', propertyNames: { maxLength: 3 } })).toBe(false);
    expect(hasLimits({ type: 'object', additionalProperties: false, properties: {} })).toBe(true);
    expect(declare({ type: z.strictObject({ a: n }), default: { a: 1 } }).key).toBe(good.key);
  });

  it('refuses a schema that accepts no value at all (optional), and transforms', () => {
    const n = z.number().int().min(0).max(9);
    expect(() => declare({ type: n.optional(), default: 1 })).toThrow(/optional/);
    expect(() => declare({ type: n.default(1), default: 1 })).toThrow(/optional/);
    expect(() =>
      declare({
        type: z
          .string()
          .max(5)
          .transform((v) => v.length),
        default: 'a',
      }),
    ).toThrow(/transform/);
  });

  it('refuses a schema that cannot be described', () => {
    expect(() => declare({ type: z.custom<number>(() => true), default: 1 })).toThrow();
  });

  it('keeps the values to confirm, and refuses ones its schema refuses', () => {
    expect(defineSetting(good).confirm).toEqual([]);
    const asked = defineSetting({ ...good, confirm: [72] });
    expect(asked.confirm).toEqual([72]);
    expect(needsConfirming(asked, 72)).toBe(true);
    expect(needsConfirming(asked, 24)).toBe(false);
    expect(() => declare({ confirm: [100] })).toThrow(/confirm/);
    expect(declare({ confirm: [] }).confirm).toEqual([]);
    expect(() => declare({ confirm: 72 })).toThrow(/confirm/);
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

  it('each name a permission the set-setting command can check', () => {
    for (const setting of declaredSettings.all()) {
      expect(isPermission(setting.permission)).toBe(true);
      // Someone can hold it, so the setting is not out of everyone's reach.
      expect(roles.some((role) => roleHasPermission(role, setting.permission))).toBe(true);
    }
  });

  it('start members at the league home (P2 section 3)', () => {
    expect(declaredSettings.get('members.startPage')?.default).toBe('leagueHome');
  });

  it('let any scorekeeper score any game until the league tightens it (P4 section 4, A-13)', () => {
    const setting = declaredSettings.get('games.whoMayScore');
    expect(setting?.default).toBe('anyScorekeeper');
    expect(setting?.type.safeParse('assignedOnly').success).toBe(true);
    expect(setting?.type.safeParse('nobody').success).toBe(false);
  });

  it('start a new team at everyone and let teams choose (S-22, S-23, S-24)', () => {
    const level = declaredSettings.get('teams.startingStatsLevel');
    expect(level?.default).toBe('everyone');
    expect(level?.levels).toEqual(['league']);
    expect(level?.type.safeParse('staff').success).toBe(true);
    expect(level?.type.safeParse('nobody').success).toBe(false);
    const may = declaredSettings.get('teams.mayChooseStatsLevel');
    expect(may?.default).toBe(true);
    expect(may?.type.safeParse(false).success).toBe(true);
    expect(may?.type.safeParse('no').success).toBe(false);
  });

  it('show children by first name and last initial until the admin confirms full names (R-14)', () => {
    const names = declaredSettings.get('privacy.publicNames');
    expect(names?.default).toBe('firstNameLastInitial');
    expect(names?.levels).toEqual(['league']);
    expect(names?.permission).toBe('league.settings');
    expect(names !== undefined && needsConfirming(names, 'fullName')).toBe(true);
    expect(names !== undefined && needsConfirming(names, 'firstNameLastInitial')).toBe(false);
    expect(names?.type.safeParse('hidden').success).toBe(false);
  });

  it('let no player ask to appear as initials until the league switches it on (R-15)', () => {
    const initials = declaredSettings.get('privacy.playersMayAskForInitials');
    expect(initials?.default).toBe(false);
    expect(initials?.levels).toEqual(['league']);
    expect(initials?.permission).toBe('league.settings');
    expect(initials?.confirm).toEqual([]);
  });
});
