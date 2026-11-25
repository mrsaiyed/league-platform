// What a browser test of the web app needs, shared: starting the built app on its made-up
// stand-in (APP_ENV=test) with made-up settings, a free port, waiting for it to answer, the
// browser to use, and the hand-written accessibility checks (T-186), the exit test's among
// them. Nothing leaves this computer. Its first steps are the same as those
// tests/browser/web-exit-test.mjs starts with, kept here for the newer tests.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLoopback } from '../../scripts/web-listen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const app = path.join(root, 'apps/web');
const nextBin = createRequire(path.join(app, 'package.json')).resolve('next/dist/bin/next');
const madeUp = {
  LOG_LEVEL: 'warn',
  EMAIL_FROM: 'hello@example.test',
  // The made-up address the Terms and Privacy pages give (step 2.135).
  CONTACT_EMAIL: 'contact@example.test',
};

/** On GitHub the Chromium ci.yml installs; here the Edge Windows already has. */
export const launch = () =>
  process.env.CI ? chromium.launch() : chromium.launch({ channel: 'msedge' });

/** Runs Next.js in the web app with the made-up settings; its output is kept for errors. */
export function startNext(args, env) {
  let output = '';
  // On the made-up stand-in, on this computer's loopback address only (web-listen.mjs).
  const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...madeUp, ...env };
  const child = spawn(process.execPath, [nextBin, ...withLoopback(args, environment)], {
    cwd: app,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (c) => (output += c));
  child.stderr.on('data', (c) => (output += c));
  sayOnFailure(`next ${args[0]}`, child, () => output);
  return { child, output: () => output };
}

/**
 * When the test ends in failure, prints the last 30 lines a Next.js run printed, unless that
 * run finished well: so a build's or a server's own error is in the test's output, where
 * the gate's notes on GitHub find it (step 2.178). Prints nothing when the test passes.
 */
export function sayOnFailure(label, child, output) {
  process.on('exit', (code) => {
    if (code === 0 || child.exitCode === 0) return;
    const lines = output()
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== '')
      .slice(-30);
    const how =
      child.exitCode !== null
        ? `it ended with code ${child.exitCode}`
        : child.killed
          ? 'the test had stopped it'
          : 'it was still running';
    const shown =
      lines.length > 0 ? lines.map((line) => `  | ${line}`).join('\n') : '  | (nothing)';
    process.stderr.write(
      `The last ${lines.length} lines \`${label}\` printed (${how}):\n${shown}\n`,
    );
  });
}

/**
 * A thrown error in one line, for a test's list of failed checks: its first line and, for
 * a Playwright wait that ran out, what it was waiting for (the first "waiting for" line of
 * its call log), so a timeout names the thing that never came (step 2.178).
 */
export function whatWentWrong(error) {
  const lines = String(error?.message ?? error)
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split('\n');
  const waiting = lines
    .find((line) => /^\s*-\s*waiting for /.test(line))
    ?.trim()
    .slice(2);
  return waiting ? `${lines[0]} (${waiting})` : lines[0];
}

export {
  leagueDay,
  leagueDayWords,
  worldAtLeagueTime,
  worldAtNoon,
} from '../../scripts/league-clock.mjs';

/** The first made-up league's address in the tracker's own endpoints. */
const leagueApi = '/api/v1/leagues/01900000-0000-7000-8000-000000000001';

/** A made-up tracked player: team `team`'s player `n` (stand-in-world-seed.ts). */
export const trackedPlayer = (team, n) =>
  `01900000-0000-7000-8000-${(0x70 + team).toString(16).padStart(4, '0')}${n.toString(16).padStart(8, '0')}`;

/**
 * A scorekeeper's tablet scoring a game through the tracker's own endpoints (step 2.32),
 * as tests/browser and scripts/shots.mjs do: nothing typed in the browser. Returns a
 * function that sends inputs and throws if any is refused.
 */
export async function trackerTablet(origin, game, token, deviceId) {
  const post = async (at, body) => {
    const answer = await fetch(`${origin}${leagueApi}/games/${game}${at}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `srl_session=${token}`, origin },
      body: JSON.stringify(body),
    });
    const text = await answer.text();
    if (!answer.ok) throw new Error(`${at} answered ${answer.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  const { sessionId } = await post('/session', { type: 'open', deviceId });
  return async (...inputs) => {
    const reply = await post('/commands', {
      protocolVersion: 1,
      sessionId,
      commands: inputs.map((input) => ({ commandId: crypto.randomUUID(), at: Date.now(), input })),
    });
    const refused = reply.results.filter((r) => r.status !== 'accepted');
    if (refused.length > 0) throw new Error(`refused: ${JSON.stringify(refused)}`);
  };
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Waits until the server is ready for the test: `url` answers 200 and its whole page has
 * arrived, and then so does each of `firstPages`, the pages the test opens first ({ address,
 * cookie }, the address after the origin), each drawn once before the browser starts, so
 * the test's first taps never meet a page the server has not yet drawn (step 2.175: a first
 * page drawn cold on a busy computer took over the test's 30 seconds). A redirect is not
 * ready. All of it within the same 90 seconds as before.
 */
export async function waitFor(url, server, firstPages = []) {
  const until = Date.now() + 90_000;
  const origin = new URL(url).origin;
  const wanted = [{ address: new URL(url).pathname + new URL(url).search }, ...firstPages];
  let last = 'no answer';
  for (const { address, cookie } of wanted) {
    for (;;) {
      if (server.child.exitCode !== null)
        throw new Error(`the server stopped:\n${server.output()}`);
      if (Date.now() >= until)
        throw new Error(
          `the server was not ready within 90 seconds: ${address} answered ${last}:\n${server.output()}`,
        );
      try {
        // Each try has its own limit (10 seconds, never past the 90), so one request that
        // hangs is given up and tried again and the overall limit always holds.
        const response = await fetch(origin + address, {
          redirect: 'manual',
          headers: cookie ? { cookie } : {},
          signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, until - Date.now()))),
        });
        await response.text();
        last = String(response.status);
        if (response.status === 200) break;
      } catch (error) {
        last = String(error?.cause?.code ?? error?.message ?? error);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/** Builds the web app for tests; false if the build failed or took over 10 minutes. */
export async function buildNext() {
  const build = startNext(['build'], { APP_ENV: 'test' });
  const timer = setTimeout(() => build.child.kill(), 10 * 60_000);
  const code = await new Promise((r) => build.child.on('exit', r));
  clearTimeout(timer);
  return code === 0;
}

/**
 * The admin's own menu (step 2.103): at the side on a laptop, behind one menu button on a
 * phone. Opens it when its button is on the screen and the menu is shut, as a person would
 * before tapping one of the admin's areas, "View the site" or "Sign out".
 */
export async function openStaffMenu(page) {
  const menu = page.locator('.staff-bar .staff-menu');
  const button = menu.locator('> summary');
  if (!(await button.isVisible())) return;
  if ((await menu.getAttribute('open')) === null) await button.click();
}

/**
 * The box score grid on a phone shows one team at a time (step 2.103). Picks the team a
 * box of the grid belongs to, as a person would before typing in it; nothing to do where
 * both teams are on the screen (a laptop).
 */
export async function showSheetTeamOf(page, box) {
  const team = await box.evaluate(
    (el) => el.closest('[data-sheet-team]')?.getAttribute('data-sheet-team') ?? null,
  );
  const tabs = page.locator('.admin-sheet-tabs');
  if (team === null || (await tabs.count()) === 0 || !(await tabs.isVisible())) return;
  await tabs.locator('label').nth(Number(team)).click();
}

/**
 * What is wrong with the title in a page's raw HTML, as it arrived, before any script
 * runs: '' when the head holds a title with words in it (step 2.175). A title that comes
 * later, at the end of the body, is not one a person meets when the page is drawn.
 */
export function titleInHeadProblem(html) {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  if (!head) return 'the page has no head';
  const title = /<title\b[^>]*>([^<]*)<\/title>/i.exec(head[1]);
  if (title && title[1].trim()) return '';
  if (title) return 'the title in the head is empty';
  return /<title\b/i.test(html.slice(head.index + head[0].length))
    ? 'the title comes after the head, not in it'
    : 'the page has no title';
}

/**
 * Accessibility checks on the screen the page shows (T-186), used by every browser test
 * (the exit test too: one copy). axe is not a dependency, so these are the checks that
 * can be made from the page itself: language, title, one main landmark and one level-one
 * heading, names on every link, button and field, descriptions on images, no repeated
 * ids, and text contrast of at least 4.5 to 1 (3 to 1 for large text).
 *
 * They read the document once it has all arrived (its load event). A tap that a page's
 * scripts have not yet taken over (on a busy machine they can still be starting) is the
 * browser's own: it posts the form and loads a new document, whose refusal or heading
 * shows while the rest of it, its styles among it, is still arriving (step 2.175).
 *
 * After a form's step that the scripts did take over, the next page is drawn in place: no
 * new document, so its load event has long passed, and Next.js streams the page's title a
 * moment after the page itself. So they also give the title a few seconds to arrive; the
 * check below still fails if none comes.
 */
export async function accessibilityProblems(page) {
  await page.waitForLoadState('load');
  await page
    .waitForFunction(() => document.title.trim() !== '', null, { timeout: 5000 })
    .catch(() => {});
  return page.evaluate(() => {
    const problems = [];
    if (!document.documentElement.lang) problems.push('the page has no language');
    if (!document.title.trim()) problems.push('the page has no title');
    if (document.querySelectorAll('main, [role=main]').length !== 1)
      problems.push('the page does not have exactly one main area');
    if (document.querySelectorAll('h1').length !== 1)
      problems.push(`${document.querySelectorAll('h1').length} level-one headings, not 1`);
    const nameOf = (el) =>
      (
        el.getAttribute('aria-label') ||
        document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent ||
        el.labels?.[0]?.textContent ||
        el.textContent ||
        el.getAttribute('title') ||
        el.getAttribute('value') ||
        ''
      ).trim();
    for (const el of document.querySelectorAll('a[href], button, [role=button]'))
      if (!nameOf(el) && !el.querySelector('img[alt]:not([alt=""])'))
        problems.push(`a ${el.tagName.toLowerCase()} has no name`);
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea'))
      if (!nameOf(el)) problems.push(`a field "${el.getAttribute('name')}" has no label`);
    for (const el of document.querySelectorAll('img'))
      if (!el.hasAttribute('alt')) problems.push('an image has no alt text');
    const ids = new Map();
    for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    for (const [id, n] of ids) if (n > 1) problems.push(`the id "${id}" is used ${n} times`);
    const parse = (value) => {
      const m = /rgba?\(([^)]+)\)/.exec(value);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return { r, g, b, a };
    };
    const over = (top, under) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const backgroundOf = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c.a > 0) {
          layers.push(c);
          if (c.a === 1) break;
        }
      }
      return layers.reduceRight((under, top) => over(top, under), {
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      });
    };
    const light = ({ r, g, b }) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (!el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      seen.add(el);
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const bg = backgroundOf(el);
      const fg = over(parse(style.color) ?? { r: 0, g: 0, b: 0, a: 1 }, bg);
      const [hi, lo] = [light(fg), light(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5))
        problems.push(
          `low contrast ${ratio.toFixed(2)}:1 in "${node.textContent.trim().slice(0, 30)}"`,
        );
    }
    return problems;
  });
}

/**
 * Presses `button` of the League settings form in `section` (a selector of its
 * `section[data-setting=…]`) and waits, at most `timeout`, for that setting's own answer
 * (step 2.155 part 4): "Saved: …" beside it or the refusal in its form, never an answer
 * that stood there before the press. Scripts on (drawn again in place) or off (a page that
 * answers the post). Returns whether it was saved and the words. A refusal is a new line
 * with each answer (`ListForm`'s `data-answer`, a mark that changes with every answer), so
 * a second refusal in a row that reads as the first is still told from it.
 */
export async function settingAnswer(page, section, button, timeout = 10_000) {
  const before = 'data-answered-before';
  await page
    .locator(section)
    .first()
    .evaluate((element, mark) => {
      for (const old of element.querySelectorAll('[data-said], [data-problem]')) {
        old.setAttribute(mark, '');
      }
    }, before);
  await button.click({ timeout });
  const fresh = page
    .locator(
      `${section} [data-said="saved"]:not([${before}]), ${section} [data-problem="setting"]:not([${before}])`,
    )
    .first();
  await fresh.waitFor({ timeout });
  return {
    saved: (await fresh.getAttribute('data-said', { timeout })) === 'saved',
    text: (await fresh.innerText({ timeout })).trim(),
  };
}

/**
 * Presses a bin row's "Bring it back" and waits, `timeout` ms at most, for an answer of the
 * bin's (step 2.155 part 5) that was not there before the press: "Brought back: …" at the
 * top or a refusal beside the row, each `[data-bin-answer]`. Every answer standing before
 * the press is marked first, so only a new one counts; a wait past the limit throws.
 */
/** The words an admin answer once rode in, in the address (gone since step 2.155 part 6). */
const answerWords = ['done', 'problem', 'saved', 'clashes', 'entry', 'leftOn', 'number'];

/**
 * After a press: the page says `said` (a sentence or a pattern) in a status or an alert,
 * and the address holds no answer (step 2.155 part 6: an answer is a one-time notice kept
 * on the server). Throws, naming the address, when either is not so within the time.
 */
export async function answered(page, said, timeout = 10_000) {
  const words = [...new URL(page.url()).searchParams.keys()].filter((word) =>
    answerWords.includes(word),
  );
  if (words.length > 0) throw new Error(`the address holds an answer: ${page.url()}`);
  await page
    .locator('[role=status], [role=alert]')
    .filter({ hasText: said })
    .first()
    .waitFor({ timeout });
}

/** Whether the page says `said` nowhere in a status or an alert (after a reload, say). */
export async function saysNothingOf(page, said) {
  return (
    (await page.locator('[role=status], [role=alert]').filter({ hasText: said }).count()) === 0
  );
}

export async function binAnswer(page, button, timeout = 10_000) {
  const before = 'data-answered-before';
  await page.evaluate((mark) => {
    for (const old of document.querySelectorAll('[data-bin-answer]')) old.setAttribute(mark, '');
  }, before);
  await button.click({ timeout });
  const fresh = page.locator(`[data-bin-answer]:not([${before}])`).first();
  await fresh.waitFor({ timeout });
  return {
    said: await fresh.getAttribute('data-said', { timeout }),
    id: await fresh.getAttribute('data-bin-answer', { timeout }),
    text: (await fresh.innerText({ timeout })).trim(),
  };
}
