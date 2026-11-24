// League settings → Profile and the Archive buttons, drawn (step 2.125 part 2): every
// field with the league's values, the forwarding sentence beside the short name, the tick
// a move toward adults asks for, and the sentence that says "children in full" is cleared
// before it is saved (R-14, R-29).
import type { LeagueProfile } from '@srleagues/core';
import { catalogs } from '@srleagues/site';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProfilePanel } from './profile-panel.tsx';
import { PublishPanel } from './publish-panel.tsx';

const en = catalogs['en'] ?? {};
const words = (key: string) => {
  const found = en[key];
  if (found === undefined) throw new Error(`No message ${key}`);
  return renderToStaticMarkup(createElement('span', null, found)).slice(6, -7);
};

const profile: LeagueProfile = {
  contactEmail: 'hello@example.org',
  city: 'Springfield',
  timeZone: 'America/Chicago',
  listed: true,
  audience: 'adult',
};

/** The one input tag that has all these attributes. */
const tagWith = (html: string, ...parts: string[]) =>
  (html.match(/<input[^>]*>/g) ?? []).filter((tag) => parts.every((part) => tag.includes(part)));

const draw = (over: Partial<Parameters<typeof ProfilePanel>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ProfilePanel, {
      league: 'north-valley',
      name: 'North Valley League',
      slug: 'north-valley',
      version: 4,
      profile,
      resets: { childrenInFull: false, namesChoice: false, listing: false },
      mayChange: true,
      ...over,
    }),
  );

describe('the Profile part of League settings', () => {
  it('shows each field with the league’s value, and that the old address forwards', () => {
    const html = draw();
    expect(html).toContain('id="settings-profile"');
    expect(html).toContain('value="North Valley League"');
    expect(html).toContain('value="north-valley"');
    expect(html).toContain('value="hello@example.org"');
    expect(html).toContain('value="Springfield"');
    expect(html).toContain('value="America/Chicago"');
    expect(tagWith(html, 'name="listed"', 'checked=""')).toHaveLength(1);
    expect(tagWith(html, 'name="audience"', 'value="adult"', 'checked=""')).toHaveLength(1);
    expect(tagWith(html, 'name="audience"', 'checked=""')).toHaveLength(1);
    expect(html).toContain(words('adminSettings.profile.shortNameForwards'));
  });

  it('an adult league asks no tick, and says nothing is cleared when nothing would be', () => {
    const html = draw();
    expect(html).not.toContain('data-says="confirm-toward-adults"');
    expect(html).not.toContain('data-says="clears-full-names"');
    expect(html).not.toContain('data-says="youth-resets"');
  });

  it('says before saving that bringing children in clears a confirmed "children in full"', () => {
    const html = draw({ resets: { childrenInFull: true, namesChoice: false, listing: false } });
    expect(html).toContain('data-says="clears-full-names"');
    expect(html).toContain(words('adminSettings.profile.youthResets.childrenInFull'));
    expect(html).not.toContain('data-resets="listing"');
  });

  it('lists every choice bringing children in puts back, before saving (S-96)', () => {
    const html = draw({ resets: { childrenInFull: true, namesChoice: true, listing: true } });
    expect(html).toContain(words('adminSettings.profile.youthResets'));
    for (const key of ['childrenInFull', 'namesChoice', 'listing']) {
      expect(html).toContain(`data-resets="${key}"`);
    }
    expect(html).toContain(words('adminSettings.profile.youthResetsAfter'));
  });

  it('says before saving that a new time zone moves the shown time of every game', () => {
    expect(draw()).toContain(words('adminSettings.profile.timeZoneMovesGames'));
  });

  it('a youth league offers the tick a move toward adults asks for (R-14)', () => {
    const html = draw({
      profile: { ...profile, audience: 'youth' },
      resets: { childrenInFull: true, namesChoice: true, listing: true },
    });
    expect(html).toContain('data-says="confirm-toward-adults"');
    expect(html).not.toContain('data-says="youth-resets"');
  });

  it('draws every field disabled, and says why, where it cannot be changed', () => {
    const html = draw({ mayChange: false });
    expect(html).toContain(words('adminSettings.profile.readOnly'));
    expect(tagWith(html, 'name="name"', 'disabled=""')).toHaveLength(1);
    expect(tagWith(html, 'name="timeZone"', 'disabled=""')).toHaveLength(1);
  });
});

describe('the Archive and Un-archive buttons', () => {
  const panel = (status: 'live' | 'archived', askingArchive = false, mayPublish = true) =>
    renderToStaticMarkup(
      createElement(PublishPanel, {
        league: 'north-valley',
        address: '/north-valley/admin/settings',
        status,
        version: 5,
        checks: [],
        mayPublish,
        asking: false,
        askingArchive,
      }),
    );

  it('a published league offers Archive, which asks once before the form', () => {
    expect(panel('live')).toContain('?archive=ask#publish');
    expect(panel('live')).not.toContain('data-form="archive"');
    const asking = panel('live', true);
    expect(asking).toContain('data-form="archive"');
    expect(asking).toContain(words('adminSettings.publish.archiveAsk'));
  });

  it('an archived league says so and offers Un-archive', () => {
    const html = panel('archived');
    expect(html).toContain(words('adminSettings.publish.archived'));
    expect(html).toContain('data-form="unarchive"');
  });

  it('draws no button for someone who may not change the league', () => {
    expect(panel('live', false, false)).not.toContain('?archive=ask');
    expect(panel('archived', false, false)).not.toContain('data-form="unarchive"');
  });
});
