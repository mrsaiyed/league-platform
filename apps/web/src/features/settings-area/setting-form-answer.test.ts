import { declaredSettings } from '@srleagues/core';
import { en } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import type { TextKey } from '../../server/messages.ts';
import { settingName, settingRefusal, settingSaved } from './setting-form-answer.ts';

const label = 'setting.games.whoMayScore.label' as const;

describe('a refused setting form (step 2.155 part 4)', () => {
  it('marks the value and names the setting for a value it does not accept', () => {
    const refusal = settingRefusal(label, 'leagues.set_setting', 'invalid-value', false);
    expect(refusal.wrong).toEqual(['value']);
    expect(refusal.said).toMatch(/^Which games a scorekeeper may score: That value is not allowed/);
  });

  it('marks the tick when the value is drawn as one tick, or a confirmation is missing', () => {
    expect(settingRefusal(label, 'leagues.set_setting', 'invalid-value', true).wrong).toEqual([
      'confirmed',
    ]);
    expect(
      settingRefusal(label, 'leagues.set_setting', 'confirmation-needed', false).wrong,
    ).toEqual(['confirmed']);
  });

  it('says a change made meanwhile as the screen shows it, and marks no box', () => {
    const refusal = settingRefusal(label, 'leagues.set_setting', 'changed-since-read', false);
    expect(refusal.wrong).toEqual([]);
    expect(refusal.said).toMatch(/^Someone else changed the league since you opened this page/);
    expect(settingRefusal(label, 'leagues.clear_setting', 'changed-since-read', false).said).toBe(
      refusal.said,
    );
  });
});

describe('a saved setting form', () => {
  const labelOf = (key: string) => (key === 'games.whoMayScore' ? label : undefined);
  it('says Saved beside the setting, naming it', () => {
    expect(settingSaved({ thing: 'games.whoMayScore', said: 'setting' }, labelOf)).toEqual({
      key: 'games.whoMayScore',
      text: 'Saved: Which games a scorekeeper may score.',
    });
    expect(
      settingSaved({ thing: 'games.whoMayScore', said: 'settingCleared' }, labelOf)?.text,
    ).toBe('Which games a scorekeeper may score is back to its default.');
  });

  it('says nothing for a Profile notice or a setting that is not on the page', () => {
    expect(settingSaved({ thing: 'name', said: 'name' }, labelOf)).toBeUndefined();
    expect(settingSaved({ thing: 'gone.key', said: 'setting' }, labelOf)).toBeUndefined();
    expect(settingSaved(undefined, labelOf)).toBeUndefined();
  });
});

// T-419: every setting the product declares has a short name, and each of the three
// sentences built from it reads as one sentence: no "..", ".:" or ". is" anywhere.
describe('every declared setting, named in its three sentences', () => {
  const broken = /\.\.|\.:|\. is /;
  for (const setting of declaredSettings.all()) {
    it(setting.key, () => {
      const label = setting.label as TextKey;
      const nameKey = label.replace(/\.label$/, '.name');
      expect(Object.hasOwn(en, nameKey), nameKey).toBe(true);
      expect(settingName(label)).toBe(nameKey);
      const name = (en as Record<string, string>)[nameKey] ?? '';
      expect(name).toMatch(/^[A-Z][^.:!?]{2,60}$/);
      const labelOf = (key: string) => (key === setting.key ? label : undefined);
      const saved = settingSaved({ thing: setting.key, said: 'setting' }, labelOf)?.text;
      const cleared = settingSaved({ thing: setting.key, said: 'settingCleared' }, labelOf)?.text;
      const refusal = settingRefusal(label, 'leagues.set_setting', 'invalid-value', false).said;
      expect(saved).toBe(`Saved: ${name}.`);
      expect(cleared).toBe(`${name} is back to its default.`);
      expect(refusal).toMatch(
        new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: [A-Z][^:]*\\.$`),
      );
      for (const sentence of [saved, cleared, refusal]) expect(sentence).not.toMatch(broken);
    });
  }
});
