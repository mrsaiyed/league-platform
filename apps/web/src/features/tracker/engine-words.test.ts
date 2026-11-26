// The table from the engine's refusals and kinds of play to message keys (finding M3).
// The first two tests read the engine's own source, so a refusal or a kind of play added
// to the engine with no message fails here, not in front of a scorekeeper.
import { createTranslator, en } from '@srleagues/site';
import { basketball } from '@srleagues/sports';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  periodText,
  playKeys,
  playText,
  playerLabel,
  playerShortLabel,
  refusalKey,
  refusalText,
  unknownRefusalKey,
} from './engine-words.ts';
import type { DevicePlayer, DeviceRosters } from './opened-game-storage.ts';
import { trackerCatalog } from './tracker-catalog.ts';

const engineSource = readFileSync(
  new URL('../../../../../packages/sports/src/basketball/live.ts', import.meta.url),
  'utf8',
);

/** Where the bracket opened at `open` closes, skipping over strings and templates. */
function closing(source: string, open: number, pair: '()' | '{}'): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i];
    if (c === "'" || c === '"') {
      i = source.indexOf(c, i + 1);
    } else if (c === '`') {
      i = templateEnd(source, i);
    } else if (c === pair[0]) {
      depth += 1;
    } else if (c === pair[1]) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('unbalanced brackets in the engine source');
}

/** Where the template opened at `open` closes, skipping its `${...}` holes. */
function templateEnd(source: string, open: number): number {
  for (let i = open + 1; i < source.length; i += 1) {
    if (source[i] === '`') return i;
    if (source[i] === '$' && source[i + 1] === '{') i = closing(source, i + 1, '{}');
  }
  throw new Error('an unfinished template in the engine source');
}

/** Every sentence a `fail(...)` call of the engine can refuse with; a hole reads "X". */
function engineRefusals(source: string): string[] {
  const sentences: string[] = [];
  const call = /\bfail\(/g;
  for (let found = call.exec(source); found !== null; found = call.exec(source)) {
    if (source.slice(0, found.index).endsWith('function ')) continue;
    const open = found.index + 'fail'.length;
    const end = closing(source, open, '()');
    for (let i = open + 1; i < end; i += 1) {
      const c = source[i];
      if (c === "'" || c === '"') {
        const close = source.indexOf(c, i + 1);
        // A value something is compared with (`next === 'running' ? … : …`) is not a sentence.
        const compared = /[=!]==\s*$/.test(source.slice(open, i));
        if (!compared) sentences.push(source.slice(i + 1, close));
        i = close;
      } else if (c === '`') {
        const close = templateEnd(source, i);
        let text = '';
        for (let j = i + 1; j < close; j += 1) {
          if (source[j] === '$' && source[j + 1] === '{') {
            text += 'X';
            j = closing(source, j + 1, '{}');
          } else {
            text += source[j];
          }
        }
        sentences.push(text);
        i = close;
      }
    }
  }
  return sentences;
}

/** The kinds of play in the engine's `Play` type. */
function enginePlayKinds(source: string): string[] {
  const start = source.indexOf('export type Play =');
  const end = source.indexOf(';\n\n', start);
  if (start < 0 || end < 0) throw new Error('the engine no longer has `export type Play =`');
  return [...source.slice(start, end).matchAll(/\{ type: '([a-z-]+)'/g)].map((m) => m[1] ?? '');
}

const t = createTranslator('en', { en: trackerCatalog(en) });

const player = (
  personId: string,
  jerseyNumber: string | null,
  firstName: string,
  lastName: string,
): DevicePlayer => ({
  personId,
  jerseyNumber,
  firstName,
  lastName,
  left: false,
  addedAtGameId: null,
  toReview: false,
});
const rosters: DeviceRosters = {
  home: {
    teamId: 'h',
    name: 'Hawks',
    players: [player('h4', '4', 'Jordan', 'Ellis'), player('h9', null, 'Max', 'Hawkins')],
  },
  away: {
    teamId: 'a',
    name: 'Bears',
    players: [player('a12', '12', '', ''), player('a7', '7', 'Sol', 'Bearsley')],
  },
  uniqueJerseys: false,
  allowTies: false,
};

describe('the engine’s refusals in the tracker’s words', () => {
  const sentences = engineRefusals(engineSource);

  it('finds the engine’s refusals in its source', () => {
    // The audit counted 47 `fail(…)` lines; the engine has gained some since.
    expect(sentences.length).toBeGreaterThanOrEqual(45);
    expect(sentences).toContain('That player is already on the floor.');
    expect(sentences).toContain('It is already X.');
    expect(sentences).toContain('The clock already stops on fouls.');
  });

  it('has a message for every refusal the engine can make', () => {
    const withoutWords = sentences.filter((s) => refusalKey(s) === unknownRefusalKey);
    expect(withoutWords).toEqual([]);
    for (const sentence of sentences) {
      expect(Object.hasOwn(en, refusalKey(sentence)), sentence).toBe(true);
      expect(refusalText(sentence, t)).not.toBe('');
    }
  });

  it('words what the engine really refuses, values included', () => {
    const refused = (state: basketball.GameState, command: basketball.Command): string => {
      try {
        basketball.apply(state, command, { id: 'x', now: 1 });
      } catch (thrown) {
        if (thrown instanceof basketball.TrackerError) return refusalText(thrown.message, t);
        throw thrown;
      }
      throw new Error('the engine took it');
    };
    const fresh = basketball.newGame(basketball.QUARTERS, 0);
    const five = ['a', 'b', 'c', 'd', 'e'];
    const set = basketball.apply(
      fresh,
      { type: 'lineup', side: 'home', playerIds: five },
      { id: 'l', now: 1 },
    );
    expect(refused(fresh, { type: 'lineup', side: 'home', playerIds: [...five, 'f'] })).toBe(
      'Pick 1 to 5 players.',
    );
    expect(refused(fresh, { type: 'period', period: 1 })).toBe(
      'The game is already in that period.',
    );
    expect(refused(set, { type: 'sub', side: 'home', inId: 'a', outId: 'b' })).toBe(
      'That player is already on the court.',
    );
    expect(refused(set, { type: 'unfoul', side: 'home', playerId: 'a' })).toBe(
      'That player has no foul to take back.',
    );
    expect(refused(set, { type: 'team-unturnover', side: 'home' })).toBe(
      'There is no team turnover to take back.',
    );
    expect(refused(fresh, { type: 'pause' })).toBe('The clock is not running.');
  });

  it('says so plainly when a newer engine refuses with words it does not know', () => {
    expect(refusalKey('Something new.')).toBe(unknownRefusalKey);
    expect(refusalText('Something new.', t)).toBe('The game’s rules do not allow that.');
    // An inherited name is never read as a refusal.
    expect(refusalKey('constructor')).toBe(unknownRefusalKey);
  });
});

describe('the engine’s plays in the tracker’s words', () => {
  it('has a message for every kind of play the engine has', () => {
    const kinds = enginePlayKinds(engineSource);
    expect(kinds.length).toBeGreaterThanOrEqual(13);
    expect(kinds.filter((kind) => !Object.hasOwn(playKeys, kind))).toEqual([]);
    for (const keys of Object.values(playKeys)) {
      for (const key of typeof keys === 'string' ? [keys] : keys) {
        expect(Object.hasOwn(en, key), key).toBe(true);
      }
    }
  });

  it('words each kind of play', () => {
    const say = (play: basketball.Play) => playText(play, rosters, 4, t);
    expect(say({ type: 'score', side: 'home', playerId: 'h4', points: 3 })).toBe(
      '#4 Jordan Ellis +3',
    );
    expect(say({ type: 'foul', side: 'away', playerId: 'a12' })).toBe('Foul on #12');
    expect(say({ type: 'unfoul', side: 'away', playerId: 'a7' })).toBe(
      'Foul taken back: #7 Sol Bearsley',
    );
    expect(say({ type: 'turnover', side: 'home', playerId: 'h9' })).toBe('Turnover by Max Hawkins');
    expect(say({ type: 'unturnover', side: 'home', playerId: 'h9' })).toBe(
      'Turnover taken back: Max Hawkins',
    );
    expect(say({ type: 'team-turnover', side: 'home' })).toBe('Team turnover: Hawks');
    expect(say({ type: 'team-unturnover', side: 'away' })).toBe('Team turnover taken back: Bears');
    expect(say({ type: 'timeout', side: 'home', seconds: 60 })).toBe('Full timeout: Hawks');
    expect(say({ type: 'timeout', side: 'away', seconds: 30 })).toBe('30-second timeout: Bears');
    expect(say({ type: 'untimeout', side: 'away' })).toBe('Timeout taken back: Bears');
    expect(say({ type: 'sub', side: 'home', inId: 'h9', outId: 'h4' })).toBe(
      'Sub: Max Hawkins in for #4 Jordan Ellis',
    );
    expect(say({ type: 'lineup', side: 'away', playerIds: ['a12', 'a7'] })).toBe(
      'Bears starters: #12, #7 Sol Bearsley',
    );
    expect(say({ type: 'period', period: 5 })).toBe('Start of OT1');
    expect(say({ type: 'clock-mode', mode: 'running' })).toBe('Running clock on');
    expect(say({ type: 'clock-mode', mode: 'stop' })).toBe('Stop clock on');
  });

  it('names a player by number and name, by either alone, and says when it has neither', () => {
    const [ellis, hawkins] = rosters.home.players;
    const [twelve] = rosters.away.players;
    expect(playerLabel(ellis, t)).toBe('#4 Jordan Ellis');
    expect(playerShortLabel(ellis, t)).toBe('#4 Jordan');
    expect(playerLabel(hawkins, t)).toBe('Max Hawkins');
    expect(playerShortLabel(hawkins, t)).toBe('Max Hawkins');
    expect(playerLabel(twelve, t)).toBe('#12');
    expect(playerShortLabel(twelve, t)).toBe('#12');
    expect(playerLabel(undefined, t)).toBe('Player not on this device’s list');
    expect(playerLabel(player('x', null, '', ''), t)).toBe('Player not on this device’s list');
    // One part of a name alone is that part.
    expect(playerLabel(player('y', '8', '', 'Solo'), t)).toBe('#8 Solo');
  });

  it('names one the number and name do not tell apart by their place (R-33)', () => {
    const nameless = { ...player('z', null, '', ''), ordinal: 1 };
    expect(playerLabel(nameless, t)).toBe('Player 1');
    expect(playerShortLabel(nameless, t)).toBe('Player 1');
    const twin = { ...player('w', null, 'Sam L.', ''), ordinal: 2 };
    expect(playerLabel(twin, t)).toBe('Sam L. (player 2)');
    // A number tells them apart: no place is worded beside it.
    expect(playerLabel({ ...player('v', '5', 'Sam L.', ''), ordinal: null }, t)).toBe('#5 Sam L.');
  });

  it('names periods as the format has them', () => {
    expect(periodText(3, 4, t)).toBe('Q3');
    expect(periodText(2, 2, t)).toBe('H2');
    expect(periodText(5, 4, t)).toBe('OT1');
    expect(periodText(4, 2, t)).toBe('OT2');
  });
});
