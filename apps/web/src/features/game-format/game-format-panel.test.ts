// The format panel and form (step 2.119; S-35, S-39, checklist B1 to B3), drawn on the
// server: every rule listed; "Change the format" offered when this person may, greyed
// with a word once the game is under way, absent with the setting off; "Use the season's
// format" for an admin of a game given its own; the form with its presets and fields.
import {
  formatFacts,
  formatOfRules,
  gameFormatPresets,
  seasonRulesPreset,
  type GameFormatView,
} from '@srleagues/contracts';
import { createTranslator, en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameFormatClient } from './format-client.ts';
import { GameFormatForm, GameFormatPanel, startWaits } from './game-format-panel.tsx';

const t = createTranslator('en', { en });
const rules = seasonRulesPreset('rec-league');
const format = formatOfRules(rules);
const look = { section: 's', list: 'l', quiet: 'q', button: 'b', notice: 'n' };
const client: GameFormatClient = {
  read: async () => ({ kind: 'failed' }),
  change: async () => ({ kind: 'failed' }),
};

const view = (change: GameFormatView['change'], given = false): GameFormatView => ({
  version: 2,
  given: given ? format : null,
  season: format,
  applies: format,
  source: given ? 'given' : 'season',
  facts: formatFacts(format),
  change,
  presets: gameFormatPresets(rules),
});

const panel = (initial: GameFormatView) =>
  renderToStaticMarkup(createElement(GameFormatPanel, { client, t, locale: 'en', look, initial }));

describe('the format panel', () => {
  it('lists every rule and offers the change to a scorekeeper who may', () => {
    const html = panel(view({ may: true, as: 'scorekeeper' }));
    expect(html.match(/<li>/g)?.length).toBeGreaterThanOrEqual(15);
    expect(html).toContain('data-format-change=""');
    expect(html).not.toMatch(/data-format-change=""[^>]*disabled/);
    expect(html).not.toContain('data-format-season');
  });

  it('greys the button with a word once the game is under way (B3)', () => {
    const html = panel(view({ may: false, reason: 'under-way' }));
    expect(html).toMatch(
      /disabled=""[^>]*data-format-change=""|data-format-change=""[^>]*disabled=""/,
    );
    expect(html).toContain('its format can no longer be changed');
  });

  it('has no button with the setting off, and says to ask an admin', () => {
    const html = panel(view({ may: false, reason: 'setting-off' }));
    expect(html).not.toContain('data-format-change');
    expect(html).toContain('ask a league admin');
    expect(panel(view({ may: false, reason: 'no-permission' }))).not.toContain(
      'data-format-change',
    );
  });

  it("offers an admin the season's format back for a game given its own", () => {
    expect(panel(view({ may: true, as: 'admin' }, true))).toContain('data-format-season=""');
  });

  it('draws the form with the presets and every field of the format (B1, B2)', () => {
    const html = renderToStaticMarkup(
      createElement(GameFormatForm, {
        view: view({ may: true, as: 'admin' }),
        t,
        look,
        busy: false,
        onSave: () => undefined,
        onCancel: () => undefined,
      }),
    );
    for (const preset of ['High school', 'Recreation league', 'The season&#x27;s format']) {
      expect(html).toContain(preset);
    }
    expect(html.match(/<input/g)?.length).toBe(11);
    expect(html.match(/<select/g)?.length).toBe(6);
    expect(html).toContain('Save for this game only');
  });
});

describe('"Confirm and start scoring" in the panel (T-344)', () => {
  const confirm = {
    label: 'Confirm and start scoring',
    busy: false,
    playing: () => true,
    onStart: () => undefined,
  };
  const drawn = (initial: GameFormatView | null) =>
    renderToStaticMarkup(
      createElement(GameFormatPanel, { client, t, locale: 'en', look, initial, confirm }),
    );

  it('is there while the format is read and once it is, ready to tap with the form closed', () => {
    for (const html of [drawn(null), drawn(view({ may: true, as: 'scorekeeper' }))]) {
      expect(html).toMatch(/<button[^>]*data-format-confirm=""[^>]*>Confirm and start scoring</);
      expect(html).not.toMatch(/data-format-confirm=""[^>]*disabled/);
      expect(html).not.toContain('data-format-close-first');
    }
  });

  it('waits while the form is open, saying to save or close it first', () => {
    expect(startWaits({ editing: true, busy: false, checking: false })).toEqual({
      disabled: true,
      closeFirst: true,
    });
    expect(startWaits({ editing: false, busy: false, checking: false })).toEqual({
      disabled: false,
      closeFirst: false,
    });
    expect(startWaits({ editing: false, busy: false, checking: true }).disabled).toBe(true);
    expect(startWaits({ editing: false, busy: true, checking: false }).disabled).toBe(true);
    expect(t('tracker.formatChange.closeFirst')).toBe('Save or close the format form first.');
  });
});
