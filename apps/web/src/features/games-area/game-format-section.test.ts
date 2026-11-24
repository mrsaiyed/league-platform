// The games area's format section (step 2.119): the same panel in the admin's look, with
// only the format's words handed to the page, and "Use the season's format" for a game
// given its own.
import {
  formatFacts,
  formatOfRules,
  gameFormatPresets,
  seasonRulesPreset,
} from '@srleagues/contracts';
import { en } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatWords } from '../game-format/index.ts';
import { GameFormatSection } from './game-format-section.tsx';

const rules = seasonRulesPreset('high-school');
const format = formatOfRules(rules);

describe("the games area's format section", () => {
  it('hands the page only the format words', () => {
    const words = formatWords(en);
    expect(Object.keys(words).every((k) => k.startsWith('tracker.format'))).toBe(true);
    expect(words['tracker.formatChange.season']).toBe("Use the season's format");
  });

  it("offers an admin the change and the season's format back", () => {
    const html = renderToStaticMarkup(
      createElement(GameFormatSection, {
        leagueId: '01900000-0000-7000-8000-000000000001',
        gameId: '01900000-0000-7000-8000-006a00000001',
        locale: 'en',
        words: formatWords(en),
        title: 'Format',
        initial: {
          version: 1,
          given: format,
          season: format,
          applies: format,
          source: 'given',
          facts: formatFacts(format),
          change: { may: true, as: 'admin' },
          presets: gameFormatPresets(rules),
        },
      }),
    );
    expect(html).toContain('data-admin-format=""');
    expect(html).toContain('Change the format');
    expect(html).toContain('Use the season&#x27;s format');
    expect(html).toContain('This game has its own format.');
  });
});
