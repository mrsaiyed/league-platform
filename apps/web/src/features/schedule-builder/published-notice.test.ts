import { describe, expect, it } from 'vitest';
import { publishedNotice } from './published-notice.ts';

const seasonName = 'Winter 2027';
const now = 'Visitors can see it now.';

describe('publishedNotice', () => {
  it('says visitors can see it only when the season is shown and the league published', () => {
    expect(
      publishedNotice({ seasonShown: true, leagueShown: true, seasonName, mayShow: true }),
    ).toEqual({ text: 'The schedule is published. Visitors can see it now.' });
  });

  it('names a hidden season and points to Season settings, for whoever may show it', () => {
    const said = publishedNotice({
      seasonShown: false,
      leagueShown: true,
      seasonName,
      mayShow: true,
    });
    expect(said.text).toBe('The schedule is published, but visitors cannot see Winter 2027 yet.');
    expect(said.next).toEqual({ kind: 'link', text: 'Show it in Season settings.' });
  });

  it('tells anyone else whom to ask, with no way to show it', () => {
    const said = publishedNotice({
      seasonShown: false,
      leagueShown: true,
      seasonName,
      mayShow: false,
    });
    expect(said.text).not.toContain(now);
    expect(said.next).toEqual({
      kind: 'ask',
      text: "Ask the league's owner or an admin to show it.",
    });
  });

  it('says a league not published is not seen, the season shown or not', () => {
    const shown = publishedNotice({
      seasonShown: true,
      leagueShown: false,
      seasonName,
      mayShow: true,
    });
    expect(shown).toEqual({
      text: 'The schedule is published, but visitors cannot see this league until it is published.',
    });
    const hidden = publishedNotice({
      seasonShown: false,
      leagueShown: false,
      seasonName,
      mayShow: true,
    });
    expect(hidden.text).toBe(
      'The schedule is published, but visitors cannot see this league until it is published, and Winter 2027 is hidden from them too.',
    );
    expect(hidden.text).not.toContain(now);
    expect(hidden.next?.kind).toBe('link');
  });
});
