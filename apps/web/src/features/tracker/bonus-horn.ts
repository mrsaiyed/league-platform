// The bonus horn (step 2.36; checklist F4 of the 2.107 audit): one note when a team goes
// into the bonus, two higher ones for the double bonus. It is the BONUS horn and nothing
// else: no horn sounds when a period ends. Taken from the Al-Hadi tracker's own
// (apps/live-stats/public/js/sound.js): made with Web Audio, so there is no sound file to
// fail mid-game and nothing to download.
//
// A muted tablet is the normal case in a gym, so the screen always says it in words as
// well, and the horn is never allowed to stop the screen: no sound allowed, no speaker, a
// browser without Web Audio or one that throws all end in silence (`sound` never throws).
// A phone lets sound start only from a tap, so `ready()` is called in the tap that
// records the foul; the note itself may then sound a moment later.

/** The little of Web Audio the horn uses: what a test hands in, and what a browser has. */
export type HornAudio = {
  readonly currentTime: number;
  readonly state?: string;
  readonly destination: unknown;
  resume?(): Promise<void> | void;
  createOscillator(): {
    type: string;
    frequency: { setValueAtTime(value: number, at: number): void };
    connect(to: unknown): unknown;
    start(at: number): void;
    stop(at: number): void;
  };
  createGain(): {
    gain: {
      setValueAtTime(value: number, at: number): void;
      linearRampToValueAtTime(value: number, at: number): void;
    };
    connect(to: unknown): unknown;
  };
};

export type BonusHorn = {
  /** Called in a tap: makes the sound ready, where the browser allows it. Never throws. */
  ready(): void;
  /** One note for the bonus (1), two higher ones for the double bonus (2). Never throws. */
  sound(level: 1 | 2): void;
};

/** The notes: when each starts (seconds from now), its pitch and how long it lasts. */
export const hornNotes: Readonly<Record<1 | 2, readonly (readonly [number, number, number])[]>> = {
  1: [[0, 523, 0.34]],
  2: [
    [0, 740, 0.2],
    [0.26, 740, 0.2],
  ],
};

const loudness = 0.22;

/**
 * A horn on the audio `open` gives: the browser's, or null where there is none. `open`
 * is called at the first tap, not before, and may throw: the horn is then silent.
 */
export function createBonusHorn(open: () => HornAudio | null): BonusHorn {
  let audio: HornAudio | null = null;
  let failed = false;
  const get = (): HornAudio | null => {
    if (audio !== null || failed) return audio;
    try {
      audio = open();
    } catch {
      audio = null;
    }
    // Asked for once: a browser that has no sound is not asked again at every foul.
    if (audio === null) failed = true;
    return audio;
  };
  const wake = (ac: HornAudio): void => {
    if (ac.state !== 'suspended') return;
    // A refusal is an answer too (no tap behind it yet): nothing is thrown, nothing waits.
    void Promise.resolve(ac.resume?.()).catch(() => undefined);
  };
  const note = (ac: HornAudio, startAt: number, pitch: number, seconds: number): void => {
    const from = ac.currentTime + startAt;
    const oscillator = ac.createOscillator();
    const gain = ac.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(pitch, from);
    // Both ends are eased: a square wave switched on at full volume clicks.
    gain.gain.setValueAtTime(0, from);
    gain.gain.linearRampToValueAtTime(loudness, from + 0.012);
    gain.gain.setValueAtTime(loudness, from + seconds - 0.04);
    gain.gain.linearRampToValueAtTime(0, from + seconds);
    oscillator.connect(gain);
    gain.connect(ac.destination);
    oscillator.start(from);
    oscillator.stop(from + seconds + 0.02);
  };
  return {
    ready() {
      try {
        const ac = get();
        if (ac !== null) wake(ac);
      } catch {
        // Sound is a nicety: the badge and the sentence on the screen are the signal.
      }
    },
    sound(level) {
      try {
        const ac = get();
        if (ac === null) return;
        wake(ac);
        for (const [startAt, pitch, seconds] of hornNotes[level]) note(ac, startAt, pitch, seconds);
      } catch {
        // As above: the screen has already said it.
      }
    },
  };
}

/** The browser's own audio, or null where it has none (an old browser, a test). */
export function browserHornAudio(): HornAudio | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: new () => HornAudio;
    webkitAudioContext?: new () => HornAudio;
  };
  const Audio = scope.AudioContext ?? scope.webkitAudioContext;
  return Audio === undefined ? null : new Audio();
}

/** Each team's bonus as the screen last showed it, and the period that was being played. */
export type BonusShown = Readonly<Record<'home' | 'away', 0 | 1 | 2>> & {
  readonly period: number;
};

/**
 * The teams whose bonus rose from what was shown to what is shown now, home first: each
 * is sounded and said once.
 *
 * The horn sounds when a team REACHES the bonus or the double bonus by a foul, recorded
 * on this device or on any other (the game as it is shown is what is compared, whoever
 * changed it). It does NOT sound:
 * - on the first showing (`before` null): opening a game already in the bonus is silent
 *   (F4);
 * - when the period changed: going back to a period that is already in the bonus is
 *   nearly always the correction of a slip, nobody reached anything, and the horn would
 *   say otherwise to the whole gym. The badge shows, and what the screen says is the
 *   sentence about the period (the lead's product answer on the area 4 review of step
 *   2.36; the code review, L-2). A foul given after that, in the same period, sounds as
 *   always.
 */
export function bonusRises(
  before: BonusShown | null,
  now: BonusShown,
): { readonly side: 'home' | 'away'; readonly level: 1 | 2 }[] {
  if (before === null || before.period !== now.period) return [];
  const rises: { side: 'home' | 'away'; level: 1 | 2 }[] = [];
  for (const side of ['home', 'away'] as const) {
    const level = now[side];
    if (level !== 0 && level > before[side]) rises.push({ side, level });
  }
  return rises;
}
