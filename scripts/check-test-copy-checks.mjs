// The test copy check (step 2.207): which address it takes, and the checks themselves.
// scripts/check-test-copy.mjs is the thin command around these two.
//
// `settingsFor` decides, before anything is asked, whether the run may go ahead: one
// address, https, or plain http only to this computer (localhost, 127.0.0.1), with nothing
// after it. It reads no environment and takes no key: there is none to take.
//
// `runChecks` reads the copy and prints one line for each check, passed or FAILED with
// what was seen. It only reads: GET requests, and the "be this person" form posted for a
// person no copy has (so even a copy whose gate were broken would sign nobody in), once to
// /signin/made-up-people and once to /signin/no-such-page. Every request has a time limit
// and follows no redirect to another host.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { leagueUrl, platformUrl } from '@srleagues/core';
import { en } from '@srleagues/site';
import * as words from './check-test-copy.messages.mjs';

/** How long each answer may take. */
export const answerMs = 10_000;
/** The page mark the root layout writes outside production (do-not-index.ts, record 082). */
export const doNotIndexMark = '<meta name="robots" content="noindex, nofollow"/>';
/** The test-copy line (step 2.205), as every page of the test copy that has it says it. */
export const testCopyLine = en['footer.testCopy'];
/** The made-up league read by default: a short name no copy has. */
export const defaultLeague = 'made-up-league-for-the-check';
/** The made-up person the "be this person" form is posted for: one no copy has. */
export const nobodyPerson = 'no-such-made-up-person';
/** The address that does not exist, which the local-only pages must answer exactly as. */
export const unknownPage = `${platformUrl('signin')}/no-such-page`;

const thisComputer = new Set(['localhost', '127.0.0.1']);

/** The address's origin when it is one the check takes; undefined otherwise. */
export function originOf(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  const local = thisComputer.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return undefined;
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    return undefined;
  }
  if (url.pathname !== '/' || /[?#]/.test(text)) return undefined;
  return url.origin;
}

/** The "be this person" action's id in a server-reference-manifest.json's text, if any. */
export function actionIdIn(manifestText) {
  const manifest = JSON.parse(manifestText);
  for (const side of ['node', 'edge']) {
    for (const [id, entry] of Object.entries(manifest?.[side] ?? {})) {
      if (entry?.exportedName === 'beMadeUpPersonAction') return id;
    }
  }
  return undefined;
}

const actionIdForm = (id) => /^[0-9a-f]{2,128}$/i.test(id);

/**
 * Whether the run may go ahead: `{ settings }`, or `{ problems, exitCode }` with the lines
 * to print. Reads no environment and asks nothing; with --manifest it reads that one file.
 */
export function settingsFor({ argv, readFile = (file) => readFileSync(file, 'utf8') }) {
  let values;
  let positionals;
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'action-id': { type: 'string' },
        manifest: { type: 'string' },
        'without-action': { type: 'boolean' },
        league: { type: 'string' },
        help: { type: 'boolean' },
      },
      strict: true,
    }));
  } catch {
    return { problems: words.usage, exitCode: 2 };
  }
  if (values.help) return { problems: words.usage, exitCode: 0 };
  if (positionals.length !== 1) return { problems: [words.addressMissing], exitCode: 2 };
  const origin = originOf(positionals[0]);
  if (origin === undefined) return { problems: [words.addressForm], exitCode: 2 };

  const league = values.league ?? defaultLeague;
  let leagueAddress;
  try {
    leagueAddress = leagueUrl({ slug: league }, 'home');
  } catch {
    return { problems: [words.leagueForm], exitCode: 2 };
  }

  if (values['action-id'] !== undefined && values.manifest !== undefined) {
    return { problems: [words.bothGiven], exitCode: 2 };
  }
  const withoutAction = values['without-action'] === true;
  if (withoutAction && (values['action-id'] !== undefined || values.manifest !== undefined)) {
    return { problems: [words.withoutActionAndId], exitCode: 2 };
  }
  let actionId = values['action-id'];
  if (actionId !== undefined && !actionIdForm(actionId)) {
    return { problems: [words.actionIdForm], exitCode: 2 };
  }
  if (values.manifest !== undefined) {
    try {
      actionId = actionIdIn(readFile(values.manifest));
    } catch {
      actionId = undefined;
    }
    if (actionId === undefined || !actionIdForm(actionId)) {
      return { problems: [words.manifestUnread], exitCode: 2 };
    }
  }
  return { settings: { origin, actionId, leagueAddress, withoutAction } };
}

/** A request that could not be made or read: `seen` says why, in fixed words. */
class Unanswered extends Error {
  constructor(seen) {
    super('unanswered');
    this.seen = seen;
  }
}

/** The exit code: 0 only when no check failed (a line not checked by choice is no failure). */
export const exitCodeFor = ({ failed }) => (failed.length === 0 ? 0 : 1);

/**
 * Runs every check and prints its line, then the result. Returns `{ total, failed,
 * notChecked }`, the labels of the checks that failed and of those not checked.
 *
 * - `origin`, `actionId`, `leagueAddress`, `withoutAction`: from settingsFor. With
 *   `withoutAction`, the "be this person" line is NOT CHECKED, with its reason, and is no
 *   failure (T-302); without it and without an id, that line fails.
 * - `fetch`: the fetch to ask with (globalThis.fetch).
 * - `print`: prints one line.
 * - `timeoutMs`: how long each answer may take (answerMs; tests pass less).
 */
export async function runChecks({
  origin,
  actionId,
  leagueAddress,
  withoutAction = false,
  fetch,
  print,
  timeoutMs = answerMs,
}) {
  /** One answer, its body read; a redirect is followed only on the same host, 5 at most. */
  const ask = async (address, { method = 'GET', body, follow = false } = {}) => {
    let url = new URL(address, origin);
    for (let hops = 0; ; hops += 1) {
      let response;
      let text;
      try {
        const signal = AbortSignal.timeout(timeoutMs);
        response = await fetch(url, {
          method,
          redirect: 'manual',
          signal,
          ...(body === undefined ? {} : { body: body(), headers: { Origin: origin } }),
        });
        text = await response.text();
      } catch (error) {
        const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        throw new Unanswered(timedOut ? words.noAnswerInTime : words.noConnection);
      }
      const location = response.headers.get('location');
      if (!follow || response.status < 300 || response.status >= 400 || location === null) {
        return { status: response.status, headers: response.headers, text };
      }
      const next = new URL(location, url);
      if (next.origin !== origin) throw new Unanswered(words.otherHost);
      if (hops >= 5) throw new Unanswered(words.tooManyRedirects);
      url = next;
    }
  };

  const results = [];
  const check = async (label, run) => {
    let seen;
    let ok = false;
    let skipped = false;
    try {
      ({ ok, seen, skipped = false } = await run());
    } catch (error) {
      seen = error instanceof Unanswered ? error.seen : words.notReadable;
    }
    results.push({ label, ok, skipped });
    print(words.line(skipped ? words.notChecked : ok ? words.passed : words.failed, label, seen));
  };

  print(words.title);
  print(words.where(origin));
  for (const text of words.aboutTheRun) print(text);
  print('');

  await check(words.checks.health, async () => {
    const answer = await ask('/api/v1/health');
    let database;
    try {
      const value = JSON.parse(answer.text)?.checks?.database;
      database = typeof value === 'string' && /^[a-z]{1,20}$/.test(value) ? value : undefined;
    } catch {
      database = undefined;
    }
    return {
      ok: answer.status === 200 && database === 'ok',
      seen: words.healthSeen(answer.status, database),
    };
  });

  // The pages read for "do not index"; the front page and the sign-in page also carry the
  // test-copy line, checked below from the same answers.
  const pages = {};
  for (const [key, address] of [
    ['frontPage', platformUrl('home')],
    ['signIn', platformUrl('signin')],
    ['league', leagueAddress],
    ['missing', unknownPage],
  ]) {
    await check(words.checks[key], async () => {
      const answer = await ask(address, { follow: true });
      pages[key] = answer;
      const header = shortHeader(answer.headers.get('x-robots-tag'));
      const mark = answer.text.includes(doNotIndexMark);
      return { ok: saysNoindex(header) && mark, seen: words.pageSeen(answer.status, header, mark) };
    });
  }

  await check(words.checks.robots, async () => {
    const answer = await ask('/robots.txt', { follow: true });
    const header = shortHeader(answer.headers.get('x-robots-tag'));
    const keepsOut = answer.status === 200 && keepsEveryRobotOut(answer.text);
    return {
      ok: keepsOut && saysNoindex(header),
      seen: words.robotsSeen(answer.status, keepsOut, header),
    };
  });

  const same = async (address, init = {}) => {
    const one = await ask(address, init);
    const other = await ask(unknownPage, init);
    return sameAnswer(
      { ...one, name: lastName(address) },
      { ...other, name: lastName(unknownPage) },
    );
  };
  await check(words.checks.keptEmails, () => same(platformUrl('keptEmails')));
  await check(words.checks.madeUpPeople, () => same(platformUrl('madeUpPeople')));
  await check(words.checks.beThisPerson, async () => {
    if (withoutAction) return { ok: false, skipped: true, seen: words.withoutActionReason };
    if (actionId === undefined) return { ok: false, seen: words.noActionId };
    // As the page's own form posts it with no script (tests/browser/test-copy-test.mjs).
    const body = () => {
      const form = new FormData();
      form.set(`$ACTION_ID_${actionId}`, '');
      form.set('person', nobodyPerson);
      form.set('next', '/');
      return form;
    };
    return same(platformUrl('madeUpPeople'), { method: 'POST', body });
  });

  await check(words.checks.testCopyLine, async () => {
    const missing = ['frontPage', 'signIn']
      .filter((key) => !(pages[key]?.text ?? '').includes(testCopyLine))
      .map((key) => words.pageNames[key]);
    return {
      ok: missing.length === 0,
      seen: missing.length === 0 ? undefined : words.lineSeen(missing),
    };
  });

  const failed = results.filter((r) => !r.ok && !r.skipped).map((r) => r.label);
  const notChecked = results.filter((r) => r.skipped).map((r) => r.label);
  print('');
  if (failed.length === 0 && notChecked.length === 0) print(words.allPassed(results.length));
  else if (failed.length === 0) print(words.passedBut(results.length - notChecked.length));
  else {
    print(words.someFailed(failed.length, results.length));
    for (const label of failed) print(words.failedItem(label));
  }
  if (notChecked.length > 0) {
    print(words.notCheckedSummary(notChecked.length));
    for (const label of notChecked) print(words.notCheckedItem(label));
  }
  return { total: results.length, failed, notChecked };
}

/** A header's value when short and plain, to be repeated; anything else as "(other)". */
const shortHeader = (value) =>
  value === null ? null : /^[\w ,:-]{1,60}$/.test(value) ? value : '(other)';
const saysNoindex = (header) =>
  header !== null && header.split(',').some((part) => part.trim().toLowerCase() === 'noindex');
const keepsEveryRobotOut = (text) =>
  /^User-agent:\s*\*\s*$/im.test(text) && /^Disallow:\s*\/\s*$/im.test(text);
const lastName = (address) => address.split('/').at(-1);

/**
 * Whether two answers are the same: the status, and the body byte for byte once the few
 * parts the product makes differ on every request, or by the address itself, are put in
 * one place. That list, as short as the product forces (as tests/browser/test-copy-test.mjs
 * found it):
 * 1. the page's one-time script nonce (step 2.98), new for every answer: read from the
 *    answer's own Content-Security-Policy and put as <nonce>;
 * 2. the address's own last name (kept-emails, made-up-people, no-such-page), which the
 *    page's data repeats as the route's value: put as <name>;
 * 3. the order of the page's streamed data pieces (`self.__next_f.push`), which follows the
 *    server's timing: the pieces are taken out and their rows compared in order.
 * Headers are not compared: a host's own proxies add ones of their own to every request
 * (an id, a time), and the one header that matters is checked on its own line above.
 */
export function sameAnswer(one, other) {
  if (one.status !== other.status) {
    return { ok: false, seen: words.statusDiffers(one.status, other.status) };
  }
  const a = settled(one);
  const b = settled(other);
  if (a !== b) {
    let at = 0;
    while (at < a.length && a[at] === b[at]) at += 1;
    return { ok: false, seen: words.bodyDiffers(at, a.length, b.length) };
  }
  return { ok: true, seen: words.sameSeen(one.status) };
}

function settled({ text, headers, name }) {
  const policy = headers.get('content-security-policy') ?? '';
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  let body = nonce === undefined ? text : text.replaceAll(nonce, '<nonce>');
  body = body.replaceAll(name, '<name>');
  const pieces = [];
  const markup = body.replace(
    /<script>self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g,
    (_, piece) => {
      pieces.push(JSON.parse(piece));
      return '';
    },
  );
  const rows = pieces.join('').split('\n').filter(Boolean).sort().join('\n');
  return `${markup}\n${rows}`;
}
