// Step 1.22: the stage 1 exit test in a real browser, against the web app on its
// made-up stand-in (APP_ENV=test), started as scripts/check-web-shell.mjs starts it.
// Nothing leaves this computer; every person, league and password is made up.
//
// What it covers: two leagues at two addresses with different looks; a made-up member
// signing in with an email and password, the browser closing, and the person still being
// signed in when a new browser opens with the cookies a real browser keeps (the session
// and renewal cookies must both last days); signing out everywhere, after which the old
// cookies replayed in a fresh browser are refused; accessibility checks on every screen
// it visits (T-186); and a person who is only a SCHEDULER of the first league (not its
// owner: the made-up scheduler has the narrowest admin role, so being refused in the
// second league shows more than being refused as an owner would not) being refused at
// every admin address and the scoring address of the second league. And the frame every
// league page has (step 2.85): the season picker in the header moves the page to another
// season and keeps the page's other choices, the header is one row high on a phone, and a
// page that is not there keeps the league's header and leads back to the league home, while
// a league that may not be seen gets the plain screen. And the header for the keyboard and
// with scripts off (2.85 review): the focus ring is measured against the header's bar on
// the league's name, a tab, the season picker, Sign in and the phone menu button, in both
// looks; an arrow key in a picker never reads the page again, and Enter or the Show
// button applies the choice; with scripts off at 320, 360 and 390 wide the league's name
// keeps its room and the season picker sits under it. Since step 2.147 the picker is in the
// menu's panel on a phone: it is put away with the menu, shown as the last thing in the
// open one (reached by the keyboard after the links and sign-in), and with scripts off the
// menu still opens and the picker's Show button still applies the season chosen.
// A part that throws (a wait that times out, a build that fails) is recorded by name and
// the other parts still run and print.
// Not covered: (1) the invitation email being captured and its link followed: the
// stand-in has no invitations (stand-in-ports.ts); (2) axe: it is not a dependency, so
// the accessibility checks are the hand-written ones below; (3) signing in as the made-up
// league people (they are given only by their cookie; only the made-up member signs in
// with a password); (4) renewing an access token that has run out: the stand-in cannot
// be made to expire one from outside, so only the renewal cookie's lasting is checked.
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
};
const member = { email: 'member@example.test', password: 'made-up member password' };
const noAccess = /you do not have access/i;

/** On GitHub the Chromium ci.yml installs; here the Edge Windows already has. */
const launch = () => (process.env.CI ? chromium.launch() : chromium.launch({ channel: 'msedge' }));

function start(args, env) {
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
  return { child, output: () => output };
}
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
async function waitFor(url, server) {
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    if (server.child.exitCode !== null) throw new Error(`the server stopped:\n${server.output()}`);
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`the server did not answer within 90 seconds:\n${server.output()}`);
}

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
/** Runs one part; a throw (a wait that timed out, say) is recorded under the part's name. */
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

let built = true;
if (!process.argv.includes('--no-build')) {
  built = false;
  await step('building the web app', async () => {
    const build = start(['build'], { APP_ENV: 'test' });
    const timer = setTimeout(() => build.child.kill(), 10 * 60_000);
    const code = await new Promise((r) => build.child.on('exit', r));
    clearTimeout(timer);
    if (code !== 0) throw new Error(`next build failed or took over 10 minutes`);
    built = true;
  });
}

/**
 * Accessibility checks on the screen the page shows (T-186). axe is not a dependency,
 * so these are the checks that can be made from the page itself: language, title, one
 * main landmark and one level-one heading, names on every link, button and field,
 * descriptions on images, no repeated ids, and text contrast of at least 4.5 to 1
 * (3 to 1 for large text).
 */
async function accessibilityProblems(page) {
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
    // Contrast.
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

let server;
let browser;
const origin = built ? `http://localhost:${await freePort()}` : '';
/** Opens `address` and waits until the page has drawn its main area. */
async function open(page, address) {
  const response = await page.goto(origin + address);
  await page.locator('main').first().waitFor();
  return response;
}
async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}
/**
 * Every game drawn as a board on the page, measured as it is drawn: whether its two teams
 * stand one over the other or side by side, and whether what is drawn agrees with that.
 * Side by side, the score or "VS" stands between the teams and no team carries a score of
 * its own; one over the other, each team's score is at the end of its own row and nothing
 * stands between the rows.
 */
async function measureBoards(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.ui-game-board')].map((board) => {
      const rect = (el) => el.getBoundingClientRect();
      const drawn = (r) => r.width > 1 && r.height > 1;
      const box = rect(board);
      const sides = [...board.querySelectorAll('.ui-game-side')];
      const [first, second] = sides.map(rect);
      const middle = rect(board.querySelector('.ui-game-middle > *'));
      const stacked = second.top >= first.bottom - 1;
      const own = sides.map((side) => side.querySelector('.ui-game-side-score')).filter(Boolean);
      const names = [...board.querySelectorAll('.ui-game-team-name')];
      // The lines a piece of a name's text is drawn on, each as a box.
      const linesOf = (node, from, to) => {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        return [...range.getClientRects()].filter((r) => r.width > 0);
      };
      // The words of a name that are drawn on more than one line: split inside the word.
      const split = names.flatMap((name) => {
        const node = name.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) return [];
        return [...node.textContent.matchAll(/\S+/g)]
          .filter((word) => {
            const tops = linesOf(node, word.index, word.index + word[0].length).map((r) =>
              Math.round(r.top),
            );
            return new Set(tops).size > 1;
          })
          .map((word) => word[0]);
      });
      // In two rows both names start at the same place, after their emblems, and every
      // line of a name that wraps starts there too (these pages are read left to right).
      const starts = names.map((name) => {
        const node = name.firstChild;
        const lines = node ? linesOf(node, 0, node.textContent.length) : [];
        return { box: rect(name).left, lines: lines.map((r) => r.left) };
      });
      return {
        stacked,
        split,
        fromTheStart:
          !stacked ||
          (starts.every((s) => s.lines.every((left) => Math.abs(left - s.box) <= 1)) &&
            Math.abs(starts[0].box - starts[1].box) <= 1 &&
            sides.every(
              (side) =>
                rect(side.querySelector('.ui-emblem')).right <=
                rect(side.querySelector('.ui-game-team-name')).left,
            )),
        // Side by side: the first team ends before what stands between them begins, and
        // that ends before the second team. One over the other: a team's emblem and name
        // end before its own score begins.
        apart: stacked
          ? sides.every((side) => {
              const score = side.querySelector('.ui-game-side-score');
              return (
                !score ||
                rect(side.querySelector('.ui-game-side-team')).right <= rect(score).left + 1
              );
            })
          : first.right <= middle.left + 1 && middle.right <= second.left + 1,
        inside: [first, second].every((r) => r.left >= box.left - 1 && r.right <= box.right + 1),
        // No name is cut off, and none takes more lines than two.
        whole: names.every((name) => name.scrollWidth <= name.clientWidth + 1),
        lines: Math.max(
          ...names.map((name) =>
            Math.round(rect(name).height / parseFloat(getComputedStyle(name).lineHeight)),
          ),
        ),
        drawnAsDecided: stacked
          ? !drawn(middle) && own.every((el) => drawn(rect(el)))
          : drawn(middle) && own.every((el) => !drawn(rect(el))),
      };
    }),
  );
}
/**
 * Puts long made-up names on the page's first two boards, as a league might have: a name
 * of 36 letters and one word of 16. A board is told the room its longer name needs, as
 * the page's own code works it out (packages/ui, nameMeasure): 22 and 16 letters.
 */
async function plantLongNames(page) {
  await page.evaluate(() => {
    const boards = [...document.querySelectorAll('.ui-game-board')];
    for (const [board, text, letters] of [
      [boards[0], 'The Northside Community Thunderbolts', '22'],
      [boards[1], 'Trailblazerettes', '16'],
    ]) {
      if (!board) continue;
      board.querySelector('.ui-game-team-name').textContent = text;
      board.style.setProperty('--letters', letters);
    }
  });
}
/**
 * The boards of a league's home page at the four widths, as they are and with long names
 * put in. However a board is drawn, nothing overlaps, no name is split inside a word, and
 * in two rows both names start after their emblems. A name as the league wrote it is also
 * whole; a made-up word too long for its row may be cut short with "…", never split.
 */
async function checkHomeBoards(page, address, label) {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const planted of [false, true]) {
      await page.goto(address);
      await page.locator('main').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (planted) await plantLongNames(page);
      const boards = await measureBoards(page);
      const sound = (b) =>
        b.apart &&
        b.inside &&
        b.drawnAsDecided &&
        b.fromTheStart &&
        b.split.length === 0 &&
        (planted || (b.whole && (b.stacked || b.lines <= 2)));
      note(
        `at ${width} every board of ${label}${planted ? ' with long names' : ''} is drawn one way or the other, and no name is split inside a word`,
        boards.length >= 3 && boards.every(sound),
        JSON.stringify(boards.filter((b) => !sound(b))),
      );
      if (planted && width === 320) {
        note(
          `at 320 the board of ${label} with a 36-letter name stands its teams in two rows`,
          boards[0]?.stacked === true,
        );
      }
      if (!planted && width === 1280) {
        note(
          `at 1280 the boards of ${label} have their teams side by side`,
          boards.filter((b) => !b.stacked).length >= 3,
          `${boards.filter((b) => !b.stacked).length} of ${boards.length}`,
        );
      }
    }
  }
}
const pathOf = (page) => new URL(page.url()).pathname;
const week = 7 * 24 * 3600;

if (built) {
  server = start(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

if (browser) {
  await step('two leagues, two looks', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const looks = {};
      for (const [league, name] of [
        ['north-valley', 'North Valley League'],
        ['harbor-city', 'Harbor City League'],
      ]) {
        await open(page, `/${league}`);
        note(
          `${league} shows its own name and the platform mark`,
          (await page.getByText(name).count()) > 0 &&
            (await page.getByText('Powered by SR Leagues').count()) > 0,
        );
        looks[league] = await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
        );
        await accessible(page, `/${league}`);
        for (const sub of ['standings', 'stats', 'schedule', 'teams']) {
          await open(page, `/${league}/${sub}`);
          await accessible(page, `/${league}/${sub}`);
        }
      }
      note(
        'the two leagues have different looks',
        looks['north-valley'] === '#96062d' && looks['harbor-city'] === '#1f5fbf',
        JSON.stringify(looks),
      );
    } finally {
      await context.close();
    }
  });

  // Step 2.147 (T-262, record 059): the faces of a league's design are served from our own
  // address and drawn on the page; nothing is asked of any other site.
  await step('the faces of a design come from our own address', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      const asked = [];
      page.on('request', (request) => asked.push(request.url()));
      for (const [league, faces] of [
        ['north-valley', ['Gelasio Variable', 'Source Sans 3 Variable']],
        ['harbor-city', ['Source Sans 3 Variable', 'Inter Variable']],
      ]) {
        asked.length = 0;
        await open(page, `/${league}`);
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const drawn = await page.evaluate(
          (names) =>
            names.map((name) => ({
              name,
              // The face the design names first for its titles or its text is the one in use.
              named: [
                getComputedStyle(document.querySelector('.ui-root')).fontFamily,
                getComputedStyle(document.querySelector('main h1')).fontFamily,
              ].some((list) => list.replace(/["']/g, '').startsWith(name)),
              loaded: [...document.fonts].some(
                (face) => face.family.replace(/["']/g, '') === name && face.status === 'loaded',
              ),
            })),
          faces,
        );
        note(
          `${league} draws the faces its design names, from files that arrived`,
          drawn.every((face) => face.named && face.loaded),
          JSON.stringify(drawn),
        );
        const fonts = asked.filter((url) => /\.(woff2?|ttf|otf)(\?|$)/.test(url));
        note(
          `${league} takes every font file from our own address`,
          fonts.length >= 2 && fonts.every((url) => url.startsWith(`${origin}/_next/static/`)),
          fonts.join(', '),
        );
        note(
          `${league} asks no other site for anything`,
          asked.every((url) => url.startsWith(origin) || url.startsWith('data:')),
          asked.filter((url) => !url.startsWith(origin)).join(', '),
        );
        const kept = fonts[0] === undefined ? undefined : await fetch(fonts[0]);
        note(
          `${league}'s font files may be kept by the browser for good`,
          kept?.status === 200 &&
            /immutable/.test(kept.headers.get('cache-control') ?? '') &&
            /^font\/woff2/.test(kept.headers.get('content-type') ?? ''),
          `${kept?.status} ${kept?.headers.get('cache-control')} ${kept?.headers.get('content-type')}`,
        );
      }
      // No rule holds up the page: every face may be swapped in after the text is drawn.
      const waits = await page.evaluate(() =>
        [...document.fonts].filter((face) => face.display !== 'swap').map((face) => face.family),
      );
      note('no face holds up the page (font-display: swap)', waits.length === 0, waits.join());
    } finally {
      await context.close();
    }
  });

  await step("the league's frame: season picker, phone header, not found", async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await open(page, '/north-valley/schedule?team=owls');
      const header = await page.locator('.site-header').boundingBox();
      note(
        'the header is one row high on a phone',
        (header?.height ?? 999) <= 60,
        `${header?.height}`,
      );
      const picker = page.locator('.site-header select[name=season]');
      note('the season picker is in the header', (await picker.count()) === 1);
      note(
        'no page repeats the season picker',
        (await page.locator('select[name=season]').count()) === 1,
      );
      // On a phone the picker is in the menu's panel (step 2.147): put away until the menu
      // is opened, and then the last thing in it, under the menu's links and sign-in.
      note('on a phone the season picker is put away with the menu', !(await picker.isVisible()));
      const menuButton = page.locator('.site-header .site-menu > summary');
      await menuButton.click();
      await picker.waitFor({ state: 'visible' });
      const [nameBox, panelBox, pickerBox] = await Promise.all([
        page.locator('.site-header .site-name').boundingBox(),
        page.locator('.site-header .site-menu-panel').boundingBox(),
        picker.boundingBox(),
      ]);
      note(
        'the open menu holds the season picker under its links, under the name',
        nameBox !== null &&
          panelBox !== null &&
          pickerBox !== null &&
          panelBox.y >= nameBox.y + nameBox.height - 1 &&
          pickerBox.y >= panelBox.y + panelBox.height - 1 &&
          pickerBox.x + pickerBox.width <= 390 &&
          pickerBox.height >= 44,
        JSON.stringify({ nameBox, panelBox, pickerBox }),
      );
      // The keyboard goes through the open menu as the eye does: the button, the links,
      // sign-in, then the picker.
      await menuButton.focus();
      const stops = [];
      for (let i = 0; i < 12 && stops.at(-1) !== 'season'; i++) {
        await page.keyboard.press('Tab');
        stops.push(
          await page.evaluate(() => {
            const el = document.activeElement;
            if (el?.matches('select[name=season]')) return 'season';
            if (el?.matches('.site-menu-sign-in')) return 'sign-in';
            return el?.closest('.site-menu-panel') ? 'link' : 'other';
          }),
        );
      }
      note(
        'the keyboard reaches the links, then sign-in, then the season picker',
        stops.join() === [...Array(stops.length - 2).fill('link'), 'sign-in', 'season'].join() &&
          stops.length >= 3,
        stops.join(),
      );
      await picker.selectOption({ label: 'Spring 2026' });
      await page.waitForURL(/season=spring-2026/);
      await page.locator('main').first().waitFor();
      const moved = new URL(page.url());
      note(
        'choosing a season shows the same page of that season and keeps the team',
        moved.pathname === '/north-valley/schedule' &&
          moved.searchParams.get('season') === 'spring-2026' &&
          moved.searchParams.get('team') === 'owls',
        page.url(),
      );
      note(
        'the picker shows the season the page is on',
        (await page.locator('.site-header select[name=season]').inputValue()) === 'spring-2026',
      );
      await accessible(page, '/north-valley/schedule (phone, another season)');
      await open(page, '/harbor-city/schedule');
      note(
        'a league with one season has no season picker',
        (await page.locator('select[name=season]').count()) === 0,
      );

      // Comets is a team of another league, never of this one (step 2.152).
      for (const address of ['/north-valley/teams/comets', '/north-valley/no-such-page/at-all']) {
        const response = await open(page, address);
        note(`${address} is not found`, response?.status() === 404);
        note(
          `${address} keeps the league's header and menu`,
          (await page.locator('.site-header .site-name').textContent()) === 'North Valley League' &&
            (await page.locator('.site-footer').count()) === 1,
        );
        const back = page.getByRole('link', { name: 'Back to the league home' });
        note(`${address} leads back to the league home`, (await back.count()) === 1);
        note(
          `${address} does not send the visitor off to the start page`,
          (await page.getByRole('link', { name: 'Go to the SR Leagues start page' }).count()) === 0,
        );
        await accessible(page, `${address} (not found)`);
      }
      await page.getByRole('link', { name: 'Back to the league home' }).click();
      await page.getByRole('heading', { level: 1, name: 'North Valley League' }).waitFor();
      note('the way on from "not found" is the league home', pathOf(page) === '/north-valley');

      // A league that may not be seen, and no league at all: the plain screen, no frame.
      for (const address of ['/quiet-pines/teams/lions', '/nobody-has-this/no-such-page/at-all']) {
        const response = await open(page, address);
        note(`${address} is not found`, response?.status() === 404);
        note(
          `${address} shows no league's frame`,
          (await page.locator('.site-header').count()) === 0 &&
            (await page.getByRole('link', { name: 'Back to the league home' }).count()) === 0 &&
            (await page.getByRole('link', { name: 'Go to the SR Leagues start page' }).count()) ===
              1,
        );
      }
    } finally {
      await context.close();
    }
  });

  await step('the header for the keyboard: a focus ring that shows, in both looks', async () => {
    /** The ring `target` shows to the keyboard, and how it reads against the header's bar. */
    const ringOf = async (target) => {
      await target.focus();
      return target.evaluate((el) => {
        const parse = (value) => {
          const [r, g, b, a = 1] = (/rgba?\(([^)]+)\)/.exec(value)?.[1] ?? '0 0 0 0')
            .split(/[ ,/]+/)
            .filter(Boolean)
            .map(Number);
          return { r, g, b, a };
        };
        const light = ({ r, g, b }) => {
          const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const style = getComputedStyle(el);
        const ring = parse(style.outlineColor);
        const bar = parse(getComputedStyle(el.closest('.site-header')).backgroundColor);
        const [hi, lo] = [light(ring), light(bar)].sort((a, b) => b - a);
        return {
          shown:
            el.matches(':focus-visible') &&
            style.outlineStyle === 'solid' &&
            parseFloat(style.outlineWidth) >= 2 &&
            ring.a === 1 &&
            bar.a === 1,
          ratio: (hi + 0.05) / (lo + 0.05),
        };
      });
    };
    const checkRing = async (label, target) => {
      const ring = await ringOf(target);
      note(
        `the focus ring shows on ${label}`,
        ring.shown && ring.ratio >= 3,
        `shown ${ring.shown}, ${ring.ratio.toFixed(2)}:1 against the header`,
      );
    };
    const laptop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await laptop.newPage();
      const small = await phone.newPage();
      for (const league of ['north-valley', 'harbor-city']) {
        await open(page, `/${league}/schedule`);
        // The keyboard is in use from here on, so what is focused shows its ring.
        await page.keyboard.press('Tab');
        const header = page.locator('.site-header');
        await checkRing(`the league's name (${league})`, header.locator('.site-name'));
        await checkRing(`a tab (${league})`, header.locator('.site-tabs a').nth(2));
        await checkRing(
          `the current tab (${league})`,
          header.locator('.site-tabs a[aria-current=page]'),
        );
        await checkRing(`Sign in (${league})`, header.locator('.site-sign-in'));
        await open(small, `/${league}/schedule`);
        await small.keyboard.press('Tab');
        await checkRing(
          `the phone menu button (${league})`,
          small.locator('.site-header .site-menu > summary'),
        );
      }
      // The season picker: only the first league has two seasons, so it is measured there
      // in its own look and then under the second league's design values, which is all
      // that differs between two leagues' looks (T-90).
      await open(page, '/north-valley/schedule');
      await page.keyboard.press('Tab');
      const picker = page.locator('.site-header select[name=season]');
      await checkRing('the season picker (north-valley)', picker);
      await page.evaluate(async () => {
        const values = /:root \{[^}]*\}/.exec(await (await fetch('/harbor-city')).text())?.[0];
        if (!values) throw new Error('no design values on /harbor-city');
        for (const style of document.querySelectorAll('style')) {
          if (/:root \{[^}]*--color-background/.test(style.textContent ?? ''))
            style.textContent = style.textContent.replace(/:root \{[^}]*\}/, values);
        }
      });
      note(
        "the page took the second league's design values",
        (await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
        )) === '#1f5fbf',
      );
      await checkRing("the season picker (under harbor-city's look)", picker);
    } finally {
      await laptop.close();
      await phone.close();
    }
  });

  await step('a picker and the keyboard: an arrow key never reads the page again', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await open(page, '/north-valley/schedule');
      const quiet = () => new Promise((resolve) => setTimeout(resolve, 800));
      const showOf = (name) => page.locator(`form:has(select[name=${name}]) button[type=submit]`);
      // The toolbar says when its script is running; only then is the button put away.
      await page.locator('.site-header .ui-toolbar[data-applies="true"]').waitFor();
      note(
        'a Show button is put away once the script says it applies choices itself',
        (await showOf('season').evaluate((el) => getComputedStyle(el).opacity)) === '0',
      );
      // The season picker in the header: arrow, then Enter.
      const season = page.locator('.site-header select[name=season]');
      await page.keyboard.press('Tab');
      await season.focus();
      await page.keyboard.press('ArrowDown');
      await quiet();
      note(
        'an arrow key moves the season without reading the page again',
        (await season.inputValue()) === 'spring-2026' && !page.url().includes('season='),
        `${await season.inputValue()} at ${page.url()}`,
      );
      note(
        'the Show button is back while the keyboard is in its picker',
        (await showOf('season').evaluate((el) => getComputedStyle(el).opacity)) === '1',
      );
      await page.keyboard.press('Enter');
      await page.waitForURL(/season=spring-2026/);
      note('Enter applies the season the keyboard chose', true);
      // A picker of the page: arrow, then the Show button, which the keyboard reaches next.
      await open(page, '/north-valley/schedule');
      const round = page.locator('main select[name=round]');
      await page.keyboard.press('Tab');
      await round.focus();
      await page.keyboard.press('ArrowDown');
      await quiet();
      note(
        'an arrow key moves the round without reading the page again',
        (await round.inputValue()) === '1' && !page.url().includes('round='),
        `${await round.inputValue()} at ${page.url()}`,
      );
      await page.keyboard.press('Tab');
      note(
        'the next stop of the keyboard is the Show button of that picker',
        await showOf('round').evaluate((el) => el === document.activeElement),
      );
      await page.keyboard.press('Enter');
      await page.waitForURL(/round=1/);
      note('the Show button applies the round the keyboard chose', true);
      // A choice made by pointer is still applied at once.
      await open(page, '/north-valley/schedule');
      await page.locator('main select[name=round]').selectOption('2');
      await page.waitForURL(/round=2/);
      note('a choice made without the keyboard is applied at once', true);
    } finally {
      await context.close();
    }
    // The page's script blocked from loading (a slow phone, a failed download): a choice is
    // not applied by itself, so the Show button must be there and work, for a page's
    // picker and for the header's.
    const blocked = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      await blocked.route('**/_next/static/**/*.js', (route) => route.abort());
      const page = await blocked.newPage();
      const showOf = (name) => page.locator(`form:has(select[name=${name}]) button[type=submit]`);
      for (const [name, value, where] of [
        ['round', '2', 'main'],
        ['season', 'spring-2026', '.site-header'],
      ]) {
        await open(page, '/north-valley/schedule');
        note(
          `with the script blocked the ${name} picker's toolbar never says it applies choices`,
          (await page.locator(`${where} .ui-toolbar[data-applies]`).count()) === 0,
        );
        const header = await page.locator('.site-header').boundingBox();
        await page.locator(`${where} select[name=${name}]`).selectOption(value);
        await new Promise((resolve) => setTimeout(resolve, 800));
        note(
          `with the script blocked a choice of ${name} is not applied by itself`,
          !page.url().includes(`${name}=`),
          page.url(),
        );
        // It appears by itself after a moment (in sight, and taking a tap), hanging under its
        // picker and moving nothing.
        const button = await showOf(name).elementHandle();
        await page.waitForFunction(
          (el) => {
            const style = getComputedStyle(el);
            return style.opacity === '1' && style.pointerEvents !== 'none';
          },
          button,
          { timeout: 5_000 },
        );
        const after = await page.locator('.site-header').boundingBox();
        note(
          `the ${name} picker's Show button appears without moving the header`,
          header?.height === after?.height,
          `${header?.height} then ${after?.height}`,
        );
        await showOf(name).click();
        await page.waitForURL(new RegExp(`${name}=${value}`));
        note(`with the script blocked the Show button applies the ${name} chosen`, true);
      }
    } finally {
      await blocked.close();
    }
  });

  await step("with scripts off on a small phone the league's name keeps its room", async () => {
    for (const width of [320, 360, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 740 },
        javaScriptEnabled: false,
      });
      try {
        const page = await context.newPage();
        await open(page, '/north-valley/schedule');
        const box = (selector) => page.locator(`.site-header ${selector}`).boundingBox();
        const name = await box('.site-name');
        // The picker is in the menu's panel on a phone (step 2.147). The menu is a plain
        // disclosure, so it opens with scripts off: the picker and its Show button are
        // then measured where a visitor finds them.
        const shut = await box('select[name=season]');
        await page.locator('.site-header .site-menu > summary').click();
        const picker = await box('select[name=season]');
        const show = await box('.site-season button[type=submit]');
        note(
          `at ${width} with scripts off the menu opens, and only then shows the season picker`,
          shut === null && picker !== null,
        );
        // The room the name's words have: the link's width less the room it keeps for the
        // league's mark, which is not room for the name (the code review of step 2.147,
        // M2). The words' own element is only as wide as the words, so a short name would
        // say nothing about the room.
        const room = await page.locator('.site-header .site-name').evaluate((el) => {
          const style = getComputedStyle(el);
          return (
            el.getBoundingClientRect().width -
            parseFloat(style.paddingInlineStart) -
            parseFloat(style.paddingInlineEnd)
          );
        });
        const words = await box('.site-name > span');
        note(
          `at ${width} with scripts off the league's name has most of the header's width`,
          room >= width * 0.6 && (words?.width ?? 0) <= room + 1,
          `${room} of ${width}`,
        );
        // And it keeps clear of the top of its row, however many lines it takes.
        const row = await box('.site-header-top');
        note(
          `at ${width} with scripts off the league's name keeps clear of the top of its row`,
          words !== null && row !== null && words.y - row.y >= 7.5,
          `${(words?.y ?? 0) - (row?.y ?? 0)}`,
        );
        note(
          `at ${width} with scripts off the name is shown whole`,
          // Its words take no more than the two lines the header shows, and none runs
          // past the name's own box: nothing is cut off. The lines measured are those of
          // the words themselves (the text inside the name's own element): since step
          // 2.147 the name shares its row with the league's mark and the menu button, so
          // on the narrowest phones it does take two lines, and the box of the element
          // around the words is not a third.
          await page.locator('.site-header .site-name').evaluate((el) => {
            const text = el.querySelector('span')?.firstChild;
            if (!text || text.nodeType !== Node.TEXT_NODE) return false;
            const words = document.createRange();
            words.selectNodeContents(text);
            const lines = [...words.getClientRects()];
            const box = el.getBoundingClientRect();
            const held = el.querySelector('span');
            return (
              lines.length > 0 &&
              new Set(lines.map((line) => Math.round(line.top))).size <= 2 &&
              lines.every((line) => line.right <= box.right + 1 && line.left >= box.left - 1) &&
              // And the element that holds the words to two lines is not cutting any off.
              held.scrollHeight <= held.clientHeight + 1
            );
          }),
        );
        note(
          `at ${width} with scripts off the season picker and its Show button are there, under the name`,
          picker !== null &&
            show !== null &&
            picker.y >= (name?.y ?? 0) + (name?.height ?? 0) - 1 &&
            show.x + show.width <= width &&
            show.height >= 44 &&
            // Side by side in one row of the open menu, the button after its picker.
            picker.height >= 44 &&
            show.x >= picker.x + picker.width - 1 &&
            Math.abs(show.y - picker.y) <= 1,
          JSON.stringify({ name, picker, show }),
        );
        // And it works: choosing a season and pressing Show reads that season's page.
        await page.locator('.site-header select[name=season]').selectOption('spring-2026');
        await page.locator('.site-header .site-season button[type=submit]').click();
        await page.waitForURL(/season=spring-2026/);
        note(`at ${width} with scripts off the Show button applies the season chosen`, true);
        note(
          `at ${width} with scripts off the page does not scroll sideways`,
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        );
      } finally {
        await context.close();
      }
    }
  });

  await step(
    'on a phone: what a thumb taps, a long name in a table, one live connection',
    async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        const page = await context.newPage();
        const live = [];
        page.on('request', (request) => {
          if (request.url().includes('/api/v1/live')) live.push(request.url());
        });
        // Everything a thumb taps is at least 44 high. A link in a sentence or in a row of a
        // table is not a thing by itself and is left out; a card that is one link counts as
        // the card its link covers.
        for (const address of [
          '/north-valley',
          '/north-valley/schedule',
          '/north-valley/standings',
          '/north-valley/stats',
          '/north-valley/teams',
          '/north-valley/teams/owls',
          '/harbor-city',
          '/harbor-city/teams',
        ]) {
          await open(page, address);
          const short = await page.evaluate(() => {
            const found = [];
            const tapped =
              '.league-site :is(a[href], button, summary, select, input:not([type=hidden]))';
            for (const el of document.querySelectorAll(tapped)) {
              if (
                el.closest(
                  'p, td, th, sup, li.ui-leader, .ui-footnotes, details:not([open]) > :not(summary)',
                )
              )
                continue;
              const style = getComputedStyle(el);
              if (style.display === 'none' || style.visibility === 'hidden') continue;
              if (style.opacity === '0' || style.pointerEvents === 'none') continue;
              let box = el.getBoundingClientRect();
              const cover = getComputedStyle(el, '::after');
              if (cover.position === 'absolute' && cover.content !== 'none') {
                box = (el.offsetParent ?? el).getBoundingClientRect();
              }
              if (box.width === 0 || box.height === 0) continue;
              if (box.height < 43.5) {
                found.push(
                  `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 24)}" is ${Math.round(box.height)} high`,
                );
              }
            }
            return found;
          });
          note(
            `everything a thumb taps on ${address} is 44 high`,
            short.length === 0,
            short.join('; '),
          );
        }
        // One connection to the league's live scores, though the home page of a league with
        // a game under way holds two lists of games.
        live.length = 0;
        await open(page, '/north-valley');
        note(
          'the home page shows a live game under its own heading and the games to come',
          (await page.getByRole('heading', { name: 'Live now' }).count()) === 1 &&
            (await page.locator('main .ui-card-grid').count()) >= 2,
        );
        await page.waitForTimeout(1500);
        note('the home page opens one live connection', live.length === 1, `${live.length}`);
        // The shared stylesheet is linked, not written into the page, and comes after the
        // frame's own, as when it was written in.
        const html = await (await fetch(`${origin}/north-valley`)).text();
        note('the shared styles are not written into a page', !html.includes('.ui-table-frame {'));
        const sheets = await page.evaluate(() =>
          [...document.styleSheets].map((sheet) => sheet.href ?? 'inline'),
        );
        const shared = sheets.findIndex((href) => href.includes('/display.css?v='));
        const frame = sheets.findIndex((href) => href.includes('/_next/'));
        note(
          "the shared stylesheet is linked after the frame's own",
          shared > -1 && frame > -1 && frame < shared,
          sheets.join(', '),
        );
        // The address the page links to carries the mark of the text: only that one is kept
        // for good. The bare address, or another mark, gets the same styles for a minute.
        const linked = sheets[shared] ?? '';
        const answer = linked === '' ? undefined : await fetch(linked);
        note(
          'the shared stylesheet, as the page links to it, may be kept by the browser for good',
          answer?.status === 200 &&
            answer.headers.get('cache-control') === 'public, max-age=31536000, immutable',
          `${answer?.status} ${answer?.headers.get('cache-control')}`,
        );
        for (const address of ['/display.css', '/display.css?v=0123456789ab']) {
          const other = await fetch(origin + address);
          note(
            `${address} answers the styles but is not kept for good`,
            other.status === 200 &&
              other.headers.get('cache-control') === 'public, max-age=60' &&
              (await other.text()) === (await (await fetch(linked)).text()),
            `${other.status} ${other.headers.get('cache-control')}`,
          );
        }
      } finally {
        await context.close();
      }
      // A team name of 36 letters at 320 wide: the column that stays put takes about half the
      // box at most, and the last column of numbers can be brought into view beside it.
      const narrow = await browser.newContext({ viewport: { width: 320, height: 700 } });
      try {
        const page = await narrow.newPage();
        await open(page, '/north-valley/standings');
        const measured = await page.evaluate(() => {
          const table = document.querySelector('table.ui-standings');
          const box = table.closest('.ui-table-wrap');
          const frame = box.getBoundingClientRect();
          const long = 'The Northside Community Thunderbolts';
          const rows = [...table.querySelectorAll('tbody tr')];
          const shareWith = (row) => {
            const name = row.querySelector('.ui-team-cell > [dir]');
            const before = name.textContent;
            name.textContent = long;
            const share = name.closest('.ui-team-cell').getBoundingClientRect().width / frame.width;
            name.textContent = before;
            return share;
          };
          // A plain row, and one whose name carries a footnote's mark (24 wide) beside it.
          const share = shareWith(rows.find((row) => !row.querySelector('.ui-note-mark')));
          const shareWithMark = shareWith(rows.find((row) => row.querySelector('.ui-note-mark')));
          const name = table.querySelector('tbody .ui-team-cell > [dir]');
          name.textContent = long;
          box.scrollLeft = box.scrollWidth;
          const cell = name.closest('.ui-team-cell').getBoundingClientRect();
          const last = table.querySelector('tbody tr > :last-child').getBoundingClientRect();
          return {
            share,
            shareWithMark,
            lastInView: last.left >= cell.right - 1 && last.right <= frame.right + 1,
            whole: name.scrollWidth <= name.clientWidth + 1,
            pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        note(
          'a long team name leaves the column that stays put about half the box at most',
          measured.share <= 0.5 && measured.shareWithMark <= 0.6,
          `${Math.round(measured.share * 100)}%, ${Math.round(measured.shareWithMark * 100)}% with a footnote's mark`,
        );
        note(
          'with a long team name the last column can still be brought into view',
          measured.lastInView,
        );
        note('a long team name wraps whole, with nothing cut off', measured.whole);
        note('a long team name does not make the page scroll sideways', !measured.pageScrolls);
        // The same long name wherever else a team is named, and a long league name in the
        // header: nothing is pushed off the screen, and on a game's board each team stays
        // in its own half.
        await open(page, '/north-valley');
        const postponed = await page
          .locator('main article.ui-game-card[data-status="postponed"] a.ui-game-link')
          .first()
          .getAttribute('href');
        // What each address must hold for the check of the two teams to be a check at all
        // (the code review of step 2.147, L10: on the home page it used to find nothing and
        // pass): a game's page holds the big board, the home page holds games as boards,
        // the teams page holds neither.
        for (const [address, holds] of [
          ['/north-valley', 'boards'],
          ['/north-valley/teams', 'none'],
          [postponed ?? '', 'scoreboard'],
        ]) {
          await open(page, address);
          const fits = await page.evaluate(() => {
            const team = 'The Northside Community Thunderbolts';
            const put = (el, text) => {
              if (el) el.textContent = text;
            };
            put(
              document.querySelector('.site-header .site-name > span'),
              'The Greater Northside Community Basketball Association',
            );
            put(document.querySelector('.ui-scoreboard-name > [dir]'), team);
            const planted = document.querySelector('.ui-game-card .ui-game-team-name');
            put(planted, team);
            // The page's own code tells a board how many letters its longer name needs
            // (packages/ui, nameMeasure): for this name, the longer line of its best break
            // into two ("Community Thunderbolts"), 22.
            planted?.closest('.ui-game-board')?.style.setProperty('--letters', '22');
            put(document.querySelector('.ui-team-card-name a'), team);
            const names = [...document.querySelectorAll('.ui-scoreboard-name')].map((el) =>
              el.getBoundingClientRect(),
            );
            const board = document.querySelector('.ui-scoreboard')?.getBoundingClientRect();
            const header = document.querySelector('.site-header-top').getBoundingClientRect();
            const held = document.querySelector('.site-header .site-name > span');
            const words = held.getBoundingClientRect();
            return {
              pageScrolls: document.documentElement.scrollWidth > window.innerWidth,
              // On a game's big board: the first team's name ends before the second's
              // begins, and both are inside the board.
              scoreboards: names.length,
              apart:
                names.length < 2 ||
                (names[0].right <= names[1].left + 1 &&
                  names[0].left >= board.left &&
                  names[1].right <= board.right),
              // A long league name keeps clear of its row's top and foot.
              nameClear: words.top - header.top >= 7.5 && header.bottom - words.bottom >= 7.5,
              nameLines: Math.round(words.height / parseFloat(getComputedStyle(held).lineHeight)),
            };
          });
          note(`long names on ${address} do not make the page scroll sideways`, !fits.pageScrolls);
          note(
            `a long league name on ${address} takes two lines and keeps clear of its row's edges`,
            fits.nameClear && fits.nameLines === 2,
            JSON.stringify({ clear: fits.nameClear, lines: fits.nameLines }),
          );
          if (holds !== 'boards') {
            note(
              `long names on ${address} keep each team of a board in its own half`,
              fits.apart && (holds === 'none' || fits.scoreboards === 2),
              `${fits.scoreboards} names found`,
            );
            continue;
          }
          // The home page's games are boards, and the first of them now has a name of 36
          // letters: on the narrowest phone that board stands its teams one over the
          // other, and every board keeps each team in its own part of it.
          const boards = await measureBoards(page);
          note(
            `long names on ${address} keep each team of a board in its own half`,
            boards.length >= 3 && boards.every((b) => b.apart && b.inside && b.whole),
            JSON.stringify(boards.filter((b) => !(b.apart && b.inside && b.whole))),
          );
          note(
            'at 320 a board whose names cannot sit side by side stands its teams one over the other',
            boards[0]?.stacked === true && boards.every((b) => b.drawnAsDecided),
            JSON.stringify(boards.map((b) => ({ stacked: b.stacked, ok: b.drawnAsDecided }))),
          );
        }
        // The divisions' tables on one page: each number column starts at the same place in
        // all of them, on a phone (390) as on this narrowest one, so GP sits under GP.
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 800 });
          await open(page, '/north-valley/standings');
          const columns = await page.evaluate(() =>
            [...document.querySelectorAll('table.ui-standings')].map((table) =>
              [...table.querySelectorAll('thead th')].map((th) =>
                Math.round(th.getBoundingClientRect().left),
              ),
            ),
          );
          note(
            `at ${width} the divisions' tables have their columns in the same places`,
            columns.length >= 2 && columns.every((c) => c.join() === columns[0].join()),
            JSON.stringify(columns),
          );
        }
        // The sign that a table goes on (the fade and the arrow at its far edge) is there
        // only while columns are out of sight; and the column that stays put shows its
        // edge only while the table is scrolled under it. At 390 wide these two pages
        // hold tables of both kinds: ones that go on, and one that fits.
        await page.setViewportSize({ width: 390, height: 800 });
        const signs = [];
        for (const address of ['/harbor-city/standings', '/harbor-city/stats']) {
          await open(page, address);
          await page.waitForTimeout(200);
          signs.push(
            ...(await page.evaluate(async () => {
              const seen = [];
              const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
              for (const box of document.querySelectorAll('.ui-table-frame')) {
                const wrap = box.querySelector('.ui-table-wrap');
                const cell = box.querySelector('tbody .ui-team-cell');
                const edge = () => (cell ? getComputedStyle(cell, '::after').opacity : null);
                const goesOn = wrap.scrollWidth > wrap.clientWidth + 1;
                const sign = getComputedStyle(box, '::before').opacity;
                const edgeAtRest = edge();
                wrap.scrollLeft = wrap.scrollWidth;
                await frame();
                await frame();
                seen.push({ goesOn, sign, edgeAtRest, edgeScrolled: edge() });
              }
              return seen;
            })),
          );
        }
        note(
          'the sign that a table goes on shows only while columns are out of sight',
          signs.some((s) => s.goesOn) &&
            signs.some((s) => !s.goesOn) &&
            signs.every((s) => (s.goesOn ? s.sign === '1' : s.sign === '0')),
          JSON.stringify(signs),
        );
        note(
          'the column that stays put shows its edge only while the table is scrolled under it',
          signs.every((s) => s.edgeAtRest === '0') &&
            signs.filter((s) => s.goesOn).every((s) => s.edgeScrolled === '1') &&
            signs.filter((s) => !s.goesOn).every((s) => s.edgeScrolled === '0'),
          JSON.stringify(signs),
        );
        await page.setViewportSize({ width: 320, height: 700 });
        // A heading's sort button, reached backwards by the keyboard, is scrolled clear of the
        // column that stays put, and its ring is drawn inside it.
        await open(page, '/north-valley/stats');
        await page.keyboard.press('Tab');
        const buttons = page.locator('main table .ui-sort-button');
        const table = buttons.first().locator('xpath=ancestor::table');
        const own = table.locator('.ui-sort-button');
        await own.last().focus();
        for (let i = (await own.count()) - 1; i > 1; i -= 1) await page.keyboard.press('Shift+Tab');
        const reached = await table.evaluate((el) => {
          const focused = document.activeElement;
          const stays = el.querySelector('thead .ui-team-cell').getBoundingClientRect();
          const box = focused.getBoundingClientRect();
          const style = getComputedStyle(focused);
          return {
            isButton:
              focused.classList.contains('ui-sort-button') && !focused.closest('.ui-team-cell'),
            clear: box.left >= stays.right - 1,
            inside: parseFloat(style.outlineOffset) < 0 && style.outlineStyle === 'solid',
          };
        });
        note(
          'a sort button reached backwards by the keyboard is clear of the column that stays put',
          reached.isButton && reached.clear,
          JSON.stringify(reached),
        );
        note(
          "a sort button's focus ring is drawn inside it, where the box cannot cut it",
          reached.inside,
        );
      } finally {
        await narrow.close();
      }
    },
  );

  await step('the home page: its boards at every width, and what leads it', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      const page = await context.newPage();
      // A board decides between its two drawings by a sum (packages/ui, the board's
      // styles). Whatever it decides, what is drawn must agree with it and nothing may
      // overlap, be cut off or be split inside a word (the code review of step 2.147, L10).
      // The two leagues as they are: the first starting design and the plain light one.
      for (const league of ['north-valley', 'harbor-city']) {
        await checkHomeBoards(page, `${origin}/${league}`, `/${league}`);
      }
      // And the first league under the other three sets of colors and faces (a face of
      // capitals is half as wide again as a serif): one more server for each, with the
      // design named as the picture script names it.
      for (const design of ['crest-light', 'pine', 'midnight-gold']) {
        const base = `http://localhost:${await freePort()}`;
        const other = start(['start', '--port', new URL(base).port], {
          APP_ENV: 'test',
          PUBLIC_BASE_URL: base,
          LOCAL_DESIGN: design,
        });
        try {
          await waitFor(`${base}/`, other);
          await checkHomeBoards(page, `${base}/north-valley`, `/north-valley in ${design}`);
        } finally {
          other.child.kill();
        }
      }
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        for (const league of ['north-valley', 'harbor-city']) {
          await open(page, `/${league}`);
          await page.evaluate(() => document.fonts.ready);
          // A card's top line never breaks inside the date and time: a line that cannot
          // hold them and the state's pill gives the pill a line of its own.
          const broken = await page.evaluate(() =>
            [...document.querySelectorAll('.ui-game-card[data-layout="board"] .ui-game-when')]
              .filter(
                (when) =>
                  when.getBoundingClientRect().height >
                  1.5 * parseFloat(getComputedStyle(when).lineHeight),
              )
              .map((when) => when.textContent),
          );
          note(
            `at ${width} no board of /${league} breaks its date and time`,
            broken.length === 0,
            broken.join('; '),
          );
          // The hero's mark is drawn only where the words leave it room: on a phone
          // nothing of it passes under the words or a button.
          const art = await page
            .locator('.ui-hero-art')
            .first()
            .evaluate((el) => getComputedStyle(el).display);
          note(
            `at ${width} the hero's mark on /${league} is ${width >= 1024 ? 'drawn' : 'put away'}`,
            width >= 1024 ? art !== 'none' : art === 'none',
            art,
          );
        }
      }
      // On a laptop the two rows of the home page share one gap, so their edges meet: the
      // second column of the lower row starts where the second board of the upper row does.
      await open(page, '/north-valley');
      const edges = await page.evaluate(() => {
        const left = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null);
        const right = (el) => (el ? Math.round(el.getBoundingClientRect().right) : null);
        const cards = document.querySelectorAll(
          '.ui-card-grid[data-layout="board"][data-across="two"] > li',
        );
        const pair = document.querySelector('.home-pair[data-tables="few"]');
        return {
          cards: [right(cards[0]), left(cards[1])],
          columns: [right(pair?.children[0]), left(pair?.children[1])],
        };
      });
      note(
        'on a laptop the edges of the home page’s two rows meet',
        edges.cards.every((x) => x !== null) &&
          Math.abs(edges.cards[0] - edges.columns[0]) <= 1 &&
          Math.abs(edges.cards[1] - edges.columns[1]) <= 1,
        JSON.stringify(edges),
      );
      // A season with nothing coming has no section to say so: the page leads with its
      // latest games, decided ones first, and the standings.
      await open(page, '/north-valley?season=spring-2026');
      const led = await page.evaluate(() => ({
        titles: [...document.querySelectorAll('main h2')].map((h) => h.textContent),
        first: document.querySelector('.home-pair .ui-game-card')?.getAttribute('data-status'),
        empties: document.querySelectorAll('main .ui-empty').length,
      }));
      note(
        'a season with nothing coming leads with its latest games and the standings',
        !led.titles.includes('The next matchups') &&
          led.titles[0] === 'Recent results' &&
          led.titles.includes('The standings') &&
          led.empties === 0,
        JSON.stringify(led),
      );
      note(
        'the latest games open with a decided game',
        led.first === 'final' || led.first === 'forfeit',
        `${led.first}`,
      );
    } finally {
      await context.close();
    }
  });

  await step('sign in, close the browser, come back', async () => {
    const first = await launch();
    let kept;
    try {
      const context = await first.newContext();
      const page = await context.newPage();
      await open(page, '/account');
      note('a visitor is sent to sign in', pathOf(page) === '/signin');
      await page.getByRole('heading', { name: 'Sign in' }).waitFor();
      await accessible(page, '/signin');
      await page.getByLabel('Email').fill(member.email);
      await page.getByLabel('Password').fill(member.password);
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/account'),
        page.getByRole('button', { name: 'Sign in', exact: true }).click(),
      ]);
      await page.getByRole('heading', { name: 'Your account' }).waitFor();
      await accessible(page, '/account');
      const cookies = await context.cookies(origin);
      const now = Date.now() / 1000;
      for (const name of ['srl_session', 'srl_renew']) {
        const cookie = cookies.find((c) => c.name === name);
        note(`signing in sets the ${name} cookie`, cookie !== undefined);
        note(`${name} cannot be read by page scripts`, cookie?.httpOnly === true);
      }
      // What a real browser keeps when it closes: only cookies that have an end date.
      const renew = cookies.find((c) => c.name === 'srl_renew');
      note(
        'srl_renew is kept after the browser closes, for days',
        renew !== undefined && renew.expires > now + week,
        `expires in ${renew ? Math.round((renew.expires - now) / 3600) : '?'} hours`,
      );
      const session = cookies.find((c) => c.name === 'srl_session');
      note(
        'srl_session is kept after the browser closes',
        session !== undefined && session.expires > now,
      );
      kept = cookies.filter((c) => c.expires > now);
    } finally {
      await first.close();
    }

    const second = await launch();
    try {
      const back = await second.newContext();
      await back.addCookies(kept);
      const again = await back.newPage();
      await open(again, '/account');
      await again.getByRole('heading', { name: 'Your account' }).waitFor();
      note('back in a new browser, still signed in', pathOf(again) === '/account');
      await again.getByRole('button', { name: 'Sign out everywhere' }).click();
      // Either the sign-in page, or the account page showing the signed-out state.
      await again.waitForFunction(
        () =>
          location.pathname === '/signin' ||
          (location.pathname === '/account' && !document.body.innerText.includes('Your account')),
      );
      await open(again, '/account');
      note('after signing out, sent to sign in', pathOf(again) === '/signin');
    } finally {
      await second.close();
    }

    // The old cookies, replayed, must now be refused.
    const third = await launch();
    try {
      const replay = await third.newContext();
      await replay.addCookies(kept);
      const page = await replay.newPage();
      await open(page, '/account');
      note('the old cookies are refused after signing out everywhere', pathOf(page) === '/signin');
    } finally {
      await third.close();
    }
  });

  await step('a scheduler of the first league in the second', async () => {
    const context = await browser.newContext();
    try {
      await context.addCookies([
        { name: 'srl_session', value: 'local-scheduler-token', url: origin },
      ]);
      const page = await context.newPage();
      const nav = page.getByRole('navigation', { name: 'Admin areas' });
      await open(page, '/north-valley/admin');
      await nav.waitFor();
      await accessible(page, '/north-valley/admin (as its scheduler)');
      const areas = [
        '',
        '/schedule',
        '/games',
        '/teams',
        '/people',
        '/season',
        '/registration',
        '/standings',
        '/messages',
        '/site',
        '/settings',
      ];
      for (const area of areas) {
        const response = await open(page, `/harbor-city/admin${area}`);
        await page.getByText(noAccess).first().waitFor();
        note(`scheduler refused at /harbor-city/admin${area}`, response?.status() === 403);
        note(`no admin navigation at /harbor-city/admin${area}`, (await nav.count()) === 0);
      }
      const response = await open(page, '/harbor-city/score/game-1');
      await page.getByText(noAccess).first().waitFor();
      note('scheduler refused at /harbor-city/score/game-1', response?.status() === 403);
      await accessible(page, '/harbor-city/admin (refused)');
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Browser exit-test check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Browser exit-test check passed: ${checked.length} checks in a real browser.`);
