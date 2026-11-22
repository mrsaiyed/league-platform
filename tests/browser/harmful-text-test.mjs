// Step 2.98 (T4 §5 and §12): script-injection strings typed into every text field come out
// as harmless text, in a real browser, against the web app on its made-up stand-in
// (APP_ENV=test). Nothing leaves this computer; every league, team and person is made up.
// Builds the app first unless given --no-build (npm run test:web:browser builds it once in
// web-exit-test.mjs).
//
// An attacker's text is typed, through the screens' own forms as a person would, into every
// field that takes free text: a team's name, a person's first and last names, a round's name,
// a reason to reopen a result, an imported file's name and its venue and court, a name typed
// at the scorer's table, the email boxes, and the addresses' own questions (?season=, ?next=,
// ?problem=). Then every page that shows them is opened as a visitor, the owner and the
// scorekeeper, and each must show the text as text: nothing of it became a page element and
// no script of it ran with the script policy (record 081) switched off in the browser, so the
// page's own escaping keeps it text, not the policy; with the policy on, the browser had
// nothing to refuse; and the raw answer never holds it unescaped.
//
// "Every text field" stays true: the test opens every admin and public page it knows and fails
// on a free-text field it does not know (FIELDS below), so a new field must be added here.
import { addPlayers, liveGame } from './tracker-driver.mjs';
import {
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
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
    failures.push(`${name}: ${whatWentWrong(error)}`);
  }
};

/**
 * An attacker's text, marked with where it was typed: it tries to end a quoted attribute and
 * the element it is in, to add an element whose handler runs, and to add a script. Each piece
 * would set `__ran` or leave an element carrying `data-ran` if a page drew it as markup.
 */
const attack = (mark) =>
  `"'><img src=x onerror=__ran='${mark}' data-ran=${mark}><script>__ran='${mark}'</script>`;
/** The same with no spaces, for a box that takes a name's first word apart from the rest. */
const tightAttack = (mark) =>
  `"'><svg/onload=__ran='${mark}'/data-ran=${mark}><script>__ran=1</script>`;
/** And with no double quote or comma, for a spreadsheet's cell. */
const cellAttack = (mark) =>
  `'><img src=x onerror=__ran='${mark}' data-ran=${mark}><script>__ran='${mark}'</script>`;

const typed = {
  team: attack('team'),
  first: attack('first'),
  last: attack('last'),
  round: attack('round'),
  reason: attack('reason'),
  table: tightAttack('table'),
  venue: cellAttack('venue'),
  court: cellAttack('court'),
  // A file's name cannot hold a slash: the browser keeps only what follows the last one.
  file: `'><img src=x onerror=__ran='file' data-ran=file>.csv`,
  query: attack('query'),
};

/**
 * Every field that takes free text on the pages opened below, by page and field name, with
 * where its text is typed in this test. A free-text field (a text box or a text area: not a
 * number, date, time, color, file, hidden field, password, choice or tick) on these pages that
 * is not here fails the test. Fields that take only digits or an email are typed into too:
 * what is refused must come back as harmlessly as what is kept.
 */
const FIELDS = {
  '/north-valley/admin/teams': { name: 'a team is added', shortName: 'a team is added' },
  '/north-valley/admin/teams/{id}': {
    name: "a team's own page",
    shortName: "a team's own page",
    firstName: 'a person is added',
    lastName: 'a person is added',
    jerseyNumber: 'a person is added',
  },
  '/north-valley/admin/schedule': { label: 'a round is renamed' },
  '/north-valley/admin/games/{id}': {
    reason: 'a result is reopened',
    awayScore: 'a box score is typed',
    homeScore: 'a box score is typed',
    'minutes.{id}': 'a box score is typed',
    'stat.points.{id}': 'a box score is typed',
    'stat.fg3.{id}': 'a box score is typed',
    'stat.fg1.{id}': 'a box score is typed',
    'stat.fouls.{id}': 'a box score is typed',
    'stat.rebounds.{id}': 'a box score is typed',
  },
  '/signin': { email: 'the email boxes' },
  '/signup': { email: 'the email boxes' },
  '/signin/forgot': { email: 'the email boxes' },
  '/signup/code': { code: 'the email boxes' },
};

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

let server;
let browser;
const origin = `http://localhost:${await freePort()}`;
const owner = 'local-owner-token';
const keeper = 'local-scorekeeper-token';

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server, [
      { address: '/north-valley/admin/teams', cookie: `srl_session=${owner}` },
    ]);
    browser = await launch();
  });
}

/** Before any of the page's own scripts: what the script policy refuses is written down. */
function listenForRefusals() {
  window.__refused = [];
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__refused.push(`${event.effectiveDirective} ${event.blockedURI || 'inline'}`);
  });
}

/** A browser for `who` (a session cookie, or null for a visitor), at a laptop's width. */
async function contextFor(who, { withoutPolicy = false } = {}) {
  // Without the policy, the browser runs whatever a page holds: what is shown as text is then
  // shown so by the page itself, not because the policy stopped it (record 081).
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    bypassCSP: withoutPolicy,
  });
  if (who !== null) await context.addCookies([{ name: 'srl_session', value: who, url: origin }]);
  await context.addInitScript(listenForRefusals);
  return context;
}

/** What a page holds of the attack: elements it made, whether a script ran, its text. */
const harm = (page) =>
  page.evaluate(() => ({
    ran: typeof window.__ran === 'undefined' ? null : String(window.__ran),
    made: [...document.querySelectorAll('[data-ran], [onerror], [onload]')].map((element) =>
      element.outerHTML.slice(0, 80),
    ),
    // A script of the attack's own (the page's own data holds the attack only as text).
    scripts: [...document.scripts].filter((s) => s.textContent?.trim().startsWith('__ran')).length,
    refused: window.__refused,
    text: document.body.innerText,
  }));

/** The raw answer for an address: the attack must never be in it as it was typed. */
async function rawProblems(address, cookie) {
  const answer = await fetch(origin + address, { headers: cookie ? { cookie } : {} });
  const body = await answer.text();
  return Object.entries(typed)
    .filter(([, text]) => body.includes(text) || body.includes(text.replaceAll("'", '&#x27;')))
    .map(([field]) => field);
}

/**
 * Opens `address` as `who` and checks it holds the attack only as text; `shows` lists the
 * fields whose text must be on the page, as typed.
 */
async function looked(who, address, shows = []) {
  const label = `${who === null ? 'a visitor' : who === owner ? 'the owner' : 'the scorekeeper'} at ${address}`;
  for (const withoutPolicy of [true, false]) {
    const context = await contextFor(who, { withoutPolicy });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const dialogs = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    try {
      await page.goto(origin + address);
      await page.waitForFunction(() => Array.isArray(self.__next_f));
      // A moment for anything the page's own scripts draw after it arrived.
      await page.waitForTimeout(300);
      const found = await harm(page);
      if (withoutPolicy) {
        note(
          `${label}: with the script policy off, no script of the attack ran`,
          found.ran === null && dialogs.length === 0,
          found.ran ?? dialogs.join(),
        );
        note(
          `${label}: with the script policy off, the attack made no element`,
          found.made.length === 0 && found.scripts === 0,
          found.made.join(' | '),
        );
        for (const field of shows) {
          note(`${label}: the ${field} text is shown as typed`, found.text.includes(typed[field]));
        }
      } else {
        note(
          `${label}: with the policy on, the browser had nothing to refuse`,
          found.refused.length === 0 && found.ran === null && found.made.length === 0,
          [...found.refused, ...found.made].join('; '),
        );
      }
    } finally {
      await context.close();
    }
  }
  const raw = await rawProblems(address, who === null ? undefined : `srl_session=${who}`);
  note(`${label}: the raw answer holds no attack unescaped`, raw.length === 0, raw.join(', '));
}

/** Every free-text field on `address`, by name ('{id}' for an id in it). */
async function freeTextFields(address, who) {
  const html = await (
    await fetch(origin + address, { headers: who === null ? {} : { cookie: `srl_session=${who}` } })
  ).text();
  const names = new Set();
  for (const [tag] of html.matchAll(/<(?:input|textarea)\b[^>]*>/g)) {
    const type =
      /\btype="([^"]*)"/.exec(tag)?.[1] ?? (tag.startsWith('<textarea') ? 'textarea' : 'text');
    const skipped = [
      'hidden',
      'submit',
      'button',
      'checkbox',
      'radio',
      'number',
      'date',
      'time',
      'color',
      'file',
      'password',
    ];
    if (skipped.includes(type)) continue;
    const name = /\bname="([^"]*)"/.exec(tag)?.[1] ?? '(no name)';
    names.add(
      name.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '{id}'),
    );
  }
  return names;
}

let teamAdmin = '';
let boxScore = '';
/** Tigers at Lions, with no score yet: made final by hand, then reopened with the attack. */
const decidedGame = '01900000-0000-7000-8000-006a00000001';

if (browser) {
  const context = await contextFor(owner);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  /** Taps and waits for the page it leads to. */
  const tap = async (locator, url) => {
    await Promise.all([page.waitForURL(url), locator.click()]);
  };

  await step('a team is added with the attack as its name', async () => {
    await page.goto(`${origin}/north-valley/admin/teams`);
    const form = page.locator('form', { has: page.getByRole('button', { name: 'Add team' }) });
    await form.locator('input[name=name]').fill(typed.team);
    await form.locator('input[name=shortName]').fill('harmful-text');
    const division = form.locator('select[name=divisionId]');
    if ((await division.count()) > 0) {
      const first = await division
        .locator('option')
        .evaluateAll((options) => options.find((o) => o.value !== '')?.value ?? '');
      await division.selectOption(first);
    }
    await tap(form.getByRole('button', { name: 'Add team' }), /done=created/);
    teamAdmin = new URL(page.url()).pathname;
  });

  await step('a person is added with the attack as both names', async () => {
    const form = page.locator('form', { has: page.locator('input[name=firstName]') });
    await form.locator('input[name=firstName]').fill(typed.first);
    await form.locator('input[name=lastName]').fill(typed.last);
    await form.locator('input[name=jerseyNumber]').fill('7');
    await Promise.all([
      page.waitForLoadState('load'),
      form.getByRole('button', { name: 'Add the person and put them on the roster' }).click(),
    ]);
    await page.getByText(typed.first).first().waitFor();
    // A jersey number that is not one is refused, and the page still holds it as text.
    const again = page.locator('form', { has: page.locator('input[name=firstName]') });
    await again.locator('input[name=firstName]').fill('Made-up');
    await again.locator('input[name=lastName]').fill('Numberless');
    await again.locator('input[name=jerseyNumber]').evaluate((input, text) => {
      input.removeAttribute('pattern');
      input.removeAttribute('maxlength');
      input.value = text;
    }, attack('jersey'));
    await again.evaluate((form) => {
      form.noValidate = true;
    });
    await Promise.all([
      page.waitForLoadState('load'),
      again.getByRole('button', { name: 'Add the person and put them on the roster' }).click(),
    ]);
    const found = await harm(page);
    note(
      'a refused jersey number made no element',
      found.made.length === 0 && found.ran === null,
      found.made.join(' | '),
    );
  });

  await step('a round is renamed with the attack', async () => {
    await page.goto(`${origin}/north-valley/admin/schedule`);
    // The rename form is inside the round's "Change or remove this round", shut at first.
    await page.getByText('Change or remove this round').first().click();
    const form = page
      .locator('form', { has: page.locator('button', { hasText: 'Rename round' }) })
      .first();
    await form.locator('input[name=label]').fill(typed.round);
    await form.locator('button', { hasText: 'Rename round' }).click();
    await page.getByText(typed.round).first().waitFor();
  });

  await step('a file whose name, venue and court are the attack is imported', async () => {
    await page.goto(`${origin}/north-valley/admin/schedule/import`);
    const file = [
      'Date,Time,Home,Away,Venue,Court,Home score,Away score',
      `2027-01-09,18:00,Lions,Tigers,${typed.venue},${typed.court},,`,
    ].join('\n');
    await page.getByLabel('Spreadsheet file (CSV)').setInputFiles({
      name: typed.file,
      mimeType: 'text/csv',
      buffer: Buffer.from(file),
    });
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get('done') === 'upload'),
      page.getByRole('button', { name: 'Upload and check' }).click(),
    ]);
    // The venue is not one of the season's: the row is left out, its venue quoted, cut short.
    await page.getByText('1 row will be left out').waitFor();
    const found = await harm(page);
    note(
      'the import report shows the file name as typed',
      found.text.includes(`File: ${typed.file}`),
    );
    note(
      'the import report quotes the venue as typed',
      found.text.includes(typed.venue.slice(0, 40)),
    );
    note(
      'the import report made no element',
      found.made.length === 0 && found.ran === null && found.refused.length === 0,
      [...found.made, ...found.refused].join(' | '),
    );
  });

  await step('a box score with the attack in its numbers is refused as text', async () => {
    await page.goto(`${origin}/north-valley/admin/games`);
    const box = page.locator('a[href*="/north-valley/admin/games/"]').first();
    await tap(box, /\/north-valley\/admin\/games\/[0-9a-f-]+/);
    boxScore = new URL(page.url()).pathname;
    const save = page.getByRole('button', { name: /Save box score/ });
    note('the first game of the games list has a box score to type into', (await save.count()) > 0);
    if ((await save.count()) === 0) return;
    const form = page.locator('form', { has: save });
    await form.evaluate((element, text) => {
      element.noValidate = true;
      for (const input of element.querySelectorAll(
        'input[name^="stat."], input[name^="minutes."]',
      )) {
        input.removeAttribute('pattern');
        input.removeAttribute('maxlength');
        input.value = text;
        break;
      }
    }, attack('stat'));
    await save.first().click();
    await page.waitForTimeout(1000);
    const found = await harm(page);
    note(
      'a refused box score made no element',
      found.made.length === 0 && found.ran === null && found.refused.length === 0,
      [...found.made, ...found.refused].join(' | '),
    );
  });

  await step('a result is reopened with the attack as its reason', async () => {
    // The made-up world starts with no game decided on the games list's first screen (since
    // step 2.37 part 1): one is made final by hand first, as a scheduler would, and then
    // corrected from its own "Correct this result".
    await page.goto(`${origin}/north-valley/admin/games`);
    const game = page.locator(`li[id="game-${decidedGame}"]`);
    await game.getByText('Enter the final score').click();
    await game.getByLabel('Score for Tigers').fill('47');
    await game.getByLabel('Score for Lions').fill('51');
    await game.getByRole('button', { name: 'Save final score' }).click();
    await game.getByRole('button', { name: 'Yes, make it final' }).click();
    const correct = game.getByRole('link', { name: 'Correct this result' });
    await correct.waitFor();
    await tap(correct, (url) => url.pathname === `/north-valley/admin/games/${decidedGame}`);
    const reason = page.getByLabel(
      'Why it needs correcting (kept in the log, never shown publicly)',
    );
    await reason.fill(typed.reason);
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/north-valley/admin/games'),
      page.getByRole('button', { name: 'Reopen to correct' }).click(),
    ]);
    // Reopened: the game has its score boxes again, and the list holds the reason only as text.
    await game.getByLabel('Score for Tigers').waitFor();
    const found = await harm(page);
    note(
      'the games list, the result reopened with the attack as its reason, made no element',
      found.made.length === 0 && found.ran === null && found.refused.length === 0,
      [...found.made, ...found.refused].join(' | '),
    );
  });

  await step('the email boxes refuse the attack as text', async () => {
    for (const address of ['/signin', '/signup', '/signin/forgot']) {
      await page.goto(origin + address);
      const form = page.locator('form', { has: page.locator('input[name=email]') }).first();
      await form.evaluate((element) => {
        element.noValidate = true;
      });
      await form.locator('input[name=email]').fill(attack('email'));
      const password = form.locator('input[name=password]');
      if ((await password.count()) > 0) await password.fill('not the password');
      await Promise.all([
        page.waitForLoadState('load'),
        form.locator('button[type=submit]').click(),
      ]);
      await page.waitForTimeout(500);
      const found = await harm(page);
      note(
        `${address}: a refused email made no element`,
        found.made.length === 0 && found.ran === null && found.refused.length === 0,
        [...found.made, ...found.refused].join(' | '),
      );
    }
  });
  await context.close();

  await step("a name typed at the scorer's table is the attack", async () => {
    await addPlayers(origin, { home: [['55', typed.table]], away: [] }, liveGame);
  });

  // Every page that shows the text, as each person who sees it.
  const visitorPages = [
    ['/north-valley', []],
    ['/north-valley/teams', ['team']],
    ['/north-valley/teams/harmful-text', ['team', 'first']],
    ['/north-valley/schedule', []],
    ['/north-valley/standings', []],
    ['/north-valley/stats', []],
    [`/north-valley/games/${liveGame}`, []],
    [`/north-valley/schedule?season=${encodeURIComponent(typed.query)}`, []],
    [`/signin?next=${encodeURIComponent(`/${typed.query}`)}`, []],
    [`/signin?problem=${encodeURIComponent(typed.query)}`, []],
  ];
  for (const [address, shows] of visitorPages) {
    await step(`a visitor opens ${address}`, () => looked(null, address, shows));
  }
  const ownerPages = [
    ['/north-valley/admin', []],
    ['/north-valley/admin/teams', ['team']],
    [teamAdmin, ['team', 'first', 'last']],
    ['/north-valley/admin/schedule', ['round']],
    ['/north-valley/admin/games', []],
    [boxScore, []],
    // The reopened game's own page: wherever the reason would be shown, it is text.
    [`/north-valley/admin/games/${decidedGame}`, []],
    ['/north-valley/teams/harmful-text', ['team', 'first', 'last']],
  ];
  for (const [address, shows] of ownerPages) {
    if (address === '') continue;
    await step(`the owner opens ${address}`, () => looked(owner, address, shows));
  }
  await step('the scorekeeper opens the scoring screen', () =>
    looked(keeper, `/north-valley/score/${liveGame}`, []),
  );
  await step("the scorer's table name is shown as typed on the team's admin page", async () => {
    const teams = await (
      await fetch(`${origin}/north-valley/admin/teams`, {
        headers: { cookie: `srl_session=${owner}` },
      })
    ).text();
    const pages = [
      ...new Set(
        [...teams.matchAll(/href="(\/north-valley\/admin\/teams\/[0-9a-f-]+)"/g)].map((m) => m[1]),
      ),
    ];
    let shownOn = '';
    for (const address of pages) {
      const html = await (
        await fetch(origin + address, { headers: { cookie: `srl_session=${owner}` } })
      ).text();
      if (
        html.includes(
          typed.table
            .replaceAll('"', '&quot;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll("'", '&#x27;'),
        )
      )
        shownOn = address;
    }
    note("the scorer's table name is on a team's admin page", shownOn !== '');
    if (shownOn !== '') await looked(owner, shownOn, ['table']);
  });

  // Every free-text field on these pages is one this test types into.
  await step('every free-text field is one this test types into', async () => {
    const pages = [
      [owner, '/north-valley/admin', null],
      [owner, '/north-valley/admin/teams', '/north-valley/admin/teams'],
      [owner, teamAdmin, '/north-valley/admin/teams/{id}'],
      [owner, '/north-valley/admin/schedule', '/north-valley/admin/schedule'],
      [owner, '/north-valley/admin/schedule/import', null],
      [owner, '/north-valley/admin/games', null],
      [owner, boxScore, '/north-valley/admin/games/{id}'],
      [owner, '/north-valley/admin/settings', null],
      [owner, '/north-valley/admin/season', null],
      [owner, '/account', null],
      [null, '/signin', '/signin'],
      [null, '/signup', '/signup'],
      [null, '/signin/forgot', '/signin/forgot'],
      [null, '/north-valley', null],
      [null, '/north-valley/teams/harmful-text', null],
    ];
    // Each admin area the menu offers is opened too.
    const home = await (
      await fetch(`${origin}/north-valley/admin`, { headers: { cookie: `srl_session=${owner}` } })
    ).text();
    for (const [, area] of home.matchAll(/href="(\/north-valley\/admin\/[a-z/-]+)"/g)) {
      if (!pages.some(([, address]) => address === area)) pages.push([owner, area, null]);
    }
    for (const [who, address, key] of pages) {
      if (address === '') continue;
      const known = key === null ? {} : (FIELDS[key] ?? {});
      const found = await freeTextFields(address, who);
      for (const name of found) {
        note(
          `${address}: the free-text field "${name}" is one this test types into`,
          Object.hasOwn(known, name),
        );
      }
      // The page was read: a page this test types into shows at least one of its fields.
      if (key !== null) note(`${address}: its fields were found`, found.size > 0);
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Harmful text browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Harmful text browser test passed (${checked.length} checks).`);
