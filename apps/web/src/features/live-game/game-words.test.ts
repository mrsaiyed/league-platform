import { describe, expect, it } from 'vitest';
import { gameWords } from './build-game.ts';
import {
  boxScoreName,
  fill,
  periodClockText,
  periodName,
  playSentence,
  playerText,
} from './game-words.ts';

const words = gameWords();

describe('the words of a game', () => {
  it('names periods by the game: quarters, halves and overtime', () => {
    expect(periodName(words, 3, 4)).toBe('Q3');
    expect(periodName(words, 2, 2)).toBe('Half 2');
    expect(periodName(words, 5, 4)).toBe('OT1');
    expect(periodClockText(words, 1, 4, 462_000)).toBe('Q1 7:42');
  });

  it('shows a player by name and number, or what of them is shown', () => {
    expect(playerText(words, 'Ada Lionel', '7')).toBe('#7 Ada Lionel');
    expect(playerText(words, 'Ada Lionel', null)).toBe('Ada Lionel');
    expect(playerText(words, null, '7')).toBe('#7');
    expect(playerText(words, null, null)).toBeNull();
  });

  it('names a box score line "#12" only for a player with no name recorded (S-34)', () => {
    const name = (player: { name: string | null; jersey: string | null; unnamed?: boolean }) =>
      boxScoreName(words.jerseyOnly, 'Name not shown', player);
    expect(name({ name: 'Ada Lionel', jersey: '7' })).toBe('Ada Lionel');
    expect(name({ name: null, jersey: '12', unnamed: true })).toBe('#12');
    // A name withheld (removed, hidden, a team's players for staff only) is said so.
    expect(name({ name: null, jersey: '12' })).toBe('Name not shown');
    expect(name({ name: null, jersey: '12', unnamed: false })).toBe('Name not shown');
    expect(name({ name: null, jersey: null, unnamed: true })).toBe('Name not shown');
  });

  it('words each play, naming nobody where no player is shown', () => {
    const play = (p: Partial<Parameters<typeof playSentence>[1]>) =>
      playSentence(words, { type: 'score', team: 'Lions', player: null, points: 2, ...p });
    expect(play({ player: '#7 Ada Lionel' })).toBe('#7 Ada Lionel scored 2 for Lions');
    expect(play({})).toBe('Lions scored 2');
    expect(play({ type: 'foul' })).toBe('Foul on Lions');
    expect(play({ type: 'team-turnover' })).toBe('Turnover by Lions');
    expect(play({ type: 'sub', playerIn: 'Ada', playerOut: 'Ben' })).toBe(
      'Substitution, Lions: Ada in for Ben',
    );
    expect(play({ type: 'sub' })).toBe('Substitution, Lions');
    expect(play({ type: 'period', team: null, period: 'Q2' })).toBe('Start of Q2');
    expect(play({ type: 'other' })).toBe('The clock or the game changed');
  });

  it('words a team play with no team known without a dangling team', () => {
    const play = (p: Partial<Parameters<typeof playSentence>[1]>) =>
      playSentence(words, { type: 'score', team: null, player: null, points: 2, ...p });
    expect(play({})).toBe('2 points scored');
    expect(play({ points: 1 })).toBe('1 point scored');
    expect(play({ points: 3 })).toBe('3 points scored');
    expect(play({ type: 'timeout' })).toBe('Timeout');
    expect(play({ type: 'foul', player: '#7' })).toBe('Foul');
    expect(play({ type: 'team-turnover' })).toBe('Turnover');
    expect(play({ type: 'untimeout' })).toBe('Timeout taken back');
    expect(play({ type: 'sub' })).toBe('Substitution');
    expect(play({ type: 'lineup' })).toBe('Starting players');
    expect(play({ type: 'period', period: 'Q2' })).toBe('Start of Q2');
  });

  it('words a basket taken back as no longer counting (T-432)', () => {
    const play = (p: Partial<Parameters<typeof playSentence>[1]>) =>
      playSentence(words, { type: 'unscore', team: 'Lions', player: 'Ada', points: 2, ...p });
    expect(play({})).toBe('Basket taken back: Ada’s 2 points for Lions no longer count');
    expect(play({ points: 1 })).toBe(
      'Free throw taken back: Ada’s 1 point for Lions no longer counts',
    );
    expect(play({ player: null })).toBe('Basket taken back: 2 points for Lions no longer count');
    expect(play({ team: null, player: null })).toBe('Basket taken back: 2 points no longer count');
  });

  it('leaves a name with no value as it is', () => {
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });
});
