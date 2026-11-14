// The League settings screen (step 2.48): it is drawn from declarations, so a setting
// declared in a test shows with its label, default and limits; forms become command input;
// and the real commands run on the stand-in with the version check (A-8).
import {
  clearSetting,
  declaredSettings,
  defineSetting,
  listLeagueSettings,
  setSetting,
  settingRegistry,
  type AccessReader,
  type CommandContext,
} from '@srleagues/core';
import { createTranslator, en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { standInAdminSettings } from '../../server/stand-in-admin-settings.ts';
import { answerQuery, doneKey, problemKey, refused } from './answer.ts';
import { valueOf, versionOf } from './form-input.ts';
import { SettingForms, type Say } from './setting-fields.tsx';

const t = createTranslator('en');
const words: Readonly<Record<string, string>> = {
  'setting.test.reminderHours.label': 'Hours before a game to remind people',
  'setting.test.theme.label': 'Look of the pages',
  'setting.test.theme.option.plain': 'Plain',
  'setting.test.theme.option.bold': 'Bold',
};
const say: Say = (key, params) =>
  Object.hasOwn(words, key) ? (words[key] ?? '') : t(key as Parameters<typeof t>[0], params);

const hours = defineSetting({
  key: 'test.reminderHours',
  type: z.number().int().min(1).max(72),
  default: 24,
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.test.reminderHours.label',
});
const theme = defineSetting({
  key: 'test.theme',
  type: z.enum(['plain', 'bold']),
  default: 'plain',
  levels: ['league'],
  permission: 'league.settings',
  label: 'setting.test.theme.label',
});
const testRegistry = settingRegistry([hours, theme]);

const leagueId = '01900000-0000-7000-8000-000000000001';
const ownerId = '01900000-0000-7000-8000-0000000000a1';
const access: AccessReader = {
  ownerAccountId: async () => ownerId,
  leagueStatus: async () => 'live',
  activeGrantsOf: async () => [],
};
const as = (accountId: string | null): CommandContext => ({
  leagueId,
  accountId,
  requestId: 'request-1',
});

describe('the settings form', () => {
  it('shows a setting declared in a test with its label, default and limits', async () => {
    const { deps } = standInAdminSettings({ accessOf: () => access, log: () => undefined });
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx, testRegistry));
    const html = renderToStaticMarkup(
      createElement(SettingForms, { rows, league: 'north-valley', say }),
    );
    expect(html).toContain('Hours before a game to remind people');
    expect(html).toContain('Default: 24');
    expect(html).toContain('Accepts a whole number from 1 to 72.');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="72"');
    expect(html).toContain('Look of the pages');
    expect(html).toContain('Default: Plain');
    expect(html).toContain('Plain (the default)');
    expect(html).toContain('Bold');
    // Nothing is set yet: no way to go back to a default.
    expect(html).not.toContain('Go back to the default');
  });

  it('draws every setting the product declares, with words for its label and choices', async () => {
    for (const setting of declaredSettings.all()) {
      expect(Object.hasOwn(en, setting.label), setting.label).toBe(true);
    }
    const { deps } = standInAdminSettings({ accessOf: () => access, log: () => undefined });
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));
    expect(rows.map((r) => r.key)).toEqual(declaredSettings.all().map((s) => s.key));
    const html = renderToStaticMarkup(createElement(SettingForms, { rows, league: 'x', say }));
    expect(html).toContain('The league home');
    expect(html).toContain('Any game');
  });
});

describe('form input', () => {
  it('reads each kind of field into the value its schema takes', () => {
    expect(valueOf({ kind: 'choice', choices: ['a'] }, 'a')).toBe('a');
    expect(valueOf({ kind: 'toggle' }, 'true')).toBe(true);
    expect(valueOf({ kind: 'toggle' }, 'false')).toBe(false);
    expect(valueOf({ kind: 'toggle' }, 'maybe')).toBeUndefined();
    expect(valueOf({ kind: 'number', min: 1, max: 5, whole: true }, ' 4 ')).toBe(4);
    expect(valueOf({ kind: 'number', min: 1, max: 5, whole: true }, '')).toBeUndefined();
    expect(valueOf({ kind: 'other' }, 'x')).toBeUndefined();
    expect(valueOf({ kind: 'text', maxLength: 3 }, undefined)).toBeUndefined();
  });

  it('takes no version as none, and a garbled one as not a number', () => {
    expect(versionOf({})).toBeNull();
    expect(versionOf({ version: '3' })).toBe(3);
    expect(versionOf({ version: 'x' })).toBeNaN();
  });
});

describe('answers', () => {
  it('chooses the words for what happened, and never shows what was typed', () => {
    expect(doneKey({ done: 'saved' })).toBe('adminSettings.done.saved');
    expect(doneKey({ done: '<b>' })).toBeUndefined();
    expect(answerQuery(refused('leagues.set_setting', 'changed-since-read'))).toBe(
      '?problem=leagues.set_setting.changed-since-read',
    );
    expect(problemKey({ problem: 'leagues.set_setting.changed-since-read' })).toBe(
      'error.leagues.set_setting.changed-since-read',
    );
    expect(problemKey({ problem: 'leagues.set_setting.invalid-value' })).toBe(
      'error.leagues.set_setting.invalid-value',
    );
    expect(problemKey({ problem: 'whatever.nonsense' })).toBe('error.unknown');
    expect(problemKey({})).toBeUndefined();
  });
});

describe('saving on the stand-in', () => {
  const key = declaredSettings.get('members.startPage')?.key ?? '';
  const made = () => standInAdminSettings({ accessOf: () => access, log: () => undefined });
  const read = (ports: ReturnType<typeof made>) =>
    ports.deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));

  it('saves, shows the new version, and puts the default back', async () => {
    const ports = made();
    const saved = await setSetting(
      as(ownerId),
      { level: 'league', key, value: 'myTeam', version: null },
      ports.deps,
    );
    expect(saved.ok).toBe(true);
    const row = (await read(ports)).find((r) => r.key === key);
    expect(row).toMatchObject({ value: 'myTeam', source: 'league', version: 1 });
    const cleared = await clearSetting(
      as(ownerId),
      { level: 'league', key, version: 1 },
      ports.deps,
    );
    expect(cleared.ok).toBe(true);
    expect((await read(ports)).find((r) => r.key === key)).toMatchObject({
      value: 'leagueHome',
      source: 'default',
      version: null,
    });
  });

  it('refuses a stale version, a value outside the limits and a stranger', async () => {
    const ports = made();
    await setSetting(
      as(ownerId),
      { level: 'league', key, value: 'myTeam', version: null },
      ports.deps,
    );
    const stale = await setSetting(
      as(ownerId),
      { level: 'league', key, value: 'leagueHome', version: null },
      ports.deps,
    );
    expect(stale).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    const bad = await setSetting(
      as(ownerId),
      { level: 'league', key, value: 'nowhere', version: 1 },
      ports.deps,
    );
    expect(bad).toEqual({ ok: false, error: { code: 'invalid-value' } });
    const stranger = await setSetting(
      as('01900000-0000-7000-8000-0000000000a9'),
      { level: 'league', key, value: 'myTeam', version: 1 },
      ports.deps,
    );
    expect(stranger.ok).toBe(false);
  });
});
