// The bonus horn (step 2.36; checklist F4): which notes it plays, when it sounds, and
// above all that its failure never stops the screen: whatever the device's sound does,
// `ready` and `sound` return and throw nothing.
import { basketball } from '@srleagues/sports';
import { describe, expect, it } from 'vitest';
import {
  bonusRises,
  createBonusHorn,
  hornNotes,
  type BonusShown,
  type HornAudio,
} from './bonus-horn.ts';
import { played, tippedOff } from './scoring-test-game.test-helper.ts';

/** A device's sound that works, keeping the notes it was asked to play. */
function workingAudio(state = 'running') {
  const notes: { pitch: number; from: number; until: number }[] = [];
  let resumed = 0;
  const audio: HornAudio = {
    currentTime: 10,
    state,
    destination: 'speaker',
    resume: () => {
      resumed += 1;
      return Promise.resolve();
    },
    createOscillator: () => {
      const note = { pitch: 0, from: 0, until: 0 };
      notes.push(note);
      return {
        type: 'sine',
        frequency: { setValueAtTime: (value) => (note.pitch = value) },
        connect: (to) => to,
        start: (at) => (note.from = at),
        stop: (at) => (note.until = at),
      };
    },
    createGain: () => ({
      gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined },
      connect: (to) => to,
    }),
  };
  return { audio, notes, resumed: () => resumed };
}

describe('the bonus horn’s notes', () => {
  it('plays one note for the bonus and two higher ones for the double bonus', () => {
    const { audio, notes } = workingAudio();
    const horn = createBonusHorn(() => audio);
    horn.sound(1);
    expect(notes.map((n) => n.pitch)).toEqual([523]);
    expect(notes[0]?.from).toBe(10);
    horn.sound(2);
    expect(notes.slice(1).map((n) => n.pitch)).toEqual([740, 740]);
    expect(notes[2]?.from).toBeCloseTo(10.26);
    expect(hornNotes[2].every(([, pitch]) => pitch > (hornNotes[1][0]?.[1] ?? 0))).toBe(true);
  });

  it('is made ready in the tap, and wakes a sound the browser put to sleep', () => {
    const { audio, resumed } = workingAudio('suspended');
    let opened = 0;
    const horn = createBonusHorn(() => {
      opened += 1;
      return audio;
    });
    // Nothing is asked of the device until a tap.
    expect(opened).toBe(0);
    horn.ready();
    expect(opened).toBe(1);
    expect(resumed()).toBe(1);
    horn.sound(1);
    expect(opened).toBe(1);
  });
});

describe('the horn’s failure never stops the screen', () => {
  const failures: Readonly<Record<string, () => HornAudio | null>> = {
    'a browser with no sound at all': () => null,
    'a browser that refuses to make sound': () => {
      throw new Error('NotAllowedError');
    },
    'sound that throws when woken': () => ({
      ...workingAudio('suspended').audio,
      resume: () => {
        throw new Error('no speaker');
      },
    }),
    'sound that refuses to wake (no tap behind it)': () => ({
      ...workingAudio('suspended').audio,
      resume: () => Promise.reject(new Error('NotAllowedError')),
    }),
    'sound that cannot make a note': () => ({
      ...workingAudio().audio,
      createOscillator: () => {
        throw new Error('no speaker');
      },
    }),
    'sound that fails as the note starts': () => {
      const { audio } = workingAudio();
      return {
        ...audio,
        createOscillator: () => ({
          ...audio.createOscillator(),
          start: () => {
            throw new Error('InvalidStateError');
          },
        }),
      };
    },
  };

  for (const [what, open] of Object.entries(failures)) {
    it(`${what}: silence, and nothing thrown`, async () => {
      const horn = createBonusHorn(open);
      expect(() => {
        horn.ready();
        horn.sound(1);
        horn.sound(2);
        horn.ready();
      }).not.toThrow();
      // A refusal that arrives later is not left unhandled either.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('asks a browser with no sound once, not at every foul', () => {
    let asked = 0;
    const horn = createBonusHorn(() => {
      asked += 1;
      return null;
    });
    horn.ready();
    horn.sound(1);
    horn.sound(2);
    expect(asked).toBe(1);
  });
});

describe('when the horn sounds (F4)', () => {
  /** What the screen shows of a game the engine played: each team's bonus, and the period. */
  const shown = (game: basketball.GameState): BonusShown => {
    const derived = basketball.derive(game);
    return {
      home: derived.teams.home.bonus,
      away: derived.teams.away.bonus,
      period: derived.period,
    };
  };
  const fouls = (side: 'home' | 'away', count: number): basketball.Command[] =>
    Array.from({ length: count }, () => ({ type: 'foul', side, playerId: `${side[0]}3` }) as const);

  it('when a team’s bonus rises: to the bonus, and again to the double', () => {
    expect(bonusRises({ home: 0, away: 0, period: 1 }, { home: 0, away: 1, period: 1 })).toEqual([
      { side: 'away', level: 1 },
    ]);
    expect(bonusRises({ home: 0, away: 1, period: 1 }, { home: 0, away: 2, period: 1 })).toEqual([
      { side: 'away', level: 2 },
    ]);
    expect(bonusRises({ home: 0, away: 0, period: 2 }, { home: 2, away: 1, period: 2 })).toEqual([
      { side: 'home', level: 2 },
      { side: 'away', level: 1 },
    ]);
  });

  it('when a foul puts a team there, whichever device recorded it', () => {
    // The game as it is shown is all that is compared: the seventh team foul of the half
    // sounds the same whether this tablet recorded it or it arrived from another.
    const six = played(fouls('home', 6), tippedOff(basketball.HALVES));
    const seventh = played(fouls('home', 1), six);
    expect(bonusRises(shown(six), shown(seventh))).toEqual([{ side: 'away', level: 1 }]);
    const tenth = played(fouls('home', 3), seventh);
    expect(bonusRises(shown(seventh), shown(tenth))).toEqual([{ side: 'away', level: 2 }]);
  });

  it('not when it stays, or drops (a foul taken back, a new period)', () => {
    expect(bonusRises({ home: 1, away: 2, period: 1 }, { home: 1, away: 2, period: 1 })).toEqual(
      [],
    );
    expect(bonusRises({ home: 1, away: 2, period: 1 }, { home: 0, away: 1, period: 1 })).toEqual(
      [],
    );
    expect(bonusRises({ home: 1, away: 2, period: 1 }, { home: 0, away: 0, period: 2 })).toEqual(
      [],
    );
  });

  it('not when someone goes back to a period that is already in the bonus', () => {
    // The first half ended with the visitors in the bonus; the second half began clean.
    const firstHalf = played(fouls('home', 7), tippedOff(basketball.HALVES));
    const secondHalf = played([{ type: 'period', period: 2 }], firstHalf);
    expect(shown(secondHalf)).toEqual({ home: 0, away: 0, period: 2 });
    // Back to the first half by mistake: its bonus is found again. The badge shows; the
    // horn does not sound, since nobody reached anything.
    const back = played([{ type: 'period', period: 1 }], secondHalf);
    expect(shown(back)).toEqual({ home: 0, away: 1, period: 1 });
    expect(bonusRises(shown(secondHalf), shown(back))).toEqual([]);
    // A foul given after that, in the period gone back to, sounds as always.
    const double = played(fouls('home', 3), back);
    expect(bonusRises(shown(back), shown(double))).toEqual([{ side: 'away', level: 2 }]);
  });

  it('and not when a game already in the bonus is opened', () => {
    expect(bonusRises(null, { home: 2, away: 1, period: 1 })).toEqual([]);
  });
});
