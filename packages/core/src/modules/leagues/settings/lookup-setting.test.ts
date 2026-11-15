// T5 §6: season, then program, then league, then our default.
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { defineSetting } from './define-setting.ts';
import { lookupSetting, type StoredSetting } from './lookup-setting.ts';

const setting = defineSetting({
  key: 'notifications.reminderLeadHours',
  type: z.number().int().min(1).max(72),
  default: 24,
  levels: ['league', 'program', 'season'],
  permission: 'league.settings',
  label: 'setting.notifications.reminderLeadHours.label',
});

const row = (level: StoredSetting['level'], value: unknown, version = 1): StoredSetting => ({
  level,
  document: { version, value },
});

describe('lookupSetting', () => {
  it('gives our default when nothing is set', () => {
    expect(lookupSetting(setting, [])).toEqual({ value: 24, source: 'default' });
  });

  it('prefers the season, then the program, then the league', () => {
    const all = [row('league', 10), row('program', 20), row('season', 30)];
    expect(lookupSetting(setting, all)).toEqual({ value: 30, source: 'season' });
    expect(lookupSetting(setting, [all[0]!, all[1]!])).toEqual({ value: 20, source: 'program' });
    expect(lookupSetting(setting, [all[0]!])).toEqual({ value: 10, source: 'league' });
  });

  it('does not depend on the order rows arrive in', () => {
    expect(lookupSetting(setting, [row('season', 30), row('league', 10)]).value).toBe(30);
  });

  it('skips a value that no longer passes the schema and falls to the next level', () => {
    expect(lookupSetting(setting, [row('league', 10), row('season', 500)])).toEqual({
      value: 10,
      source: 'league',
    });
    expect(lookupSetting(setting, [row('season', 'x')]).source).toBe('default');
  });

  it('skips a document that is not the stored envelope', () => {
    for (const document of [null, 5, 'x', {}, { version: 1 }, { version: 'a', value: 5 }]) {
      expect(lookupSetting(setting, [{ level: 'league', document }]).source).toBe('default');
    }
  });

  it('ignores a level the declaration does not allow', () => {
    const leagueOnly = defineSetting({
      ...{ key: 'members.startPage', label: 'setting.members.startPage.label' },
      type: z.enum(['a', 'b']),
      default: 'a',
      levels: ['league'],
      permission: 'league.settings',
    });
    expect(lookupSetting(leagueOnly, [row('season', 'b')])).toEqual({
      value: 'a',
      source: 'default',
    });
  });

  it('upgrades an older stored version, and ignores one it cannot', () => {
    const v2 = defineSetting({
      key: 'members.startPage',
      label: 'setting.members.startPage.label',
      type: z.enum(['home', 'team']),
      default: 'home',
      levels: ['league'],
      permission: 'league.settings',
      version: 2,
      upgrade: (from, value) => (from === 1 ? (value === true ? 'team' : 'home') : undefined),
    });
    expect(lookupSetting(v2, [row('league', true, 1)]).value).toBe('team');
    expect(lookupSetting(v2, [row('league', 'team', 3)]).source).toBe('default');
    const noUpgrade = defineSetting({ ...v2, upgrade: undefined } as never);
    expect(lookupSetting(noUpgrade, [row('league', 'team', 1)]).source).toBe('default');
  });
});
