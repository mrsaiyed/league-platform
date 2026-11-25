// A refused start form's sentence (step 2.245) names the box it stands beside.
import { describe, expect, it } from 'vitest';
import { t } from '../../server/messages.ts';
import { startFields } from './run-start-season.ts';
import { startRefusalKey } from './start-season-refusal.ts';

const label: Record<(typeof startFields)[number], string> = {
  name: 'Name',
  slug: 'Short name',
  startsOn: 'First day',
  endsOn: 'Last day',
  clockMode: 'Clock',
  mercyLead: 'Mercy rule',
  carry: 'Teams',
};

describe('startRefusalKey', () => {
  it('beside a box, the sentence starts with that box', () => {
    for (const field of startFields) {
      const said = t(startRefusalKey('invalid-input', field));
      expect(said.startsWith(`${label[field]}: `)).toBe(true);
      expect(said).not.toMatch(/\.\.|\.:/);
    }
  });

  it('a short name another season uses says so beside the short name', () => {
    expect(t(startRefusalKey('season-slug-taken', 'slug'))).toBe(
      'Short name: another season already uses it. Choose another; nothing was changed.',
    );
  });

  it('about no box, the command says why', () => {
    expect(t(startRefusalKey('program-not-found', undefined))).toBe(
      'There is nowhere to start this season in this league. Nothing was changed.',
    );
  });
});
