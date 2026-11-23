import { describe, expect, it } from 'vitest';
import type { Audience } from '../league-values.ts';
import type { StoredSettingRow } from '../ports.ts';
import { siteDoNotIndex, siteNotice } from './declarations.ts';
import { settingDocument } from './lookup-setting.ts';
import { childrenKeepOutOfSearch, readSiteFacts, type SiteFactsStore } from './read-site-facts.ts';

function store(
  values: Readonly<Record<string, unknown>>,
  audience: Audience = 'adult',
  recordedChild = false,
): SiteFactsStore {
  return {
    settingRows: async (key) => {
      const setting = key === siteNotice.key ? siteNotice : siteDoNotIndex;
      if (!(key in values)) return [];
      const row: StoredSettingRow = {
        level: 'league',
        document: settingDocument(setting, values[key]),
        version: 1,
      };
      return [row];
    },
    leagueAudience: async () => audience,
    hasRecordedChild: async () => recordedChild,
  };
}

describe('the site settings (step 2.60)', () => {
  it('start with no notice and the league indexed', () => {
    expect(siteNotice.default).toBe('');
    expect(siteDoNotIndex.default).toBe(false);
    expect(siteNotice.levels).toEqual(['league']);
    expect(siteDoNotIndex.levels).toEqual(['league']);
  });

  it('take short plain text for the notice, and refuse a long one', () => {
    expect(siteNotice.type.safeParse('Unofficial demo, not run by the league').success).toBe(true);
    expect(siteNotice.type.safeParse('<b>x</b>').success).toBe(true);
    expect(siteNotice.type.safeParse('x'.repeat(201)).success).toBe(false);
    expect(siteNotice.type.parse('  Demo  ')).toBe('Demo');
  });
});

describe('readSiteFacts (step 2.60, U-10, U-18)', () => {
  it('reads an ordinary adult league that chose nothing as no notice, indexed', async () => {
    expect(await readSiteFacts(store({}))).toEqual({ notice: '', doNotIndex: false });
  });

  it('reads the notice and "do not index" the admin saved', async () => {
    const facts = await readSiteFacts(
      store({ [siteNotice.key]: 'Unofficial demo', [siteDoNotIndex.key]: true }),
    );
    expect(facts).toEqual({ notice: 'Unofficial demo', doNotIndex: true });
  });

  it('keeps every youth or mixed league out of search, whatever it chose', async () => {
    for (const audience of ['youth', 'mixed'] as const) {
      expect(await readSiteFacts(store({ [siteDoNotIndex.key]: false }, audience))).toEqual({
        notice: '',
        doNotIndex: true,
      });
    }
    expect(childrenKeepOutOfSearch('adult', false)).toBe(false);
  });

  it('keeps an adult league with a recorded child out of search, whatever it chose', async () => {
    expect(await readSiteFacts(store({ [siteDoNotIndex.key]: false }, 'adult', true))).toEqual({
      notice: '',
      doNotIndex: true,
    });
    expect(childrenKeepOutOfSearch('adult', true)).toBe(true);
  });

  it('leaves an adult league with no recorded child to its own setting', async () => {
    expect(await readSiteFacts(store({ [siteDoNotIndex.key]: false }, 'adult', false))).toEqual({
      notice: '',
      doNotIndex: false,
    });
    expect(await readSiteFacts(store({ [siteDoNotIndex.key]: true }, 'adult', false))).toEqual({
      notice: '',
      doNotIndex: true,
    });
  });

  it('reads a damaged stored value as the careful answer', async () => {
    const facts = await readSiteFacts(
      store({ [siteNotice.key]: 42, [siteDoNotIndex.key]: 'perhaps' }),
    );
    expect(facts).toEqual({ notice: '', doNotIndex: true });
  });
});
