// The parts of scripts/heavy.mjs that can be tested by themselves (tests/heavy.test.mjs).
import fs from 'node:fs';
import path from 'node:path';

/**
 * How many heavy commands may run at once: HEAVY_SLOTS, else the number kept in the main
 * folder's .local/heavy-slots.txt, else three. Never fewer than one or more than eight.
 */
export function slotCount(env = {}, kept = '') {
  for (const text of [env.HEAVY_SLOTS, kept]) {
    const number = Number.parseInt(String(text ?? '').trim(), 10);
    if (Number.isFinite(number)) return Math.min(8, Math.max(1, number));
  }
  return 3;
}

/** Whether a program with this number is still running on this computer. */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Takes a free turn in `dir` and returns its file, or null when every turn is held. A turn
 * whose holder is no longer running, or that is older than `staleMs`, counts as free.
 */
export function claimTurn(
  dir,
  slots,
  info,
  { now = Date.now(), alive = isAlive, staleMs = 45 * 60000 } = {},
) {
  fs.mkdirSync(dir, { recursive: true });
  for (let number = 1; number <= slots; number += 1) {
    const file = path.join(dir, `turn-${number}.json`);
    let left = false;
    try {
      const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (alive(kept.pid) && now - kept.at < staleMs) continue;
      left = true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // It is there and cannot be read: another command is writing it this instant,
        // unless it has been like that for a while.
        let age = Number.POSITIVE_INFINITY;
        try {
          age = now - fs.statSync(file).mtimeMs;
        } catch {
          // Gone again.
        }
        if (age < 5000) continue;
        left = true;
      }
    }
    if (left) fs.rmSync(file, { force: true });
    try {
      fs.writeFileSync(file, JSON.stringify({ ...info, at: now }), { flag: 'wx' });
      return file;
    } catch {
      // Another command took this turn between the look and the write.
    }
  }
  return null;
}

/** Who holds the turns in `dir` now: one line each. */
export function turnLines(dir, { now = Date.now(), alive = isAlive } = {}) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => /^turn-\d+\.json$/.test(name));
  } catch {
    return [];
  }
  const lines = [];
  for (const name of names.sort()) {
    try {
      const kept = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      const minutes = Math.round((now - kept.at) / 60000);
      const gone = alive(kept.pid) ? '' : ' (its program has ended: the turn is free)';
      lines.push(`${name.replace('.json', '')}: ${kept.command ?? '?'}, for ${minutes} min${gone}`);
    } catch {
      // Being written, or just released.
    }
  }
  return lines;
}

/** One command line for the shell from the words after "--". */
export function commandLine(words, platform = process.platform) {
  const plain = /^[A-Za-z0-9_\-./:=@+,\\]+$/;
  return words
    .map((word) => {
      if (plain.test(word)) return word;
      return platform === 'win32'
        ? `"${word.replace(/"/g, '""')}"`
        : `'${word.replace(/'/g, `'\\''`)}'`;
    })
    .join(' ');
}
