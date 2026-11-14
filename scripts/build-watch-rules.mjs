// Signs that the build has stopped moving forward, so that nobody has to come and look.
// Pure rules: scripts/build-dashboard.mjs gathers the facts and prints what these return,
// to the lead after every landing and to the hourly overseer (`--watch`).
// Tests: tests/build-watch.test.mjs.

const stageOf = (id) => Number(String(id).split('.')[0]);
const minutesBetween = (from, to) => Math.floor((Date.parse(to) - Date.parse(from)) / 60000);

/** "40 minutes", "2.5 hours": how long something has lasted, in plain words. */
export function span(minutes) {
  if (minutes < 90) return `${Math.max(0, minutes)} minutes`;
  return `${Math.round(minutes / 6) / 10} hours`;
}

export const limits = {
  /** A run is working if its lock is younger than this (the scheduled check's own rule). */
  lockMinutes: 40,
  /** A working run that has landed nothing for this long is stuck. */
  landingMinutes: 120,
  /** A lane open for this long is not coming right by itself. */
  laneMinutes: 240,
  /** Landed work that `main` has not taken in for this long: the checks are red or unread. */
  mainMinutes: 120,
};

/**
 * @param facts.now ISO time.
 * @param facts.firstStage The earliest stage with an unfinished step.
 * @param facts.firstStageLeft Ids of that stage's unfinished steps that do not wait on the founder.
 * @param facts.duplicates Step numbers that are in a plan more than once.
 * @param facts.ready Steps that could start now and are in no lane: [{ id }].
 * @param facts.lanes Open lanes: [{ id, openedAt? }] (openedAt: ISO time the lane folder was made).
 * @param facts.lockTime ISO time in the build lock, or '' when there is none.
 * @param facts.lastLanding ISO time of the newest landing on the build branch, or ''.
 * @param facts.oldestOffMain ISO time of the oldest landed commit `main` does not have, or ''.
 * @returns [{ key, text }] One entry per sign. `key` stays the same while the sign lasts.
 */
export function stallSigns(facts) {
  const { now, firstStage, ready = [], lanes = [] } = facts;
  const signs = [];

  for (const id of facts.duplicates ?? []) {
    signs.push({
      key: `duplicate-${id}`,
      text:
        `STEP ${id} IS IN THE PLAN TWICE. Only one of the two can be followed, so the other is ` +
        'hidden and will never be offered. Give the newer one the next free number and correct ' +
        'every place that names it. Before adding a step, look for the highest number in the plan.',
    });
  }

  const starved = ready.filter((step) => stageOf(step.id) === firstStage).map((step) => step.id);
  const laterLanes = lanes.filter((lane) => stageOf(lane.id) > firstStage);
  if (starved.length && laterLanes.length) {
    const many = starved.length > 1;
    signs.push({
      key: `stage-${firstStage}-waits`,
      text:
        `STAGE ${firstStage} COMES FIRST: ${starved.join(', ')} can start and no lane has ` +
        `${many ? 'them' : 'it'}, while ${laterLanes.length} of the open lanes hold later-stage steps. ` +
        `The next lane that frees goes to ${many ? 'them' : 'it'}. A step that cannot be built as ` +
        'written is rewritten or split, with the reason in the log; it is never skipped.',
    });
  }

  // The earliest stage has steps left, none of them in a lane and none listed as able to
  // start. Nothing will ever open them: the plan's "Needs" lines hold each other up. (Stage 1
  // was written up as complete with two steps left, because one of them was never listed.)
  const left = facts.firstStageLeft ?? [];
  const building = lanes.some((lane) => stageOf(lane.id) === firstStage);
  if (left.length && !starved.length && !building) {
    const many = left.length > 1;
    signs.push({
      key: `stage-${firstStage}-knot`,
      text:
        `STAGE ${firstStage} IS NOT DONE AND NOTHING IS BUILDING IT: ${left.join(', ')} ` +
        `${many ? 'are' : 'is'} unticked in its plan, in no lane, and not listed as able to start. ` +
        `Read what ${many ? 'they need' : 'it needs'} in the plan against what has landed, correct ` +
        'the plan, and open the first in the next lane that frees. A stage is complete only when ' +
        'every step in its plan is ticked.',
    });
  }

  const runLive =
    Boolean(facts.lockTime) && minutesBetween(facts.lockTime, now) < limits.lockMinutes;
  if (runLive && facts.lastLanding) {
    const quiet = minutesBetween(facts.lastLanding, now);
    if (quiet >= limits.landingMinutes) {
      signs.push({
        key: 'nothing-landing',
        text:
          `NOTHING HAS LANDED FOR ${span(quiet).toUpperCase()} while a run is working. Find the ` +
          'lane nearest to done and finish it: read its check on GitHub, fix what failed, land it.',
      });
    }
  }

  for (const lane of lanes) {
    if (!lane.openedAt) continue;
    const age = minutesBetween(lane.openedAt, now);
    if (age >= limits.laneMinutes) {
      signs.push({
        key: `lane-${lane.id}`,
        text:
          `LANE ${lane.id} HAS BEEN OPEN ${span(age).toUpperCase()}. Take it over, or split the ` +
          'step and land the part that works (runbook, section 3, "When it goes wrong").',
      });
    }
  }

  if (facts.oldestOffMain) {
    const behind = minutesBetween(facts.oldestOffMain, now);
    if (behind >= limits.mainMinutes) {
      signs.push({
        key: 'main-behind',
        text:
          `main HAS NOT TAKEN IN WORK THAT LANDED ${span(behind).toUpperCase()} AGO. Run ` +
          "`node scripts/promote-to-main.mjs` and read its line; if GitHub's checks failed on the " +
          'build branch, fixing that comes before any landing.',
      });
    }
  }
  return signs;
}

/**
 * Remembers when each sign was first seen, so a line can say how long it has lasted.
 * @param seen { key: ISO time first seen } from the run before.
 * @returns { signs: [{ key, text, minutes }], seen: the record to keep for the next run }
 */
export function withAges(signs, seen, now) {
  const next = {};
  const aged = signs.map((sign) => {
    const since = seen?.[sign.key] ?? now;
    next[sign.key] = since;
    return { ...sign, minutes: Math.max(0, minutesBetween(since, now)) };
  });
  return { signs: aged, seen: next };
}

/** The orders the overseer has left for the lead: the lines of its file that begin "- ". */
export function openOrders(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ') && line.length > 2)
    .map((line) => line.slice(2));
}

/** What the progress script prints: orders first, then signs, each on its own line. */
export function watchLines(orders, signs) {
  const lines = [];
  for (const order of orders) lines.push(`>>> ORDER FROM THE OVERSEER: ${order}`);
  if (orders.length) {
    lines.push(
      '>>> Orders come before everything else. When one is done, delete its line from ' +
        '.local/overseer-orders.md and say so in the log.',
    );
  }
  for (const sign of signs) {
    lines.push(`>>> STALL (seen for ${span(sign.minutes)}): ${sign.text}`);
  }
  return lines;
}
