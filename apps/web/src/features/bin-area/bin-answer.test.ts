import { describe, expect, it } from 'vitest';
import { binAnswerOf, binBackSaid, binNotSaid, binTitle } from './bin-answer.ts';

const id = '11111111-2222-4333-8444-555555555555';
const season = '66666666-7777-4888-8999-000000000000';
const notice = (said: string, more: { name?: string; about?: string[] } = {}) => ({
  screen: 'bin' as const,
  thing: id,
  said,
  ...more,
});

describe('the answer to "Bring it back" (T-426)', () => {
  it('reads back each kind brought back, with the name the bin listed it by', () => {
    for (const what of ['team', 'person', 'division', 'venue', 'court'] as const) {
      expect(binAnswerOf(notice(binBackSaid(what, {}), { name: 'Kites' }))).toEqual({
        kind: 'back',
        what,
        id,
        name: 'Kites',
        firstChild: false,
        clashes: [],
      });
    }
  });

  it('keeps a first child back (S-109) and a game back with its revision, season and clashes', () => {
    const child = binAnswerOf(notice(binBackSaid('person', { firstChild: true })));
    expect(child).toMatchObject({ kind: 'back', what: 'person', firstChild: true, name: '' });
    const said = binBackSaid('game', {
      game: { revision: 4, teams: 2, people: 17 },
      seasonId: season,
    });
    expect(said).toBe(`back.game.4.2.17.${season}`);
    expect(binAnswerOf(notice(said, { about: [id] }))).toEqual({
      kind: 'back',
      what: 'game',
      id,
      name: '',
      firstChild: false,
      game: { revision: 4, teams: 2, people: 17, seasonId: season },
      clashes: [id],
    });
  });

  it('reads a refusal as the command and code problemKey takes', () => {
    const said = binNotSaid('leagues.restore_team', 'team-name-taken');
    expect(binAnswerOf(notice(said, { name: 'Larks' }))).toEqual({
      kind: 'refused',
      id,
      name: 'Larks',
      why: 'leagues.restore_team.team-name-taken',
    });
  });

  it('reads nothing it did not leave', () => {
    expect(binAnswerOf(undefined)).toBeUndefined();
    expect(binAnswerOf({ ...notice('back.team'), thing: 'not-an-id' })).toBeUndefined();
    for (const said of [
      'back',
      'back.boat',
      'back.team.extra',
      'back.game.4.2.17',
      'back.game.4.2.17.not-a-season',
      '4.2.17',
      'not.<b>',
      'saved',
    ]) {
      expect(binAnswerOf(notice(said)), said).toBeUndefined();
    }
  });

  it('names a thing as the bin lists it', () => {
    expect(binTitle({ kind: 'team', name: 'Kites', secondName: null })).toBe('Kites');
    expect(binTitle({ kind: 'person', name: '', secondName: null })).not.toBe('');
    expect(binTitle({ kind: 'game', name: 'Owls', secondName: 'Hawks' })).toContain('Hawks');
  });
});
