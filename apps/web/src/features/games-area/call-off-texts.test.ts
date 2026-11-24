import { describe, expect, it } from 'vitest';
import { t } from '../../server/messages.ts';
import { callOffTexts, type CallOffGame } from './call-off-texts.ts';

const game: CallOffGame = {
  status: 'scheduled',
  homeTeamId: 'home',
  awayTeamId: 'away',
  homeName: 'Hawks',
  awayName: 'Owls',
  hasPlays: true,
  forfeitScore: { winner: 20, loser: 0 },
};

describe('the forfeit after line-ups (step 2.56)', () => {
  it('says no plays have reached us, never that the game has not started', () => {
    expect(t('admin.games.lineupsSet')).toContain('no plays have reached us');
    expect(t('admin.games.lineupsSet')).not.toContain('has not started');
  });

  it('warns in the confirmation that plays scored on a device with no signal will not be saved', () => {
    const texts = callOffTexts(game, { forfeit: true, postpone: false, cancel: false });
    for (const ask of Object.values(texts.acts.forfeit?.ask ?? {})) {
      expect(ask).toContain(
        'If someone is scoring this game on a device with no signal, their plays will not be saved.',
      );
    }
    expect(Object.keys(texts.acts.forfeit?.ask ?? {})).toEqual(['away', 'home']);
  });
});

describe("postponing's two answers (step 2.53 fix round)", () => {
  it('offers "give it a new date now" only to whoever may edit the schedule', () => {
    const plain = callOffTexts(game, { forfeit: false, postpone: true, cancel: false });
    expect(plain.acts.postpone?.yesNewDate).toBeUndefined();
    const editor = callOffTexts(game, {
      forfeit: false,
      postpone: true,
      cancel: false,
      newDate: true,
    });
    expect(editor.acts.postpone?.yesNewDate).toBe(t('admin.games.callOff.yesNewDate.postpone'));
  });
});
