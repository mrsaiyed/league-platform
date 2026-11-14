// How the grid says what just happened. The address carries only fixed words
// (`?done=saved`, `?problem=changed-since-read`); the words themselves are looked up
// here, so nothing a visitor types into an address can become text on the page.
import { t } from '../../server/messages.ts';

type Search = Readonly<Record<string, string | readonly string[] | undefined>>;

const first = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : value?.[0];

export type Notice = { readonly kind: 'done' | 'problem'; readonly text: string };

const done = {
  saved: () => t('schedule.admin.saved'),
  published: () => t('schedule.admin.published'),
  discarded: () => t('schedule.admin.discarded'),
} as const;

const problems = {
  'not-allowed': () => t('schedule.admin.error.not-allowed'),
  'invalid-input': () => t('schedule.admin.error.invalid-input'),
  'changed-since-read': () => t('schedule.admin.error.changed-since-read'),
  'revision-out-of-date': () => t('schedule.admin.error.revision-out-of-date'),
  'season-not-found': () => t('schedule.admin.error.season-not-found'),
  'draft-unreadable': () => t('schedule.admin.error.draft-unreadable'),
  'draft-too-large': () => t('schedule.admin.error.draft-too-large'),
  'unknown-team': () => t('schedule.admin.error.unknown-team'),
  'unknown-venue': () => t('schedule.admin.error.unknown-venue'),
  'unknown-court': () => t('schedule.admin.error.unknown-court'),
  'draft-not-found': () => t('schedule.admin.error.draft-not-found'),
  'round-cannot-be-updated': () => t('schedule.admin.error.round-cannot-be-updated'),
  'change-refused': () => t('schedule.admin.error.change-refused'),
  'game-already-started': () => t('schedule.admin.error.game-already-started'),
  'game-cannot-be-removed': () => t('schedule.admin.error.game-cannot-be-removed'),
  'game-id-taken': () => t('schedule.admin.error.game-id-taken'),
  'game-without-time': () => t('schedule.admin.error.game-without-time'),
  'change-no-longer-fits': () => t('schedule.admin.error.change-no-longer-fits'),
  'nothing-to-publish': () => t('schedule.admin.error.nothing-to-publish'),
} as const;

const reasons = {
  'unknown-game': () => t('schedule.admin.refused.unknown-game'),
  'unknown-round': () => t('schedule.admin.refused.unknown-round'),
  'game-exists': () => t('schedule.admin.refused.game-exists'),
  'team-plays-itself': () => t('schedule.admin.refused.team-plays-itself'),
  'swap-with-itself': () => t('schedule.admin.refused.swap-with-itself'),
  'empty-round-label': () => t('schedule.admin.refused.empty-round-label'),
  'invalid-date': () => t('schedule.admin.refused.invalid-date'),
  'invalid-time': () => t('schedule.admin.refused.invalid-time'),
} as const;

const blockers = {
  'nothing-to-publish': () => t('schedule.admin.blocker.nothing-to-publish'),
  'revision-out-of-date': () => t('schedule.admin.blocker.revision-out-of-date'),
  'change-no-longer-fits': () => t('schedule.admin.blocker.change-no-longer-fits'),
  'game-already-started': () => t('schedule.admin.blocker.game-already-started'),
  'game-cannot-be-removed': () => t('schedule.admin.blocker.game-cannot-be-removed'),
  'game-id-taken': () => t('schedule.admin.blocker.game-id-taken'),
  'game-without-time': () => t('schedule.admin.blocker.game-without-time'),
  'unknown-team': () => t('schedule.admin.blocker.unknown-team'),
  'unknown-venue': () => t('schedule.admin.blocker.unknown-venue'),
  'unknown-court': () => t('schedule.admin.blocker.unknown-court'),
  'draft-unreadable': () => t('schedule.admin.blocker.draft-unreadable'),
} as const;

function pick<T extends Record<string, () => string>>(
  table: T,
  word: string | undefined,
): (() => string) | undefined {
  return word !== undefined && Object.hasOwn(table, word) ? table[word] : undefined;
}

/** The sentence the address asks for, or nothing when it asks for none we know. */
export function noticeOf(search: Search): Notice | undefined {
  const text = pick(done, first(search['done']));
  if (text !== undefined) return { kind: 'done', text: text() };
  const blocker = pick(blockers, first(search['blocker']));
  if (blocker !== undefined) return { kind: 'problem', text: blocker() };
  const problem = pick(problems, first(search['problem']));
  if (problem === undefined) return undefined;
  const reason = pick(reasons, first(search['reason']));
  const why = reason === undefined ? problem() : `${problem()} ${reason()}`;
  const key =
    first(search['partial']) === '1' ? 'schedule.admin.problemPartial' : 'schedule.admin.problem';
  return { kind: 'problem', text: t(key, { reason: why }) };
}
