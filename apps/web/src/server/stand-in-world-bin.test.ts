import { describe, expect, it } from 'vitest';
import { worldBinStore } from './stand-in-world-bin.ts';
import { emptyLeagueWorld, type WorldPerson } from './stand-in-world-state.ts';

const ada: WorldPerson = {
  id: '00000000-0000-4000-8000-000000000001',
  firstName: 'Ada',
  lastName: 'Lovell',
  publicName: null,
  visibility: 'none',
  binned: true,
  version: 2,
  sensitive: { contactEmail: 'ada@example.test', birthDate: null, isMinor: null },
  accountId: null,
};

function worldWithAda() {
  const s = emptyLeagueWorld(
    { id: 'league-1', slug: 'made-up', name: 'Made Up' },
    { audience: 'adult', timeZone: 'UTC' },
  );
  s.people = [ada];
  return s;
}

describe('the made-up world’s bin, for a person', () => {
  it('finds a person in the bin and brings them back as they were', async () => {
    const s = worldWithAda();
    const bin = worldBinStore(s);
    expect(await bin.findPerson(ada.id)).toEqual({ binned: true });
    expect(await bin.restorePerson(ada.id)).toBe(true);
    expect(s.people[0]).toEqual({ ...ada, binned: false, version: 3 });
    expect(await bin.findPerson(ada.id)).toEqual({ binned: false });
  });

  it('knows no one who is not in the league', async () => {
    const bin = worldBinStore(worldWithAda());
    expect(await bin.findPerson('00000000-0000-4000-8000-000000000009')).toBeUndefined();
    expect(await bin.restorePerson('00000000-0000-4000-8000-000000000009')).toBe(false);
  });

  it('says what it does not do yet, rather than doing it wrong', async () => {
    await expect(worldBinStore(worldWithAda()).list()).rejects.toThrow('Not on the stand-in yet');
  });
});
