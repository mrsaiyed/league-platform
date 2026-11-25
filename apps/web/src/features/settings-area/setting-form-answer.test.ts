import { describe, expect, it } from 'vitest';
import { settingRefusal, settingSaved } from './setting-form-answer.ts';

const label = 'setting.games.whoMayScore.label' as const;

describe('a refused setting form (step 2.155 part 4)', () => {
  it('marks the value and names the setting for a value it does not accept', () => {
    const refusal = settingRefusal(label, 'leagues.set_setting', 'invalid-value', false);
    expect(refusal.wrong).toEqual(['value']);
    expect(refusal.said).toMatch(
      /^Which games a scorekeeper may score.*: That value is not allowed/,
    );
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
      text: expect.stringMatching(/^Saved: Which games a scorekeeper may score/),
    });
    expect(
      settingSaved({ thing: 'games.whoMayScore', said: 'settingCleared' }, labelOf)?.text,
    ).toMatch(/is back to its default\.$/);
  });

  it('says nothing for a Profile notice or a setting that is not on the page', () => {
    expect(settingSaved({ thing: 'name', said: 'name' }, labelOf)).toBeUndefined();
    expect(settingSaved({ thing: 'gone.key', said: 'setting' }, labelOf)).toBeUndefined();
    expect(settingSaved(undefined, labelOf)).toBeUndefined();
  });
});
