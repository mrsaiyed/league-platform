// The league's own notice (step 2.60): drawn as text in a named region, or not at all.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { leagueKeepOut, leagueRobots } from '../../server/league-search-marks.ts';
import { SiteNotice } from './site-notice.tsx';

const draw = (notice: string) => renderToStaticMarkup(createElement(SiteNotice, { notice }));

describe('SiteNotice', () => {
  it('draws nothing for a league with no notice', () => {
    expect(draw('')).toBe('');
  });

  it('draws the admin words as text in a region named for the league, with no way to close it', () => {
    const html = draw('Unofficial demo <script>alert(1)</script>');
    expect(html).toBe(
      '<aside class="site-notice league-own-notice" aria-label="Notice from the league"><p>Unofficial demo &lt;script&gt;alert(1)&lt;/script&gt;</p></aside>',
    );
    expect(html).not.toContain('<button');
  });
});

describe('leagueRobots (U-10, U-18)', () => {
  it('marks a league that is not to be indexed, and only that one', () => {
    expect(leagueRobots({ notice: '', doNotIndex: true })).toEqual({ robots: leagueKeepOut });
    expect(leagueRobots({ notice: 'x', doNotIndex: false })).toEqual({});
    expect(leagueKeepOut).toMatchObject({ index: false, follow: false, noarchive: true });
  });
});
