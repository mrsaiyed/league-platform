// Who is really working this minute, for the build progress page.
//
// The Claude app keeps, on this computer, two small files for each helper a lead starts:
// one says what the helper was asked to do, on which model, and whether it has finished;
// the other grows each time the helper does anything. Reading the first and the time of
// the second costs nothing and involves no AI. Nothing a helper wrote is ever read here:
// only its short description, its model and when it last moved.
//
// When the files are not there (another tool is leading the build, or this is another
// computer) the answer says so with `known: false`, and the page falls back to showing
// the work that is open.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const liveLimits = {
  // A helper counts as working when its file changed this recently. A long test run can
  // keep a helper silent for a couple of minutes, so this is generous.
  activeSeconds: 180,
  // An unfinished helper that has been silent this long was cut off: it is not listed.
  silentMinutes: 60,
  // A helper that finished stays listed this long, as "just finished".
  finishedMinutes: 8,
  // A session whose own record has not changed for this long has no helper at work.
  sessionHours: 12,
  // A reader that is asked again and again looks for new sessions only this often.
  relistSeconds: 60,
};

/** The folder where the Claude app keeps the sessions of the project at `mainRoot`. */
export function sessionsFolder(mainRoot, env = process.env) {
  const base = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects', path.resolve(mainRoot).replace(/[^A-Za-z0-9]/g, '-'));
}

/** What kind of work a helper does, from the few words the lead described it with. */
export function roleOf(description) {
  if (/review|second look/i.test(description)) return 'review';
  if (/design/i.test(description)) return 'design';
  if (/audit/i.test(description)) return 'audit';
  if (/\b(build|fix|merge|finish)/i.test(description)) return 'build';
  return 'help';
}

const changedAt = (file) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};
const startedAt = (file) => {
  try {
    return fs.statSync(file).birthtimeMs;
  } catch {
    return 0;
  }
};
// A helper's brief names its lane folder (".local/lanes/2.35-scoring-screen") near the top.
const stepInBrief = (file) => {
  try {
    const handle = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(8192);
    const length = fs.readSync(handle, buffer, 0, buffer.length, 0);
    fs.closeSync(handle);
    return buffer.toString('utf8', 0, length).match(/lanes[\\/]+(\d+\.\d+)/)?.[1] ?? '';
  } catch {
    return '';
  }
};
const iso = (ms) => (ms ? new Date(ms).toISOString() : '');

/**
 * The sessions that could have a helper at work: those that have started helpers and whose
 * own record changed lately. Null when the folder is not there.
 */
function recentSessions(folder, now) {
  let entries;
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return null;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      const moved = changedAt(path.join(folder, `${name}.jsonl`));
      return (
        moved &&
        now - moved < liveLimits.sessionHours * 3600000 &&
        fs.existsSync(path.join(folder, name, 'subagents'))
      );
    });
}

/**
 * The helpers that are working or have just finished, and when their lead last moved.
 * `folder` is what sessionsFolder() gives; `now` is a time in milliseconds; `sessions` is
 * the list recentSessions() gave, when the caller keeps one.
 */
export function readLive(folder, now = Date.now(), sessions = recentSessions(folder, now)) {
  const out = { known: false, at: iso(now), lead: null, helpers: [] };
  if (!sessions) return out;
  out.known = true;
  let leadSession = '';
  let newest = 0;
  for (const session of sessions) {
    const folderOfHelpers = path.join(folder, session, 'subagents');
    let names;
    try {
      names = fs.readdirSync(folderOfHelpers);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.meta.json')) continue;
      const record = path.join(folderOfHelpers, name.replace(/\.meta\.json$/, '.jsonl'));
      const seen = changedAt(record);
      const silent = (now - seen) / 60000;
      if (!seen || silent > liveLimits.silentMinutes) continue;
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(path.join(folderOfHelpers, name), 'utf8'));
      } catch {
        continue;
      }
      // The lead is whoever started the helper that moved most recently.
      if (seen > newest) {
        newest = seen;
        leadSession = session;
      }
      const finished = meta.finished === true;
      if (finished && silent > liveLimits.finishedMinutes) continue;
      const what = String(meta.description ?? '').slice(0, 120);
      out.helpers.push({
        id: name.replace(/^agent-|\.meta\.json$/g, '').slice(-8),
        step: what.match(/\b(\d+\.\d+)\b/)?.[1] ?? stepInBrief(record),
        what,
        role: roleOf(what),
        model: String(meta.model ?? ''),
        effort: String(meta.effort ?? ''),
        startedAt: iso(startedAt(record)),
        seenAt: iso(seen),
        finished,
        active: !finished && now - seen < liveLimits.activeSeconds * 1000,
      });
    }
  }
  out.helpers.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      Number(a.finished) - Number(b.finished) ||
      b.seenAt.localeCompare(a.seenAt),
  );
  if (leadSession) {
    const seen = changedAt(path.join(folder, `${leadSession}.jsonl`));
    if (seen) {
      out.lead = { seenAt: iso(seen), active: now - seen < liveLimits.activeSeconds * 1000 };
    }
  }
  return out;
}

/**
 * For a program that asks every few seconds (the progress page's server): the same answer
 * as readLive(), looking for new sessions only once a minute, which is the slow part.
 */
export function liveReader(folder) {
  let listedAt = 0;
  let sessions = null;
  return (now = Date.now()) => {
    if (!sessions || now - listedAt > liveLimits.relistSeconds * 1000) {
      sessions = recentSessions(folder, now);
      listedAt = now;
    }
    return readLive(folder, now, sessions);
  };
}

/**
 * Changes whenever the status file or a stage plan is saved. The open page reloads itself
 * when this changes, and otherwise only asks who is working.
 */
export function planStamp(buildDir) {
  let names = [];
  try {
    names = fs.readdirSync(buildDir);
  } catch {
    return '';
  }
  return names
    .filter((name) => name === 'STATUS.md' || /^STAGE-\d+\.md$/.test(name))
    .sort()
    .map((name) => Math.round(changedAt(path.join(buildDir, name))))
    .join('-');
}
