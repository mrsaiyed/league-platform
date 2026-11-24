// "Current and archived" drawn on the server (step 2.130): a hidden season is not offered
// Archive and is told to be shown first (T-388); made current while hidden, it says the
// admin's screens open on it and visitors go on seeing the newest shown season (S-103); a
// shown season's archive question and an archived season keep their own words.
import { seasonRulesPreset } from '@srleagues/contracts';
import type { SeasonStatus, SeasonView } from '@srleagues/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SeasonStatePanel } from './season-start-panels.tsx';

const season = (status: SeasonStatus, isCurrent: boolean): SeasonView => ({
  id: 'season-1',
  slug: 'summer-2027',
  name: 'Summer 2027',
  startsOn: null,
  endsOn: null,
  status,
  isCurrent,
  rules: seasonRulesPreset('rec-league'),
  rulesSaved: true,
  rulesWarnings: [],
  version: 1,
});

const draw = (shown: SeasonView, asked?: string) =>
  renderToStaticMarkup(
    createElement(SeasonStatePanel, {
      season: shown,
      league: 'a-league',
      base: '/a-league/admin/season',
      back: '/a-league/admin/season?season=summer-2027',
      mayChange: true,
      asked,
      said: undefined,
      problem: undefined,
    }),
  );

describe('SeasonStatePanel', () => {
  it('offers no Archive on a hidden season and says to show it first', () => {
    const html = draw(season('draft', false));
    expect(html).not.toContain('data-season-change="archive"');
    expect(html).toContain('data-season-change="current"');
    expect(html).toContain(
      'Summer 2027 is hidden from visitors, so it cannot be archived: an archived season is shown to visitors and cannot be hidden again. Show it to visitors first if you want to archive it.',
    );
  });

  it('does not ask to archive a hidden season even when the address asks', () => {
    const html = draw(season('draft', false), 'archive');
    expect(html).not.toContain('data-season-ask="archive"');
    expect(html).not.toContain('still find it');
  });

  it('tells the truth about making a hidden season current', () => {
    const html = draw(season('draft', false), 'current');
    expect(html).toContain('Your own admin screens open on it from now on.');
    expect(html).toContain(
      'visitors go on seeing the newest season that is shown until you show this one',
    );
    expect(html).not.toContain('pages open on it from now on');
  });

  it('says a hidden current season is not what visitors see', () => {
    const html = draw(season('draft', true));
    expect(html).toContain('Summer 2027 is the current season: your admin screens open on it.');
    expect(html).not.toContain('the league&#x27;s pages open on it');
  });

  it('keeps the archive question for a shown season', () => {
    const html = draw(season('active', false), 'archive');
    expect(html).toContain('data-season-ask="archive"');
    expect(html).toContain('Visitors still find it under the season picker');
    expect(html).not.toContain('data-season-archive-hidden');
  });

  it('offers no archive button on an archived season', () => {
    const html = draw(season('completed', true));
    expect(html).not.toContain('data-season-change="archive"');
    expect(html).toContain('data-season-archived');
  });
});
