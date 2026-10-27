// The bonus horn, synthesised with Web Audio so there is no file to fail mid-game.
// The context is made on first use, inside the tap that recorded the foul: iOS only
// lets audio start from a user gesture.
let ctx = null;

function audio() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

function note(startAt, freq, secs) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + startAt;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, t0);
  // Ramp both ends: a square wave switched on at full volume clicks.
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.22, t0 + 0.012);
  gain.gain.setValueAtTime(0.22, t0 + secs - 0.04);
  gain.gain.linearRampToValueAtTime(0, t0 + secs);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + secs + 0.02);
}

/** One note for the bonus, two higher ones for the double bonus. Never throws. */
export function playBonusHorn(level) {
  try {
    const ac = audio();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume?.().catch(() => {});
    if (level >= 2) {
      note(0, 740, 0.2);
      note(0.26, 740, 0.2);
    } else note(0, 523, 0.34);
  } catch {
    // Audio is a nicety; the badge on screen is the real signal.
  }
}
