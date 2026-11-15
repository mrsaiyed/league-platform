import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { setSettingFor } from '../commands/set-setting.ts';
import { memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { defineSetting, settingRegistry } from './define-setting.ts';
import { listLeagueSettings } from './list-league-settings.ts';

const hours = defineSetting({
  key: 'notifications.reminderLeadHours',
  type: z.number().int().min(1).max(72),
  default: 24,
  levels: ['league', 'season'],
  permission: 'league.settings',
  label: 'setting.notifications.reminderLeadHours.label',
});
const seasonOnly = defineSetting({
  key: 'games.example',
  type: z.boolean(),
  default: true,
  levels: ['season'],
  permission: 'league.settings',
  label: 'setting.games.example.label',
});
const registry = settingRegistry([hours, seasonOnly]);

describe('listLeagueSettings', () => {
  it('lists the settings that can be set for the league, with default and no version', async () => {
    const m = memoryLeagues();
    const rows = await m.deps.transaction(m.as(ownerId), (tx) => listLeagueSettings(tx, registry));
    expect(rows).toEqual([
      {
        key: hours.key,
        label: hours.label,
        default: 24,
        field: { kind: 'number', min: 1, max: 72, whole: true },
        confirm: [],
        value: 24,
        source: 'default',
        version: null,
        audience: null,
      },
    ]);
  });

  it("gives a setting whose start depends on who plays its league's own start (record 065)", async () => {
    const names = defineSetting({
      key: 'privacy.publicNames',
      type: z.enum(['fullName', 'firstNameLastInitial', 'hidden']),
      default: 'firstNameLastInitial',
      startsAs: { adult: 'fullName' },
      levels: ['league'],
      permission: 'league.settings',
      label: 'setting.privacy.publicNames.label',
      confirm: ['fullName'],
    });
    const only = settingRegistry([names]);
    for (const [audience, start, confirm] of [
      ['adult', 'fullName', []],
      ['youth', 'firstNameLastInitial', ['fullName']],
      ['mixed', 'firstNameLastInitial', ['fullName']],
    ] as const) {
      const m = memoryLeagues({ audience });
      const [row] = await m.deps.transaction(m.as(ownerId), (tx) => listLeagueSettings(tx, only));
      // An adult league starts on full names and is not asked to confirm its own start.
      expect(row, audience).toMatchObject({
        default: start,
        value: start,
        source: 'default',
        confirm,
        audience,
      });
    }
  });

  it('shows the league value and the version to save from once one is set', async () => {
    const m = memoryLeagues();
    const context = m.as(ownerId);
    const set = setSettingFor(registry);
    await set(context, { level: 'league', key: hours.key, value: 6, version: null }, m.deps);
    const [row] = await m.deps.transaction(context, (tx) => listLeagueSettings(tx, registry));
    expect(row).toMatchObject({ value: 6, source: 'league', version: 1 });
  });
});
