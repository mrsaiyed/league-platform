// The League settings screen (step 2.48): it is drawn from declarations, so a setting
// declared in a test shows with its label, default and limits; forms become command input;
// and the real commands run on the stand-in with the version check (A-8).
import {
  clearSetting,
  declaredSettings,
  defineSetting,
  listLeagueSettings,
  readNamePolicy,
  readPrivacyFacts,
  setSetting,
  settingRegistry,
  type AccessReader,
  type Audience,
  type CommandContext,
} from '@srleagues/core';
import { createTranslator, en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { standInAdminSettings } from '../../server/stand-in-admin-settings.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import {
  answerQuery,
  done,
  doneKey,
  leagueStatusThing,
  problemKey,
  refused,
  statusAnswerOf,
} from './answer.ts';
import { valueOf, versionOf } from './form-input.ts';
import { privacyNotes } from './privacy-notes.ts';
import { areaOf, SettingForms, type Say } from './setting-fields.tsx';

// The confirmation's tick, whatever the order of its other marks (it is a ListForm's tick
// since step 2.155 part 4, described by the setting's default and limits).
const unticked =
  /<input type="checkbox"(?: aria-describedby="[^"]+")? name="confirmed" value="yes"\/>/;
const ticked =
  /<input type="checkbox"(?: aria-describedby="[^"]+")? name="confirmed" checked="" value="yes"\/>/;

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
/**
 * The settings stand-in on the one made-up world, its league made of this audience, with
 * or without someone recorded as a child: the Privacy settings read both from its rows.
 */
const settingsStandIn = (
  audience: Audience = 'youth',
  hasRecordedChild = false,
  now?: () => Date,
) =>
  standInAdminSettings(
    testWorld(
      () => access,
      now,
      (leagues) => {
        const at = leagues.findIndex((l) => l.leagueId === leagueId);
        const league = leagues[at];
        if (league === undefined) throw new Error('The test league is not in the seed.');
        leagues[at] = {
          ...league,
          audience,
          // Only the first person is recorded as a child, and only when asked for.
          people: league.people.map((p, i) => ({
            ...p,
            sensitive: {
              ...p.sensitive,
              isMinor:
                hasRecordedChild && i === 0
                  ? true
                  : p.sensitive.isMinor === true
                    ? null
                    : p.sensitive.isMinor,
            },
          })),
        };
      },
    ),
  );

describe('the settings form', () => {
  it('shows a setting declared in a test with its label, default and limits', async () => {
    const { deps } = settingsStandIn();
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx, testRegistry));
    const html = renderToStaticMarkup(
      createElement(SettingForms, {
        rows,
        league: 'north-valley',
        address: '/north-valley/admin/settings',
        say,
      }),
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
    const { deps } = settingsStandIn();
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));
    expect(rows.map((r) => r.key)).toEqual(declaredSettings.all().map((s) => s.key));
    const html = renderToStaticMarkup(
      createElement(SettingForms, { rows, league: 'x', address: '/x/admin/settings', say }),
    );
    expect(html).toContain('The league home');
    expect(html).toContain('Any game');
    for (const setting of declaredSettings.all()) {
      const area = `adminSettings.area.${areaOf(setting.key)}`;
      expect(Object.hasOwn(en, area), area).toBe(true);
      if (setting.confirm.length > 0) {
        const confirm = setting.label.replace(/\.label$/, '.confirm');
        expect(Object.hasOwn(en, confirm), confirm).toBe(true);
      }
    }
  });

  it('shows under Scoring how long a scorekeeper may reopen a game they ended (S-36)', async () => {
    const { deps } = settingsStandIn();
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));
    const html = renderToStaticMarkup(
      createElement(SettingForms, { rows, league: 'x', address: '/x/admin/settings', say }),
    );
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
    const { deps } = settingsStandIn();
    const key = 'games.scorekeeperReopenMinutes';
    const set = (value: unknown, version: number | null) =>
      setSetting(as(ownerId), { level: 'league', key, value, version }, deps);
    expect(await set(1441, null)).toEqual({ ok: false, error: { code: 'invalid-value' } });
    expect((await set(0, null)).ok).toBe(true);
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));
    expect(rows.find((r) => r.key === key)).toMatchObject({ value: 0, source: 'league' });
  });

  it("puts the names settings under Privacy, with the parents' confirmation as its own (R-14, R-29)", async () => {
    const { deps } = settingsStandIn();
    const rows = await deps.transaction(as(ownerId), (tx) => listLeagueSettings(tx));
    const html = renderToStaticMarkup(
      createElement(SettingForms, { rows, league: 'x', address: '/x/admin/settings', say }),
    );
    const privacy = html.slice(html.indexOf('data-area="privacy"'));
    expect(privacy).toMatch(/^data-area="privacy"><h2>Privacy<\/h2>/);
    // Three choices, from the most shown to the least (R-24), each saying what it does to
    // adults and to children (R-29), with a made-up example.
    const quote = (text: string) => `&quot;${text}&quot;`;
    const full = privacy.indexOf(`Full names for adults, like ${quote('Jordan Ellis')}.`);
    const initial = privacy.indexOf(
      `First name and last initial for everyone, adults and children, like ${quote('Jordan E.')}`,
    );
    const hidden = privacy.indexOf('Hidden for everyone, adults and children: no names.');
    expect(full).toBeGreaterThan(0);
    expect(initial).toBeGreaterThan(full);
    expect(hidden).toBeGreaterThan(initial);
    // Every league starts on full names (record 065).
    expect(privacy).toContain('unless their full names are confirmed below. (the default)');
    expect(privacy).toContain(`as ${quote('A player (name not shown)')} in the statistics`);
    expect(privacy).toContain('People who know the team can still tell who a number is.');
    expect(privacy.match(/value="(fullName|firstNameLastInitial|hidden)"/g)).toEqual([
      'value="fullName"',
      'value="firstNameLastInitial"',
      'value="hidden"',
    ]);
    // The box to tick says what is confirmed (R-14), on the confirmation's own form.
    const confirmation = privacy.slice(
      privacy.indexOf('data-setting="privacy.childrenInFullConfirmed"'),
      privacy.indexOf('data-setting="privacy.playersMayAskForInitials"'),
    );
    // Drawn as one box to tick: ticking it says yes and confirms (record 065).
    expect(confirmation).toMatch(unticked);
    expect(confirmation).toContain('name="value" value="tick"');
    expect(confirmation).not.toContain('type="radio"');
    expect(privacy).not.toContain('Tick this only if');
    expect(confirmation).toContain(
      'I confirm that the parents or guardians of the children in this league have agreed to their full names being shown publicly',
    );
    // A request always wins; no sentence promises what no screen does (2.106 audit, H13).
    expect(privacy).toContain('it always wins over this setting');
    expect(privacy).not.toContain('until you mark them as adults');
    expect(privacy).not.toContain('next part of this work');
    expect(privacy).toContain('Adults may ask to appear as initials on public pages.');
    expect(privacy).toContain('Children always can, whatever this says');
    // R-27: switching it off takes no one's initials away.
    expect(privacy).toContain('Switching this off only stops new requests');
    expect(privacy).toContain('stays that way until their own record is changed');
    // Only the parents' confirmation asks to confirm; the names setting no longer does.
    expect(html.match(/name="confirmed"/g)).toHaveLength(1);
    expect(confirmation.indexOf('name="confirmed"')).toBeGreaterThan(0);
  });

  it('opens Privacy with what fits who plays, says what is in force, and offers the tick only where it covers someone (R-29)', async () => {
    const privacyOf = async (audience: Audience, hasRecordedChild = false) => {
      const { deps } = settingsStandIn(audience, hasRecordedChild);
      const { rows, facts, policy } = await deps.transaction(as(ownerId), async (tx) => ({
        rows: await listLeagueSettings(tx),
        facts: await readPrivacyFacts(tx),
        policy: await readNamePolicy(tx.leagues),
      }));
      const notes = privacyNotes({
        facts,
        policy,
        rows,
        timeZone: 'UTC',
        locale: 'en',
        walkUpsUrl: '/people?added=table',
      });
      const html = renderToStaticMarkup(
        createElement(SettingForms, {
          rows,
          league: 'x',
          address: '/x/admin/settings',
          say,
          notes,
        }),
      );
      return html.slice(html.indexOf('data-area="privacy"'));
    };
    const confirmationOf = (html: string) =>
      html.slice(html.indexOf('data-setting="privacy.childrenInFullConfirmed"'));
    const adult = await privacyOf('adult');
    // The sentence comes first, right under the heading, then what is in force.
    expect(adult).toMatch(
      /^data-area="privacy"><h2>Privacy<\/h2><p>Your league is for adults, so it starts with full names\. Choose less here at any time\.<\/p><p>Now: adults are shown by full name, and children by first name and last initial\.<\/p>/,
    );
    // No one recorded as a child: one sentence, no tick.
    expect(confirmationOf(adult)).toContain(
      'A player recorded as a child is shown by first name and last initial.',
    );
    expect(adult).not.toContain('name="confirmed"');
    const adultWithChild = confirmationOf(await privacyOf('adult', true));
    expect(adultWithChild).toContain('This league has players recorded as children.');
    expect(adultWithChild).toMatch(unticked);
    for (const audience of ['youth', 'mixed'] as const) {
      const html = await privacyOf(audience);
      expect(html, audience).toContain('young players by first name and last initial');
      expect(confirmationOf(html), audience).toContain(
        'Tick to show the young players&#x27; full names too',
      );
      expect(html.match(/name="confirmed"/g), audience).toHaveLength(1);
    }
  });

  it('says the confirmation is in force and since when, once it is given (record 065)', async () => {
    const { deps } = settingsStandIn('youth', false, () => new Date('2026-11-15T12:00:00Z'));
    const given = await setSetting(
      as(ownerId),
      {
        level: 'league',
        key: 'privacy.childrenInFullConfirmed',
        value: true,
        version: null,
        confirmed: true,
      },
      deps,
    );
    expect(given).toMatchObject({ ok: true });
    const render = async () => {
      const { rows, facts, policy } = await deps.transaction(as(ownerId), async (tx) => ({
        rows: await listLeagueSettings(tx),
        facts: await readPrivacyFacts(tx),
        policy: await readNamePolicy(tx.leagues),
      }));
      const notes = privacyNotes({
        facts,
        policy,
        rows,
        timeZone: 'UTC',
        locale: 'en',
        walkUpsUrl: '/people?added=table',
      });
      return renderToStaticMarkup(
        createElement(SettingForms, {
          rows,
          league: 'x',
          address: '/x/admin/settings',
          say,
          notes,
        }),
      );
    };
    const html = await render();
    expect(html).toContain('Now: everyone is shown by full name, children too.');
    expect(html).toContain('Confirmed on November 15, 2026.');
    // The tick is drawn ticked.
    expect(html).toMatch(ticked);
    // Names moved off full names: the confirmation is kept and has no effect.
    await setSetting(
      as(ownerId),
      { level: 'league', key: 'privacy.publicNames', value: 'hidden', version: null },
      deps,
    );
    const hidden = await render();
    expect(hidden).toContain('Now: nobody is shown by name; players appear by jersey number.');
    expect(hidden).toContain(
      'The parents&#x27; confirmation is kept, but it has no effect while names are not on full names.',
    );
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
    expect(doneKey({ done: 'published' })).toBe('adminSettings.done.published');
    // A setting's save is said beside it since step 2.155 part 4: the address cannot ask.
    expect(doneKey({ done: 'saved' })).toBeUndefined();
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

  it('reads Publish, Archive and Un-archive only from their own notice (step 2.155 part 6)', () => {
    const left = (said: string, thing = leagueStatusThing) => ({ thing, said });
    expect(doneKey(statusAnswerOf(left(answerQuery(done('published')))))).toBe(
      'adminSettings.done.published',
    );
    expect(problemKey(statusAnswerOf(left(answerQuery(refused('leagues.x', 'not-allowed')))))).toBe(
      'error.not-allowed',
    );
    // No notice, a Profile form's or a setting's notice: nothing is said.
    expect(statusAnswerOf(undefined)).toEqual({});
    expect(statusAnswerOf(left('?done=published', 'members.startPage'))).toEqual({});
    expect(statusAnswerOf(left('name', leagueStatusThing))).toEqual({});
  });
});

describe('saving on the stand-in', () => {
  const key = declaredSettings.get('members.startPage')?.key ?? '';
  const made = () => settingsStandIn();
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
