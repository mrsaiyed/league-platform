// Step 2.140: nothing unfinished shows in production. For every visitor and admin of a live
// league, in a real browser at phone width, on the web app's made-up stand-in. Nothing leaves
// this computer; every league and person is made up (apps/web/src/server/stand-in-cast.ts).
//
// The same build is started twice: as local work and tests run it (APP_ENV=test: every page
// not built yet shown), and as staging and production draw it (APP_ENV=test with
// LOCAL_UNRELEASED=hidden, apps/web/src/server/releases.ts: neither mode can start on this
// computer, record 055, and what they draw is decided by the same one test). Then:
//
// - Each kind of staff, at phone width, by taps, with scripts on and with them off: opens the
//   admin, opens its menu and taps every entry. As production draws it, the menu holds only
//   areas that exist (the local menu without those marked "Not ready"), no entry leads to a
//   "not ready" panel or to "not found", and the admin's home names nothing still to come; a
//   registrar, one of whose areas (Registration) is still to come, finds only People in the
//   menu on a home that names nothing still to come, passes the accessibility checks and does
//   not scroll sideways. As local work draws it, every area of
//   the person's is in the menu, those with no screen marked "Not ready", and each of those
//   opens its "not ready" panel.
// - Every public address (each of our own pages, each page of two live leagues with made-up
//   values), as a visitor, a member and the owner: as production draws it, no answer says
//   "not built yet" or "not ready", no link drawn leads to a page not built yet, and every
//   link drawn on those pages leads somewhere that answers; the footer links to Terms and
//   Privacy, built since (step 2.135). As local work draws it, every page not built yet says
//   so, and the footer links to both too.
// - As production draws it, the address of each page and area not built yet answers exactly
//   as an address that does not exist: the same status, headers (but the date and the
//   length), markup and page data once each name is put in the same place, compared over
//   HTTP, for a visitor, the owner, a scheduler at an area not theirs and a registrar at
//   their own area; and Next.js's list of the routes beside an address names none of them.
// `--no-build` serves the build already here.
import { en } from '../../packages/site/src/messages/en.ts';
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};
const step = async (name, run) => {
  try {
    await run();
  } catch (error) {
    failures.push(`${name}: ${String(error?.message ?? error).split('\n')[0]}`);
  }
};

const phone = { width: 390, height: 844 };
const token = (who) => `local-${who}-token`;

/** What a page not built yet says, in the words of the message files. */
const unfinishedWords = [
  en['shell.notBuilt'],
  en['admin.notReady.body'],
  en['admin.notReady.title'],
];
/** The admin home's list of areas still to come, by its own mark (its title is one word). */
const comingList = 'id="staff-home-coming"';
const notReadyMark = en['admin.notReady.mark'];
const notFoundTitle = en['common.notFoundTitle'];
for (const words of [...unfinishedWords, notReadyMark, notFoundTitle]) {
  if (typeof words !== 'string' || words.trim() === '') {
    throw new Error('A sentence this test looks for is missing from the message files.');
  }
}
const unfinishedIn = (text) => unfinishedWords.filter((words) => text.includes(words));

/**
 * The staff of the made-up leagues and the league each runs (stand-in-cast.ts): the owner
 * of the live league, its scheduler and scorekeeper; the draft league's admin, registrar,
 * editor, club admin and the scheduler of its program; and the other draft league's admin.
 */
const staff = [
  ['owner', 'north-valley'],
  ['scheduler', 'north-valley'],
  ['scorekeeper', 'north-valley'],
  ['admin', 'quiet-pines'],
  ['registrar', 'quiet-pines'],
  ['editor', 'quiet-pines'],
  ['club-admin', 'quiet-pines'],
  ['program-scheduler', 'quiet-pines'],
  ['other-admin', 'still-waters'],
];

/**
 * Every page not built yet that has a placeholder, and the word in its address that an
 * unknown address puts something else in place of: the comparison asks `/{that}` with the
 * word changed, and puts the word back into what came.
 */
const placeholders = [
  ['/contact', 'contact'],
  ['/find', 'find'],
  ['/help', 'help'],
  ['/start', 'start'],
  ['/status', 'status'],
  ['/account/inbox', 'inbox'],
  ...['north-valley', 'harbor-city'].flatMap((league) => [
    [`/${league}/news`, 'news'],
    [`/${league}/news/a-made-up-post`, 'news'],
    [`/${league}/players/a-made-up-player`, 'players'],
    [`/${league}/register`, 'register'],
  ]),
];
const adminPlaceholders = ['registration', 'standings', 'site', 'messages'];
const stranger = 'zqxunknownzqx';

/** Every public address: our own pages, and each page of two live leagues. */
const liveGame = '01900000-0000-7000-8000-006a00000002';
const publicAddresses = [
  '/',
  '/signin',
  '/signin/forgot',
  '/signup',
  '/signup/code',
  '/signup/password',
  '/account',
  '/account/confirm',
  '/terms',
  '/privacy',
  ...placeholders.filter(([at]) => !/^\/(north-valley|harbor-city)\//.test(at)).map(([at]) => at),
  ...['north-valley', 'harbor-city'].flatMap((league) => [
    `/${league}`,
    `/${league}/schedule`,
    `/${league}/standings`,
    `/${league}/stats`,
    `/${league}/teams`,
    `/${league}/teams/${league === 'north-valley' ? 'owls' : 'comets'}`,
    ...(league === 'north-valley' ? [`/${league}/games/${liveGame}`] : []),
    `/${league}/my`,
    `/${league}/news`,
    `/${league}/news/a-made-up-post`,
    `/${league}/players/a-made-up-player`,
    `/${league}/register`,
    `/${league}/awards`,
    `/${league}/draft`,
    `/${league}/media`,
    `/${league}/sponsors`,
    `/${league}/clubs/a-made-up-club`,
    `/${league}/about`,
  ]),
];
const placeholderAddresses = new Set(placeholders.map(([at]) => at));
const people = { visitor: null, member: token('coach'), owner: token('owner') };

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

/** Starts the build: as local work draws it, or (`hidden`) as staging and production do. */
async function serve(hidden) {
  const port = await freePort();
  const origin = `http://localhost:${port}`;
  const server = startNext(['start', '--port', String(port)], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    ...(hidden ? { LOCAL_UNRELEASED: 'hidden' } : {}),
  });
  await waitFor(`${origin}/north-valley`, server, [
    { address: '/north-valley/admin', cookie: `srl_session=${token('owner')}` },
  ]);
  return { origin, server };
}

const fetchAs = (origin, address, who) =>
  fetch(origin + address, {
    redirect: 'manual',
    headers: who ? { cookie: `srl_session=${who}` } : {},
  });

/** The markup the browser draws before any script: the page's data and scripts left out. */
const drawnMarkup = (html) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
const hrefsIn = (html) =>
  [...drawnMarkup(html).matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) =>
    m[1].replaceAll('&amp;', '&'),
  );

/** The admin's menu as a phone shows it: each entry's address, words and "Not ready" mark. */
async function menuOf(page) {
  await openStaffMenu(page);
  const links = page.locator('.staff-bar .staff-menu .staff-nav a');
  const entries = [];
  for (let at = 0; at < (await links.count()); at += 1) {
    const link = links.nth(at);
    const mark = link.locator('.staff-nav-mark');
    entries.push({
      href: await link.getAttribute('href'),
      name: (await link.locator('span').first().innerText()).trim(),
      notReady: (await mark.count()) > 0 && (await mark.innerText()).trim() === notReadyMark,
    });
  }
  return entries;
}

/**
 * Walks one person's admin menu at phone width: opens the admin (the one address typed),
 * then for each entry opens the menu and taps it, as a person does. Returns the menu.
 */
async function walkMenu(browser, origin, who, league, scripts, mode) {
  const context = await browser.newContext({ viewport: phone, javaScriptEnabled: scripts });
  await context.addCookies([{ name: 'srl_session', value: token(who), url: origin }]);
  const page = await context.newPage();
  const label = `${mode}, ${who} at ${league}, scripts ${scripts ? 'on' : 'off'}`;
  try {
    await page.goto(`${origin}/${league}/admin`);
    const menu = await menuOf(page);
    note(`${label}: the admin's menu has its home and more`, menu.length >= 1, `${menu.length}`);
    const home = await page.locator('main').innerText();
    if (mode === 'production') {
      note(`${label}: the home says nothing unfinished`, unfinishedIn(home).length === 0);
      note(
        `${label}: the home names no area still to come`,
        (await page.locator('#staff-home-coming').count()) === 0,
      );
    }
    for (const entry of menu) {
      await page.goto(`${origin}/${league}/admin`);
      await openStaffMenu(page);
      await Promise.all([
        page.waitForURL((url) => url.pathname === entry.href),
        page
          .locator('.staff-bar .staff-menu .staff-nav')
          .getByRole('link', { name: new RegExp(`^${entry.name}`) })
          .click(),
      ]);
      await page.waitForLoadState('load');
      const text = await page.locator('body').innerText();
      const at = `${label}: tapping "${entry.name}"`;
      if (mode === 'production') {
        note(`${at} is no "not ready" entry`, !entry.notReady);
        note(
          `${at} shows nothing unfinished`,
          unfinishedIn(text).length === 0,
          unfinishedIn(text).join(' | '),
        );
        note(`${at} is not "not found"`, !text.includes(notFoundTitle));
        note(`${at} has no "Not ready" mark`, !text.includes(notReadyMark));
      } else if (entry.notReady) {
        note(`${at} opens its "not ready" panel`, text.includes(en['admin.notReady.body']));
      } else {
        note(`${at} opens a screen of its own`, !text.includes(en['admin.notReady.body']));
      }
    }
    return menu;
  } finally {
    await context.close();
  }
}

const browser = built ? await launch() : null;
const servers = {};
try {
  if (browser) {
    await step('starting the app as local work runs it', async () => {
      servers.local = await serve(false);
    });
    await step('starting the app as production draws it', async () => {
      servers.production = await serve(true);
    });
  }

  // 1. Each kind of staff, by taps, scripts on and off.
  for (const [who, league] of staff) {
    if (!servers.local || !servers.production) break;
    for (const scripts of [true, false]) {
      await step(`the menu of ${who}, scripts ${scripts ? 'on' : 'off'}`, async () => {
        const local = await walkMenu(browser, servers.local.origin, who, league, scripts, 'local');
        const live = await walkMenu(
          browser,
          servers.production.origin,
          who,
          league,
          scripts,
          'production',
        );
        const names = (menu) => menu.map((entry) => entry.href).join(', ');
        note(
          `${who}: production's menu is the local menu without the areas marked "Not ready"`,
          names(live) === names(local.filter((entry) => !entry.notReady)),
          `${names(live)} / ${names(local)}`,
        );
        note(
          `${who}: production's menu has no "Not ready" entry`,
          live.every((entry) => !entry.notReady),
        );
        for (const entry of local.filter((e) => e.notReady)) {
          const area = entry.href.split('/').pop();
          note(
            `${who}: "${area}" is one of the areas with no screen`,
            adminPlaceholders.includes(area),
          );
        }
      });
    }
  }

  // The registrar, whose Registration is still to come and People built, as production draws it.
  if (servers.production) {
    await step('the registrar’s admin as production draws it', async () => {
      const context = await browser.newContext({ viewport: phone });
      await context.addCookies([
        { name: 'srl_session', value: token('registrar'), url: servers.production.origin },
      ]);
      const page = await context.newPage();
      await page.goto(`${servers.production.origin}/quiet-pines/admin`);
      const main = await page.locator('main').innerText();
      note(
        'the registrar’s home names nothing still to come',
        !(await page.content()).includes(comingList) && unfinishedIn(main).length === 0,
      );
      const problems = await accessibilityProblems(page);
      note(
        'the registrar’s home passes the accessibility checks',
        problems.length === 0,
        problems.join('; '),
      );
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      note('the registrar’s home does not scroll sideways at 390', wide <= phone.width, `${wide}`);
      const menu = await menuOf(page);
      note(
        'the registrar’s menu is the admin’s home and People',
        menu.length === 2 &&
          menu.some((e) => e.name === en['admin.area.people']) &&
          menu.every((e) => !e.notReady),
        menu.map((e) => e.name).join(', '),
      );
      await context.close();
    });
  }

  // 2. Every public address, as a visitor, a member and the owner.
  for (const [mode, server] of Object.entries(servers)) {
    for (const [person, who] of Object.entries(people)) {
      await step(`${mode}: every public address as the ${person}`, async () => {
        const links = new Set();
        const found = [];
        for (const address of publicAddresses) {
          const response = await fetchAs(server.origin, address, who);
          const html = await response.text();
          const words = unfinishedIn(html);
          if (html.includes(comingList)) words.push('the list of areas still to come');
          const label = `${mode}, ${person}, ${address}`;
          if (mode === 'production') {
            note(`${label}: says nothing unfinished`, words.length === 0, words.join(' | '));
            for (const href of hrefsIn(html)) {
              const path = href.split(/[?#]/)[0];
              note(
                `${label}: no link to "${href}", which is not built`,
                !placeholderAddresses.has(path),
              );
              if (href.startsWith('/') && !href.startsWith('//')) links.add(href);
            }
          } else if (placeholderAddresses.has(address)) {
            if (html.includes(en['shell.notBuilt'])) found.push(address);
            note(`${label}: says it is not built yet`, html.includes(en['shell.notBuilt']));
          }
          if (response.status === 200 && /^\/north-valley(\/|$)/.test(address)) {
            note(
              `${label}: the footer links to Terms and Privacy`,
              /href="\/terms[?"]/.test(html) && /href="\/privacy[?"]/.test(html),
            );
          }
        }
        if (mode === 'local') {
          note(
            `local, ${person}: found every page not built yet`,
            found.length === placeholders.length,
            `${found.length} of ${placeholders.length}`,
          );
        }
        // Every link drawn as production draws it leads somewhere that answers.
        for (const href of links) {
          const response = await fetchAs(server.origin, href, who);
          await response.text();
          note(
            `${mode}, ${person}: the link "${href}" answers`,
            response.status !== 404 && response.status < 500,
            `${response.status}`,
          );
        }
      });
    }
  }

  // 3. As production draws it, a page not built yet is exactly an address that does not exist.
  if (servers.production) {
    const { origin } = servers.production;
    /** One answer, the made-up word put back as `as` (a page's own word, or itself). */
    const ask = async (address, who, word, as) => {
      const response = await fetchAs(origin, address, who);
      // Each answer carries a fresh nonce for its scripts (the content security policy), the
      // same in every answer's own headers and markup: it is put as one word too.
      const put = (text) =>
        text
          .replaceAll(word, as)
          .replace(/nonce-[A-Za-z0-9+/=]+/g, 'nonce-N')
          .replace(/(nonce(?:=|\\?":)\\?")[^"\\]+/g, '$1N');
      const headers = [...response.headers]
        .filter(([name]) => !['date', 'content-length'].includes(name))
        .map(([name, value]) => `${name}: ${put(value)}`)
        .join('\n');
      const pieces = [];
      const markup = put(await response.text()).replace(
        /<script(?: nonce="[^"]*")?>self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g,
        (_, piece) => {
          pieces.push(JSON.parse(piece));
          return '';
        },
      );
      // How the stream happened to be cut is the only other thing that may differ.
      const rows = pieces.join('').split('\n').filter(Boolean).sort().join('\n');
      return { status: response.status, headers, markup, rows };
    };
    const cases = [
      ...placeholders.flatMap(([address, word]) =>
        ['visitor', 'owner'].map((person) => [
          address,
          word,
          person === 'owner' ? token('owner') : null,
          person,
        ]),
      ),
      ...adminPlaceholders.flatMap((area) => [
        [`/north-valley/admin/${area}`, area, token('owner'), 'owner'],
        [`/north-valley/admin/${area}`, area, token('scheduler'), 'scheduler'],
        [`/north-valley/admin/${area}`, area, null, 'visitor'],
      ]),
      ['/quiet-pines/admin/registration', 'registration', token('registrar'), 'registrar'],
    ];
    for (const [address, word, who, person] of cases) {
      await step(`production: ${address} as the ${person}`, async () => {
        const unknown = address.replace(new RegExp(`/${word}(?=/|$)`), `/${stranger}`);
        const page = await ask(address, who, word, word);
        const none = await ask(unknown, who, stranger, word);
        const label = `production, ${person}: ${address} answers as ${unknown}`;
        note(
          `${label}: status ${page.status}`,
          page.status === none.status && page.status === 404,
          `${page.status} / ${none.status}`,
        );
        note(
          `${label}: headers`,
          page.headers === none.headers,
          `${page.headers}\n---\n${none.headers}`,
        );
        note(`${label}: markup`, page.markup === none.markup);
        const other = new Set(none.rows.split('\n'));
        note(
          `${label}: page data`,
          page.rows !== '' && page.rows === none.rows,
          page.rows === ''
            ? 'no page data found'
            : (page.rows.split('\n').find((row) => !other.has(row)) ?? '').slice(0, 300),
        );
      });
    }
    await step('production: the routes Next.js lists beside an address', async () => {
      // At each level, the routes beside the unknown address there, and the words of the
      // pages not built yet at that level, which must be none of them.
      const levels = [
        [`/${stranger}`, null, placeholders.filter(([at]) => !at.includes('-')).map(([, w]) => w)],
        [`/north-valley/${stranger}`, null, ['news', 'players', 'register']],
        [`/account/${stranger}`, null, ['inbox']],
        [`/north-valley/admin/${stranger}`, token('owner'), adminPlaceholders],
      ];
      for (const [address, who, unbuilt] of levels) {
        const html = await (await fetchAs(origin, address, who)).text();
        const names = new Set();
        for (const [, list] of html.matchAll(/\\"s\\":\[([^\]]*)\]/g)) {
          for (const [, name] of list.matchAll(/\\"([^\\]+)\\"/g)) names.add(name);
        }
        note(`beside ${address} Next.js lists routes`, names.size > 0);
        const named = unbuilt.filter((word) => names.has(word));
        note(
          `beside ${address} it lists no page not built yet`,
          named.length === 0,
          named.join(', '),
        );
      }
    });
  }
} finally {
  await browser?.close();
  for (const server of Object.values(servers)) server.server.child.kill();
}

if (failures.length > 0) {
  console.error(
    `Nothing unfinished in production: ${failures.length} failed of ${checked.length}:`,
  );
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`Nothing unfinished in production: ${checked.length} checks passed.`);
