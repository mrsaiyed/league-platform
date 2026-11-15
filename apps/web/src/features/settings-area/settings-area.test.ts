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
import { areaOf, SettingForms, type Say } from './setting-fields.tsx';

const t = createTranslator('en');
const words: Readonly<Record<string, string>> = {
  'setting.test.reminderHours.label': 'Hours before a game to remind people',
  'setting.test.theme.label': 'Look of the pages',
  'setting.test.theme.option.plain': 'Plain',
  'setting.test.theme.option.bold': 'Bold',
  'adminSettings.area.test': 'Made-up settings',
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
    for (const setting of declaredSettings.all()) {
      const area = `adminSettings.area.${areaOf(setting.key)}`;
      expect(Object.hasOwn(en, area), area).toBe(true);
      if (setting.confirm.length > 0) {
        const confirm = setting.label.replace(/\.label$/, '.confirm');
        expect(Object.hasOwn(en, confirm), confirm).toBe(true);
      }
      // A setting whose start depends on who plays says why, for each audience (record 065).
      if (Object.keys(setting.startsAs).length > 0) {
        for (const audience of ['adult', 'youth', 'mixed']) {
          const start = setting.label.replace(/\.label$/, `.start.${audience}`);
          expect(Object.hasOwn(en, start), start).toBe(true);
        }
      }
    }
  });

  it('shows under Scoring how long a scorekeeper may reopen a game they ended (S-36)', async () => {
    const { deps } = standInAdminSettings({ accessOf: () => access, log: () => undefined });
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));
    const html = renderToStaticMarkup(createElement(SettingForms, { rows, league: 'x', say }));
    const scoring = html.slice(html.indexOf('data-area="games"'));
    expect(scoring).toMatch(/^data-area="games"><h2>Scoring<\/h2>/);
    const field = scoring.slice(scoring.indexOf('data-setting="games.scorekeeperReopenMinutes"'));
    expect(field).toContain('the scorekeeper who ended it may reopen it from the tracker');
    expect(field).toContain('0 means never. After that, only an admin can reopen it.');
    expect(field).toContain('type="number"');
    expect(field).toContain('min="0"');
    expect(field).toContain('max="1440"');
    expect(field).toContain('value="30"');
    expect(field).toContain('Default: 30');
    expect(field).toContain('Accepts a whole number from 0 to 1440.');
  });

  it('saves the minutes a scorekeeper may reopen a game, 0 included, and refuses more than a day', async () => {
    const { deps } = standInAdminSettings({ accessOf: () => access, log: () => undefined });
    const key = 'games.scorekeeperReopenMinutes';
    const set = (value: unknown, version: number | null) =>
      setSetting(as(ownerId), { level: 'league', key, value, version }, deps);
    expect(await set(1441, null)).toEqual({ ok: false, error: { code: 'invalid-value' } });
    expect((await set(0, null)).ok).toBe(true);
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));
    expect(rows.find((r) => r.key === key)).toMatchObject({ value: 0, source: 'league' });
  });

  it('puts the names settings under Privacy, with a box to confirm full names (R-14)', async () => {
    const { deps } = standInAdminSettings({ accessOf: () => access, log: () => undefined });
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));
    const html = renderToStaticMarkup(createElement(SettingForms, { rows, league: 'x', say }));
    const privacy = html.slice(html.indexOf('data-area="privacy"'));
    expect(privacy).toMatch(/^data-area="privacy"><h2>Privacy<\/h2>/);
    // Three choices, from the most shown to the least (R-24).
    // Three choices, from the most shown to the least (R-24), each with a made-up example.
    const quote = (text: string) => `&quot;${text}&quot;`;
    const full = privacy.indexOf(`Full names, like ${quote('Jordan Ellis')}`);
    const initial = privacy.indexOf(
      `First name and last initial, like ${quote('Jordan E.')} (the default)`,
    );
    const hidden = privacy.indexOf('Hidden: no names. A player appears by jersey number');
    expect(full).toBeGreaterThan(0);
    expect(initial).toBeGreaterThan(full);
    expect(hidden).toBeGreaterThan(initial);
    expect(privacy).toContain(`as ${quote('A player (name not shown)')} in the statistics`);
    expect(privacy).toContain('People who know the team can still tell who a number is.');
    expect(privacy.match(/value="(fullName|firstNameLastInitial|hidden)"/g)).toEqual([
      'value="fullName"',
      'value="firstNameLastInitial"',
      'value="hidden"',
    ]);
    // The box to tick says when to tick it, and what is confirmed (R-14).
    expect(privacy).toContain('Tick this only if you are choosing Full names');
    expect(privacy).toContain('name="confirmed" value="yes"');
    expect(privacy).toContain(
      'I confirm that the parents or guardians of the children in this league have agreed to their full names being shown publicly',
    );
    // The words say who the setting changes (everyone, R-29), and that a request wins.
    expect(privacy).toContain('how every player is shown on the team pages');
    expect(privacy).toContain('always wins over this setting');
    // A league whose audience is not known is read as youth, and says why it starts there.
    expect(privacy).toContain(
      'Your league is for young players, so it starts with first name and last initial.',
    );
    // No sentence promises what no screen does (2.106 audit, H13).
    expect(privacy).not.toContain('until you mark them as adults');
    expect(privacy).not.toContain('next part of this work');
    expect(privacy).toContain('Adults may ask to appear as initials on public pages.');
    expect(privacy).toContain('Children always can, whatever this says');
    // R-27: switching it off takes no one's initials away.
    expect(privacy).toContain('Switching this off only stops new requests');
    expect(privacy).toContain('stays that way until their own record is changed');
    // Only the names setting asks to confirm.
    expect(html.match(/name="confirmed"/g)).toHaveLength(1);
  });

  it('opens Privacy with a sentence that fits who plays, and asks to confirm only where there are children (R-29)', async () => {
    const privacyOf = async (audience: 'adult' | 'youth' | 'mixed') => {
      const { deps } = standInAdminSettings({
        accessOf: () => access,
        log: () => undefined,
        audienceOf: () => audience,
      });
      const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));
      const html = renderToStaticMarkup(createElement(SettingForms, { rows, league: 'x', say }));
      return html.slice(html.indexOf('data-area="privacy"'));
    };
    const quote = (text: string) => `&quot;${text}&quot;`;
    const adult = await privacyOf('adult');
    expect(adult).toContain(
      'Your league is for adults, so it starts with full names. Choose less here at any time.',
    );
    // The sentence comes first, right under the heading.
    expect(adult).toMatch(
      /^data-area="privacy"><h2>Privacy<\/h2><section[^>]*><p>Your league is for adults/,
    );
    expect(adult).toContain(`Full names, like ${quote('Jordan Ellis')} (the default)`);
    expect(adult).toContain('Default: Full names');
    expect(adult).not.toContain('name="confirmed"');
    expect(adult).not.toContain('Tick this only if');
    for (const audience of ['youth', 'mixed'] as const) {
      const html = await privacyOf(audience);
      expect(html, audience).toContain('so it starts with first name and last initial');
      expect(html, audience).toContain('which you confirm below.');
      expect(html, audience).toContain(
        `First name and last initial, like ${quote('Jordan E.')} (the default)`,
      );
      expect(html.match(/name="confirmed"/g), audience).toHaveLength(1);
    }
    expect(await privacyOf('mixed')).toContain('Your league has both adults and young players');
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
