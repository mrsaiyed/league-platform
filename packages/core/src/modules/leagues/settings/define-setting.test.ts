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
  showsLess,
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

  it('let the scorekeeper reopen a game for 30 minutes, from never to a day (S-36)', () => {
    const setting = declaredSettings.get('games.scorekeeperReopenMinutes');
    expect(setting?.default).toBe(30);
    expect(setting?.levels).toEqual(['league']);
    expect(setting?.permission).toBe('league.settings');
    for (const minutes of [0, 30, 1440]) {
      expect(setting?.type.safeParse(minutes).success, String(minutes)).toBe(true);
    }
    for (const minutes of [-1, 1441, 2.5, '30']) {
      expect(setting?.type.safeParse(minutes).success, String(minutes)).toBe(false);
    }
  });

  it('rank a player among the leaders from 3 games, which the league can change (P7 section 6)', () => {
    const setting = declaredSettings.get('statistics.minimumGamesToRank');
    expect(setting?.default).toBe(3);
    expect(setting?.levels).toEqual(['league']);
    expect(setting?.permission).toBe('league.settings');
    for (const games of [0, 1, 3, 1000]) {
      expect(setting?.type.safeParse(games).success, String(games)).toBe(true);
    }
    for (const games of [-1, 1001, 2.5, '3']) {
      expect(setting?.type.safeParse(games).success, String(games)).toBe(false);
    }
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

  it('start every league on full names, which asks for no confirmation (R-29, record 065)', () => {
    const names = declaredSettings.get('privacy.publicNames');
    expect(names?.default).toBe('fullName');
    expect(names?.levels).toEqual(['league']);
    expect(names?.permission).toBe('league.settings');
    for (const value of ['fullName', 'firstNameLastInitial', 'hidden']) {
      expect(names !== undefined && needsConfirming(names, value), value).toBe(false);
    }
    expect(names?.type.safeParse('everything').success).toBe(false);
  });

  it("keep the parents' confirmation as a setting of its own: no to start, a tick to give it, always takeable back (R-14, R-26)", () => {
    const given = declaredSettings.get('privacy.childrenInFullConfirmed');
    if (given === undefined) throw new Error('expected the setting');
    expect(given.default).toBe(false);
    expect(given.levels).toEqual(['league']);
    expect(given.permission).toBe('league.settings');
    expect(needsConfirming(given, true)).toBe(true);
    expect(needsConfirming(given, false)).toBe(false);
    expect(showsLess(given, true, false)).toBe(true);
    expect(showsLess(given, false, true)).toBe(false);
    expect(given.type.safeParse('yes').success).toBe(false);
    // It sits between the names setting and the initials switch on the Privacy screen.
    expect(declaredSettings.all().map((s) => s.key)).toEqual(
      expect.arrayContaining([
        'privacy.publicNames',
        'privacy.childrenInFullConfirmed',
        'privacy.playersMayAskForInitials',
      ]),
    );
    const keys = declaredSettings.all().map((s) => s.key);
    expect(keys.indexOf('privacy.childrenInFullConfirmed')).toBe(
      keys.indexOf('privacy.publicNames') + 1,
    );
  });

  it('offer three choices for names, and know which way shows less (R-24, R-26)', () => {
    const names = declaredSettings.get('privacy.publicNames');
    if (names === undefined) throw new Error('expected the setting');
    for (const choice of ['fullName', 'firstNameLastInitial', 'hidden']) {
      expect(names.type.safeParse(choice).success, choice).toBe(true);
    }
    const less = (from: string, to: string) => showsLess(names, from, to);
    expect(less('fullName', 'firstNameLastInitial')).toBe(true);
    expect(less('fullName', 'hidden')).toBe(true);
    expect(less('firstNameLastInitial', 'hidden')).toBe(true);
    expect(less('hidden', 'firstNameLastInitial')).toBe(false);
    expect(less('firstNameLastInitial', 'fullName')).toBe(false);
    expect(less('hidden', 'hidden')).toBe(false);
    expect(less('everything', 'hidden')).toBe(false);
    // A setting with no order never counts as showing less.
    const initials = declaredSettings.get('privacy.playersMayAskForInitials');
    expect(initials !== undefined && showsLess(initials, true, false)).toBe(false);
  });

  it('refuse a protective order of one value, a repeated value or one its schema refuses', () => {
    const declare = (protectiveOrder: unknown[]) => () =>
      defineSetting({
        key: 'privacy.example',
        type: z.enum(['a', 'b', 'c']),
        default: 'a',
        levels: ['league'],
        permission: 'league.settings',
        label: 'setting.privacy.example.label',
        protectiveOrder: protectiveOrder as ('a' | 'b' | 'c')[],
      });
    expect(declare(['a'])).toThrow(/protective order/);
    expect(declare(['a', 'a'])).toThrow(/protective order/);
    expect(declare(['a', 'z'])).toThrow(/protective order/);
    expect(declare([])).not.toThrow();
    expect(declare(['a', 'c'])).not.toThrow();
  });

  it('let no player ask to appear as initials until the league switches it on (R-15)', () => {
    const initials = declaredSettings.get('privacy.playersMayAskForInitials');
    expect(initials?.default).toBe(false);
    expect(initials?.levels).toEqual(['league']);
    expect(initials?.permission).toBe('league.settings');
    expect(initials?.confirm).toEqual([]);
  });
});
