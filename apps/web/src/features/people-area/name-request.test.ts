import type { BinListing } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { binView } from '../bin-area/bin-view.ts';
import { showAsOf } from '../teams-area/index.ts';
import { peopleRowOf } from './people-view.ts';
import { peopleRefusalText } from './refusal-text.ts';
import {
  nameRequestInputOf,
  nameRequestRefusalCode,
  showAsChoices,
  showAsChoicesFor,
} from './name-request.ts';

const personId = '0b9c9a43-2f53-4a5e-9d5b-6f2c8e1a7d10';

describe('"Show as" read from the form (R-23)', () => {
  it('offers the three choices, as the league shows everyone first', () => {
    expect(showAsChoices).toEqual(['none', 'initials', 'removed']);
  });

  it('reads a choice, a reason from the fixed list and the version', () => {
    expect(
      nameRequestInputOf({
        personId: personId.toUpperCase(),
        version: '3',
        showAs: 'removed',
        reason: 'guardianAsked',
      }),
    ).toEqual({ personId, version: 3, showAs: 'removed', reason: 'guardianAsked' });
  });

  it('reads nothing without a reason, with a typed reason or an unknown choice', () => {
    const base = { personId, version: '1', showAs: 'initials', reason: 'personAsked' };
    expect(nameRequestInputOf({ ...base, reason: '' })).toBeUndefined();
    expect(nameRequestInputOf({ ...base, reason: 'my mum said so' })).toBeUndefined();
    expect(nameRequestInputOf({ ...base, showAs: 'full' })).toBeUndefined();
    expect(nameRequestInputOf({ ...base, version: 'x' })).toBeUndefined();
  });
});

describe('a refused "Show as" says why (R-26)', () => {
  it('names the archive when an archived league refuses a change that shows more', () => {
    const code = nameRequestRefusalCode('not-allowed', 'archived');
    expect(code).toBe('league-archived');
    expect(peopleRefusalText('set_name_request', code)).toBe(
      'Not saved. This league is archived, so this setting can only be changed to show less.',
    );
  });

  it('names a suspended league the same way', () => {
    expect(
      peopleRefusalText('set_name_request', nameRequestRefusalCode('not-allowed', 'suspended')),
    ).toBe(
      'Not saved. This league is suspended, so this setting can only be changed to show less.',
    );
  });

  // Step 2.146's closing round (Low 11): the details' save says why in the same way.
  it('names the archive or the suspension when the details are refused', () => {
    expect(
      peopleRefusalText('update_person', nameRequestRefusalCode('not-allowed', 'archived')),
    ).toBe(
      'Not saved. This league is archived, so a person’s details, "An adult" or "A child" included, cannot be changed.',
    );
    expect(
      peopleRefusalText('update_person', nameRequestRefusalCode('not-allowed', 'suspended')),
    ).toBe(
      'Not saved. This league is suspended, so a person’s details, "An adult" or "A child" included, cannot be changed.',
    );
  });

  it('keeps every other refusal as it is', () => {
    expect(nameRequestRefusalCode('not-allowed', 'live')).toBe('not-allowed');
    expect(nameRequestRefusalCode('initials-not-offered', 'archived')).toBe('initials-not-offered');
  });
});

describe('"Show as" beside the recorded name in the lists (R-33)', () => {
  const record = { id: personId, firstName: 'Sam', lastName: 'Player', publicName: null };

  it('says initials or removed beside the name, and nothing for no request', () => {
    expect(showAsOf({ nameRequest: 'initials' })).toBe('Show as: initials');
    expect(showAsOf({ nameRequest: 'removed' })).toBe('Show as: removed');
    expect(showAsOf({ nameRequest: 'none' })).toBeUndefined();
    expect(showAsOf({})).toBeUndefined();
  });

  it("keeps the recorded name on People's list, with the request beside it", () => {
    const row = (visibility: string) =>
      peopleRowOf({ ...record, visibility, binned: false, version: 1 });
    expect(row('removed')).toEqual({
      id: personId,
      name: 'Sam Player',
      showAs: 'Show as: removed',
    });
    expect(row('none')).toEqual({ id: personId, name: 'Sam Player' });
  });

  it('keeps the recorded name in the bin, with the request as its fact', () => {
    const items: BinListing[] = [
      {
        kind: 'person',
        id: personId,
        name: 'Sam Player',
        secondName: null,
        seasonId: null,
        binnedAt: '2026-11-20T18:00:00.000Z',
        removedForGoodAt: null,
        kept: true,
        details: { nameRequest: 'initials' },
      },
    ];
    const [shown] = binView(items, { locale: 'en', timeZone: 'UTC' }).person;
    expect(shown?.title).toBe('Sam Player');
    expect(shown?.facts).toEqual(['Show as: initials']);
  });
});

describe('"Show as" in an archived or suspended league (R-26)', () => {
  it('offers only the request kept now and those that show less', () => {
    for (const status of ['archived', 'suspended']) {
      expect(showAsChoicesFor('none', status)).toEqual(['none', 'initials', 'removed']);
      expect(showAsChoicesFor('initials', status)).toEqual(['initials', 'removed']);
      expect(showAsChoicesFor('removed', status)).toEqual(['removed']);
    }
  });

  it('offers all three in a league that is running', () => {
    for (const status of ['draft', 'live']) {
      expect(showAsChoicesFor('removed', status)).toEqual(['none', 'initials', 'removed']);
    }
  });
});
