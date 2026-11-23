// Nothing unfinished shows in production (step 2.140): no English message that a live league
// can see says that something is "not ready yet" or "not built yet". A sentence about a way
// back that has no screen says only what is true today (2026-11-23 fix round).
import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from './en.ts';

/** Keys drawn only in local and test mode, by the placeholders of pages not built yet. */
const localOnly: Readonly<Partial<Record<MessageKey, string>>> = {
  'admin.notReady.body': 'the panel of an admin area not built yet: local and test mode only',
  'admin.notReady.title': 'the title of that same panel: local and test mode only',
  'shell.notBuilt': 'the placeholder of a page not built yet: local and test mode only',
};

const unfinished = /not (ready|built) yet/i;

describe('messages that can show in production', () => {
  it('say nothing is "not ready yet" or "not built yet"', () => {
    const said = (Object.entries(en) as [MessageKey, string][])
      .filter(([key, text]) => localOnly[key] === undefined && unfinished.test(text))
      .map(([key]) => key);
    expect(said).toEqual([]);
  });

  it('allow by name only keys that exist and still need it', () => {
    for (const key of Object.keys(localOnly) as MessageKey[]) {
      expect(unfinished.test(en[key])).toBe(true);
    }
  });
});
