// What a job may hold (T-131: identifiers, never content). The jobs table refuses the
// same things (0006: jobs_type_known, jobs_ids_only, jobs_dedupe_key_ids_only,
// jobs_last_error_known); checking here as well makes a mistake fail at once, in the
// command that made it, with a plain reason. A test in packages/database fails when
// the lists here and in the migration differ.

/**
 * Every job type there is: those of T7 §2. A new one is added here and, in the same
 * change, by a migration that replaces jobs_type_known.
 */
export const jobTypes = [
  'announcements.send',
  'bin.empty',
  'cache.clear',
  'chat.deliver',
  'email.send',
  'email.status',
  'exports.build',
  'games.unfinished',
  'imports.run',
  'notify.event',
  'recaps.plan',
  'recaps.send',
  'reminders.plan',
  'reminders.send',
  'schedule.generate',
  'sessions.tidy',
  'standings.rebuild',
  'waitlist.expire',
] as const;

export type JobType = (typeof jobTypes)[number];

const knownTypes: ReadonlySet<string> = new Set(jobTypes);
const keyPattern = /^[a-z][A-Za-z0-9]{0,39}$/;
/** Keys that hold a date rather than a UUID: gameDay, startsOn, sendDate. */
const dateKeyPattern = /(Date|Day|On)$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A real calendar date written YYYY-MM-DD (not 2026-02-30). */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    year >= 1 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** The most ids one job carries, and the most parts in a dedupe key. */
export const maxJobIds = 10;
/** The longest a job may wait before it runs: 30 days. */
export const maxJobDelaySeconds = 30 * 24 * 60 * 60;

/**
 * Why `job` may not be recorded, as a fixed sentence that repeats none of its
 * values, or null when it may. Its league is checked by defineCommand.
 */
export function jobProblem(job: {
  readonly type: string;
  readonly ids: Readonly<Record<string, string>>;
  readonly delaySeconds?: number;
  readonly dedupeKey?: string;
}): string | null {
  if (typeof job.type !== 'string' || !knownTypes.has(job.type)) {
    return 'its type is not one of the job types (jobTypes)';
  }
  const ids: unknown = job.ids;
  if (typeof ids !== 'object' || ids === null || Array.isArray(ids)) {
    return 'its ids are not an object';
  }
  const entries = Object.entries(ids);
  if (entries.length > maxJobIds) return `it carries more than ${maxJobIds} ids`;
  for (const [key, value] of entries) {
    if (!keyPattern.test(key)) return 'an id is not under a camelCase name';
    if (typeof value !== 'string') return 'an id is not text';
    if (dateKeyPattern.test(key)) {
      if (!isIsoDate(value)) return 'a date-named id is not a real YYYY-MM-DD date (T-131)';
    } else if (!uuidPattern.test(value)) {
      return 'it carries something other than a lower-case UUID (T-131)';
    }
  }
  const { delaySeconds, dedupeKey } = job;
  if (
    delaySeconds !== undefined &&
    (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > maxJobDelaySeconds)
  ) {
    return 'its delay is not a whole number of seconds from 0 to 30 days';
  }
  if (dedupeKey !== undefined) {
    const parts = typeof dedupeKey === 'string' ? dedupeKey.split(':') : [];
    if (
      parts.length < 1 ||
      parts.length > maxJobIds ||
      !parts.every((part) => uuidPattern.test(part) || isIsoDate(part))
    ) {
      return 'its dedupe key is not ids (UUIDs or dates) joined by ":"';
    }
  }
  return null;
}
