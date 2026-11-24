// Step 2.98 (T4 §5 and §12): script-injection strings typed into every text field come out
// as harmless text, in a real browser, against the web app on its made-up stand-in
// (APP_ENV=test). Nothing leaves this computer; every league, team and person is made up.
// Builds the app first unless given --no-build (npm run test:web:browser builds it once in
// web-exit-test.mjs).
//
// An attacker's text is typed, through the screens' own forms as a person would, into every
// field that takes free text: a team's name, a person's first and last names, a round's name,
// a reason to reopen a result, a division's name, a venue's name, address and map link and a
// court's name (step 2.49), an imported file's name and its venue and court, a name typed
// at the scorer's table, the email boxes, and the addresses' own questions (?season=, ?next=,
// ?problem=). Then every page that shows them is opened as a visitor, the owner and the
// scorekeeper, and each must show the text as text: nothing of it became a page element and
// no script of it ran with the script policy (record 081) switched off in the browser, so the
// page's own escaping keeps it text, not the policy; with the policy on, the browser had
// nothing to refuse; and the raw answer never holds it unescaped.
//
// Then (the fix round, F3) it walks EVERY page route, read from the app's own folders, as each
// made-up role that sees a different screen (the owner, a scheduler, a coach, the scorekeeper,
// a signed-in person with no role, a visitor): a page route it does not know (ROUTES), a
// free-text field it does not know (FIELDS) or a field kind it does not know (KINDS) fails
// it. Every field a plain form holds, of every kind (number, date, time, colour and hidden
// fields too), is posted the attack by hand, as a plain form post with no typing, and the
// answer must be a refusal or a harmless page; then every route is opened again, as each
// role and with the attack in its questions, and must hold it only as text. Every answer
// route (route.ts) is fetched as the right roles: JSON must carry the attack as data, CSS
// never. What it cannot reach is printed by name at the end (NOT_COVERED).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addPlayers, court, leagueId, liveGame } from './tracker-driver.mjs';
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
  // The tracker's Players panel (step 2.118): a name typed with a number, and a whole line.
  panelName: attack('panel'),
  panelLine: attack('line'),
  venue: cellAttack('venue'),
  court: cellAttack('court'),
  // A file's name cannot hold a slash: the browser keeps only what follows the last one.
  file: `'><img src=x onerror=__ran='file' data-ran=file>.csv`,
  query: attack('query'),
  // Step 2.49: a division's name, and a venue's name, address and map link and a court's name,
  // typed through the Divisions and Venues screens' own forms. The map link must be a web
  // address with no spaces, so it carries the attack with no spaces after its start.
  division: attack('division'),
  venueName: attack('venueName'),
  venueAddress: attack('venueAddress'),
  mapLink: `https://example.test/${tightAttack('mapLink')}`,
  courtName: attack('courtName'),
  // Step 2.60: the league's site notice, typed on League settings, on every public page.
  notice: attack('notice'),
  // Posted by hand into every field a plain form holds (the fix round, F3).
  posted: attack('posted'),
};

/**
 * Every field that takes free text (a text box, a text area, an email, search, phone or web
 * address box) on any page route, by route and field name ('{id}' for an id in it), with
 * where its text is typed in this test. One that is not here fails the test; one here that
 * no page holds any more fails it too. "posted by hand" means only the plain form post of
 * every field below types into it; every other field kind is posted the attack by hand too
 * (KINDS). Fields that take only digits or an email are typed into: what is refused must come
 * back as harmlessly as what is kept.
 */
const POSTED = 'posted by hand';
/** "Change the format" (step 2.119): its ten typed boxes, drawn only once it is opened. */
const FORMAT_BOXES = [
  'minutes',
  'overtimeMinutes',
  'stopLastSeconds',
  'mercyLead',
  'bonusFouls',
  'doubleBonusFouls',
  'playerFoulLimit',
  'fullTimeouts',
  'shortTimeouts',
  'overtimeTimeouts',
];
const formatBoxes = Object.fromEntries(
  FORMAT_BOXES.map((name) => [name, "the format form's boxes are typed"]),
);
const FIELDS = {
  '/[league]/admin/teams': { name: 'a team is added', shortName: 'a team is added' },
  '/[league]/admin/teams/[team]': {
    name: "a team's own page",
    shortName: "a team's own page",
    firstName: 'a person is added',
    lastName: 'a person is added',
    jerseyNumber: 'a person is added',
  },
  // People: the search box (a plain question, shown back) and the add-a-person form, each
  // posted the attack by hand; what is kept is read back by the walk below.
  '/[league]/admin/people': {
    q: POSTED,
    firstName: POSTED,
    lastName: POSTED,
    contactEmail: POSTED,
  },
  // A person's record in People: each box is posted the attack by hand (the other boxes kept
  // as they were), and the browser walk after the posts reads the person back wherever the
  // name and email are shown: the People list, the record, a team's roster, a public roster.
  '/[league]/admin/people/[person]': {
    firstName: POSTED,
    lastName: POSTED,
    contactEmail: POSTED,
  },
  '/[league]/admin/schedule': { label: 'a round is renamed' },
  // Step 2.49: a venue's and a court's boxes share the name "name"; each is typed into.
  '/[league]/admin/schedule/venues': {
    name: 'a venue and its court are added',
    address: 'a venue and its court are added',
    mapLink: 'a venue and its court are added',
  },
  '/[league]/admin/season/divisions': { name: 'a division is added' },
  // Step 2.56: an adjustment's four counts and its reason (the add form's and the remove
  // form's reason boxes share the name "reason"); a count holding the attack is refused.
  '/[league]/admin/standings': {
    wins: 'an adjustment is added and refused',
    losses: 'an adjustment is added and refused',
    ties: 'an adjustment is added and refused',
    points: 'an adjustment is added and refused',
    reason: 'an adjustment is added and refused',
    // The last part of 2.56: a coin flip's note (its two forms share the name "note").
    note: 'a coin flip is recorded',
  },
  '/[league]/admin/games/[game]': {
    reason: 'a result is reopened',
    awayScore: 'a box score is typed',
    homeScore: 'a box score is typed',
    'minutes.{id}': 'a box score is typed',
    'stat.points.{id}': 'a box score is typed',
    'stat.fg3.{id}': 'a box score is typed',
    'stat.fg1.{id}': 'a box score is typed',
    'stat.fouls.{id}': 'a box score is typed',
    ...formatBoxes,
  },
  // League settings (step 2.60): the site notice, the one text setting, shown on every
  // public page of the league.
  // League settings → Profile (step 2.125): the name and the city are typed; the short
  // name, contact email and time zone, held to a pattern by the browser, are posted by hand.
  '/[league]/admin/settings': {
    value: 'the site notice is typed',
    name: "Profile's boxes",
    slug: "Profile's boxes",
    contactEmail: "Profile's boxes",
    city: "Profile's boxes",
    timeZone: "Profile's boxes",
  },
  // League settings → Admins (step 2.97): the address an invitation is sent to.
  '/[league]/admin/settings/admins': { email: 'the email boxes' },
  '/signin': { email: 'the email boxes' },
  '/signup': { email: 'the email boxes' },
  '/signin/forgot': { email: 'the email boxes' },
  // Only while a sign-up is waiting (step 2.102's fix round): typed in the email boxes' step.
  '/signup/code': { code: 'the email boxes' },
  // The Players panel's boxes have no name: the panel is drawn only once it is opened.
  '/[league]/score/[game]': {
    'players-line': "the Players panel's boxes",
    'players-name': "the Players panel's boxes",
    ...formatBoxes,
  },
};

/**
 * How each kind of field is covered. A kind not here fails the test. 'posted': the attack is
 * posted into it by hand wherever a plain form holds it (a browser would refuse to type it).
 */
const KINDS = {
  text: 'typed (FIELDS)',
  textarea: 'typed (FIELDS)',
  email: 'typed (FIELDS)',
  search: 'typed (FIELDS)',
  tel: 'typed (FIELDS)',
  url: 'typed (FIELDS)',
  hidden: 'posted',
  number: 'posted',
  date: 'posted',
  time: 'posted',
  'datetime-local': 'posted',
  month: 'posted',
  week: 'posted',
  color: 'posted',
  range: 'posted',
  password: 'posted',
  select: 'posted',
  checkbox: 'posted',
  radio: 'posted',
  file: 'typed: a file whose name, venue and court are the attack is imported',
  submit: 'not a field',
  button: 'not a field',
  reset: 'not a field',
  image: 'not a field',
};
const TYPED_KINDS = Object.keys(KINDS).filter((kind) => KINDS[kind] === 'typed (FIELDS)');

/** Every page route of the app, as its folders name it ('/[league]/teams/[team]'). */
const appFolder = fileURLToPath(new URL('../../apps/web/src/app/', import.meta.url));
function routesIn(fileName) {
  const found = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const at = join(folder, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (entry.name === fileName) {
        const parts = relative(appFolder, folder)
          .split(/[\\/]/)
          .filter((part) => part !== '' && !/^\(.*\)$/.test(part));
        found.push({ route: `/${parts.join('/')}`, source: readFileSync(at, 'utf8') });
      }
    }
  };
  walk(appFolder);
  return found.sort((a, b) => a.route.localeCompare(b.route));
}
const pageRoutes = routesIn('page.tsx');
const answerRoutes = routesIn('route.ts');

/** The route a path is served by: the one that fits with the most fixed parts. */
function routeOf(pathname) {
  const given = pathname.split('/').filter(Boolean);
  let best = { route: '(no page)', score: -1 };
  for (const { route } of pageRoutes) {
    const parts = route.split('/').filter(Boolean);
    const rest = parts.at(-1)?.startsWith('[...') ?? false;
    if (rest ? given.length < parts.length : given.length !== parts.length) continue;
    let score = 0;
    const fits = parts.every((part, index) => {
      if (part.startsWith('[')) return true;
      score += 1;
      return part === given[index];
    });
    if (fits && score > best.score) best = { route, score };
  }
  return best.route;
}

/** What the test cannot reach, by name and why: printed at the end, never silently. */
const NOT_COVERED = [
  "the draft league's own roles (admin, registrar, editor, club admin, a program's scheduler, another league's admin): not covered, because this test fills only the first league (\"north-valley\") with the attack and they hold no role there",
  "text a script draws only after a tap (beyond the games list's question, the reopen form, the scorer's table and the Players panel): not covered, because the walk opens each page and reads what it draws on arrival, it does not tap every control",
  'the scorer\'s own Reopen question ("By mistake" beside its reason): not typed into; its reason goes to the reopen answer route, which is posted the attack by hand below',
  'the box score\'s "Put the sheet back as it was" reason (step 2.229): shown only after a box score is reopened and saved again, which the walk does not do; sheet-put-back-test types an attack into it on a refused put back and checks it stays text',
  'the walk of every route runs with the script policy off (the stronger proof: the page itself keeps the text); the policy on is checked on the pages that show typed text',
];

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
const coach = 'local-coach-token';
const stranger = 'local-stranger-token';

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
  return unescapedIn(await answer.text());
}

/** Which of the attack's texts a page's answer holds unescaped (by where it was typed). */
const unescapedIn = (body) =>
  Object.entries(typed)
    .filter(([, text]) => body.includes(text) || body.includes(text.replaceAll("'", '&#x27;')))
    .map(([field]) => field);

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

let teamAdmin = '';
let boxScore = '';
/** Tigers at Lions, with no score yet: made final by hand, then reopened with the attack. */
const decidedGame = '01900000-0000-7000-8000-006a00000001';
/** Fields a step above typed into by their label (the reopen form exists only while decided). */
const typedInto = new Set();
/** Fields a step above saw on a page the walk cannot open as it stands (the code box). */
const seenEarly = [];

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
    const form = page.locator('form[data-form=create-team]');
    await form.locator('input[name=name]').fill(typed.team);
    await form.locator('input[name=shortName]').fill('harmful-text');
    const division = form.locator('select[name=divisionId]');
    if ((await division.count()) > 0) {
      const first = await division
        .locator('option')
        .evaluateAll((options) => options.find((o) => o.value !== '')?.value ?? '');
      await division.selectOption(first);
    }
    await tap(
      form.getByRole('button', { name: 'Add team' }),
      /\/admin\/teams\/[0-9a-f-]{36}(#add-team)?$/,
    );
    // The save is proved by the page itself: the new team's page says so (2.155).
    await page
      .getByRole('status')
      .filter({ hasText: 'was added to the season.' })
      .waitFor({ timeout: 10_000 });
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

  // Step 2.168: the made-up coach (Amal Nasser, the coach token's person) is put on the attack
  // team's roster too, so the coach's own "my teams" read (/my-team) answers with its name.
  await step("the coach is put on the attack team's roster", async () => {
    // The refused jersey number's page may still be finishing its own navigation (it aborted
    // this one once on the lane of step 2.97): once more if so, as the next step does.
    await page.goto(origin + teamAdmin).catch(() => page.goto(origin + teamAdmin));
    const form = page.locator('form', {
      has: page.getByRole('button', { name: 'Add to the roster', exact: true }),
    });
    await form.getByLabel('Person').selectOption({ label: 'Amal Nasser' });
    await tap(form.getByRole('button', { name: 'Add to the roster', exact: true }), /done=added/);
  });

  await step('a round is renamed with the attack', async () => {
    // The refused person's page may still be finishing its own navigation: once more if so.
    await page
      .goto(`${origin}/north-valley/admin/schedule`)
      .catch(() => page.goto(`${origin}/north-valley/admin/schedule`));
    // The rename form is inside the round's "Change or remove this round", shut at first. Once
    // it timed out after the merge of the People screens (the page was replaced by the refused
    // post's own late answer): opened afresh once if so.
    const roundEdit = page.getByText('Change or remove this round').first();
    await roundEdit.click({ timeout: 10_000 }).catch(async () => {
      await page.goto(`${origin}/north-valley/admin/schedule`);
      await roundEdit.click();
    });
    const form = page
      .locator('form', { has: page.locator('button', { hasText: 'Rename round' }) })
      .first();
    await form.locator('input[name=label]').fill(typed.round);
    await form.locator('button', { hasText: 'Rename round' }).click();
    await page.getByText(typed.round).first().waitFor();
  });

  await step('a division is added with the attack as its name', async () => {
    await page.goto(`${origin}/north-valley/admin/season/divisions`);
    const form = page.locator('form', {
      has: page.getByRole('button', { name: 'Add the division', exact: true }),
    });
    await form.locator('input[name=name]').fill(typed.division);
    await form.getByRole('button', { name: 'Add the division', exact: true }).click();
    await page.getByRole('heading', { name: typed.division }).first().waitFor();
  });

  await step('a venue and its court are added with the attack in every box', async () => {
    await page.goto(`${origin}/north-valley/admin/schedule/venues`);
    const form = page.locator('form', {
      has: page.getByRole('button', { name: 'Add the venue', exact: true }),
    });
    await form.locator('input[name=name]').fill(typed.venueName);
    await form.locator('input[name=address]').fill(typed.venueAddress);
    await form.locator('input[name=mapLink]').fill(typed.mapLink);
    await form.getByRole('button', { name: 'Add the venue', exact: true }).click();
    const venue = page
      .locator('section.admin-venue')
      .filter({ has: page.locator('h2', { hasText: typed.venueName }) });
    await venue.waitFor();
    const court = venue.locator('form', {
      has: page.getByRole('button', { name: 'Add the court', exact: true }),
    });
    await court.locator('input[name=name]').fill(typed.courtName);
    await court.getByRole('button', { name: 'Add the court', exact: true }).click();
    await venue.locator('h4', { hasText: typed.courtName }).waitFor();
    note(
      "the venue's map link is kept as typed, only as a link's address",
      (await venue.locator('a[target=_blank]').first().getAttribute('href')) === typed.mapLink,
    );
    const found = await harm(page);
    note(
      'the venues screen, with the attack in every box, made no element',
      found.made.length === 0 && found.ran === null && found.refused.length === 0,
      [...found.made, ...found.refused].join(' | '),
    );
  });

  await step('an adjustment is added and refused with the attack in its boxes', async () => {
    await page.goto(`${origin}/north-valley/admin/standings`);
    const form = page.locator('form[data-form=add-adjustment]');
    // Refused first: every count holds the attack, which is not a number; it comes back as
    // typed, beside its box, as text.
    for (const name of ['wins', 'losses', 'ties', 'points']) {
      await form.locator(`input[name=${name}]`).fill(typed.reason);
    }
    await form.locator('input[name=reason]').fill(typed.reason);
    await form.getByRole('button', { name: 'Add the adjustment', exact: true }).click();
    await form.locator('[data-problem=add-adjustment]').waitFor();
    const refused = await harm(page);
    note(
      'the adjustments form, refused with the attack in every box, made no element',
      refused.made.length === 0 && refused.ran === null && refused.refused.length === 0,
      [...refused.made, ...refused.refused].join(' | '),
    );
    for (const name of ['losses', 'ties', 'points']) {
      await form.locator(`input[name=${name}]`).fill('');
    }
    await form.locator('input[name=wins]').fill('1');
    await form.getByRole('button', { name: 'Add the adjustment', exact: true }).click();
    await page.locator('.admin-adjustment', { hasText: typed.reason }).first().waitFor();
    // Step 2.56, part 4: "Overturn a result" and "Award a game not played" have reason boxes
    // ("reason") of their own; each is typed the attack and saved, and the list shown back.
    for (const [name, button] of [
      ['overturn-result', 'Overturn the result'],
      ['award-game', 'Award the game'],
    ]) {
      const pair = page.locator(`form[data-form=${name}]`);
      const before = await page.locator('.admin-adjustment', { hasText: typed.reason }).count();
      await pair.locator('input[name=reason], textarea[name=reason]').fill(typed.reason);
      await pair.getByRole('button', { name: button, exact: true }).click();
      await page
        .locator('.admin-adjustment', { hasText: typed.reason })
        .nth(before + 1)
        .waitFor();
      const shown = await harm(page);
      note(
        `the ${name} form, saved with the attack as its reason, made no element`,
        shown.made.length === 0 && shown.ran === null && shown.refused.length === 0,
        [...shown.made, ...shown.refused].join(' | '),
      );
    }
  });

  await step('a coin flip is recorded and taken off with the attack in its boxes', async () => {
    // Two new teams that have played nobody share a place: Standings and stats offers a
    // coin flip for them (as in the coin-flip test).
    for (const name of ['Level Partner', 'Level Partner Two']) {
      await page.goto(`${origin}/north-valley/admin/teams`);
      const create = page.locator('form[data-form=create-team]');
      await create.locator('input[name=name]').fill(name);
      await tap(
        create.getByRole('button', { name: 'Add team' }),
        /\/admin\/teams\/[0-9a-f-]{36}(#add-team)?$/,
      );
      // The save is proved by the page itself: the new team's page says so (2.155).
      await page
        .getByRole('status')
        .filter({ hasText: `Saved: ${name} was added to the season.` })
        .waitFor({ timeout: 10_000 });
    }
    await page.goto(`${origin}/north-valley/admin/standings`);
    const set = page.locator('[data-level-set*="Level Partner"]');
    const byHand = set.locator('[data-flip-form=by-hand] form[data-form=record-coin-flip]');
    await byHand.locator('input[name=note]').fill(typed.reason);
    await byHand.getByRole('button', { name: 'Save this order' }).click();
    await page.getByText(/^Saved: a coin flip for /).waitFor();
    const saved = await harm(page);
    note(
      'the coin flip, saved with the attack as its note beside the attack team, made no element',
      saved.made.length === 0 && saved.ran === null && saved.refused.length === 0,
      [...saved.made, ...saved.refused].join(' | '),
    );
    const remove = set.locator('[data-remove-flip] form');
    await remove.locator('[name=reason]').fill(typed.reason);
    await remove.getByLabel('Yes, take this coin flip off').check();
    await remove.getByRole('button', { name: 'Take the coin flip off' }).click();
    await page.getByText(/^Taken off: the coin flip for /).waitFor();
    const taken = await harm(page);
    note(
      'the coin flip, taken off with the attack as its reason, made no element',
      taken.made.length === 0 && taken.ran === null && taken.refused.length === 0,
      [...taken.made, ...taken.refused].join(' | '),
    );
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
    // A game's own page, not Games → Scorekeepers (step 2.56), whose link is at the top.
    const box = page
      .locator('a[href*="/north-valley/admin/games/"]:not([href$="/scorekeepers"])')
      .first();
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
    typedInto.add('/[league]/admin/games/[game] reason');
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
    // First the Admins page's invitation (step 2.97), as the owner whose page this is; then
    // the three sign-in addresses as a visitor: a signed-in person is told they are signed in
    // there, with no email box (step 2.163, L10). The cookies are cleared only between the
    // two, and this context is closed after this step.
    const asOwner = ['/north-valley/admin/settings/admins'];
    const asVisitor = ['/signin', '/signup', '/signin/forgot'];
    for (const address of [...asOwner, ...asVisitor]) {
      if (address === asVisitor[0]) await context.clearCookies();
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
    // The code box shows only while a sign-up is waiting on this device (step 2.102's fix
    // round), so a made-up sign-up is started first, then the attack is typed into the box.
    await context.clearCookies();
    await page.goto(`${origin}/signup`);
    await page.locator('input[name=email]').fill('harmful-text-walk@example.test');
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/signup/code'),
      page.getByRole('button', { name: 'Email me a code' }).click(),
    ]);
    const box = page.locator('form input[name=code]');
    note('/signup/code: with a sign-up waiting, the code box is drawn', (await box.count()) === 1);
    seenEarly.push({
      route: '/signup/code',
      field: { kind: (await box.getAttribute('type')) ?? 'text', name: 'code' },
      inForm: true,
    });
    // Set as a value, past the box's own length limit, as a hand-made post would be.
    await box.evaluate((element, value) => {
      element.removeAttribute('maxlength');
      element.closest('form').noValidate = true;
      element.value = value;
    }, attack('code'));
    await Promise.all([
      page.waitForLoadState('load'),
      page
        .locator('form', { has: page.locator('input[name=code]') })
        .locator('button[type=submit]')
        .click(),
    ]);
    await page.waitForTimeout(500);
    typedInto.add('/signup/code code');
    const found = await harm(page);
    note(
      '/signup/code: a refused code made no element',
      found.made.length === 0 && found.ran === null && found.refused.length === 0,
      [...found.made, ...found.refused].join(' | '),
    );
  });
  await context.close();

  await step("a name typed at the scorer's table is the attack", async () => {
    await addPlayers(origin, { home: [['55', typed.table]], away: [] }, liveGame);
  });

  await step('the site notice is typed as the attack', async () => {
    const ownerContext = await contextFor(owner);
    const settingsPage = await ownerContext.newPage();
    await settingsPage.goto(`${origin}/north-valley/admin/settings`);
    const form = settingsPage.locator('form', {
      has: settingsPage.locator('input[type=text][name=value]'),
    });
    await form.locator('input[name=value]').fill(typed.notice);
    await Promise.all([
      settingsPage.waitForURL(/done=saved/),
      form.locator('button').first().click(),
    ]);
    await ownerContext.close();
  });

  // Step 2.125: League settings → Profile's five boxes, in the empty league so the walk's
  // other pages keep their names. The name and the city are typed, saved and read back as
  // text on the settings page; the league's home draws no markup; the short name, contact email and time
  // zone are posted by hand with the attack and refused.
  await step("Profile's boxes take the attack as text", async () => {
    const ownerContext = await contextFor(owner);
    const page = await ownerContext.newPage();
    const at = `${origin}/still-waters/admin/settings`;
    const limit = { timeout: 60_000 };
    const text = attack('profile');
    const box = (form, name) => page.locator(`form[data-form="${form}"] input[name="${name}"]`);
    for (const [form, name] of [
      ['league-name', 'name'],
      ['league-profile', 'city'],
    ]) {
      await page.goto(at, limit);
      await box(form, name).fill(text);
      await Promise.all([
        page.waitForURL(/done=/, limit),
        page.locator(`form[data-form="${form}"] button`).click(limit),
      ]);
      typedInto.add(`/[league]/admin/settings ${name}`);
    }
    for (const address of [at, `${origin}/still-waters`]) {
      await page.goto(address, limit);
      const ran = await page.evaluate(
        () => globalThis.__ran ?? document.querySelector('[data-ran]')?.getAttribute('data-ran'),
      );
      if (ran !== undefined && ran !== null) throw new Error(`${address} drew Profile as markup`);
      const shown =
        address === at
          ? (await box('league-name', 'name').inputValue(limit)) === text &&
            (await box('league-profile', 'city').inputValue(limit)) === text
          : // The stand-in's public pages draw the cast's name (stand-in-league-sites.ts):
            // the league's home is read only for markup that ran.
            (await page.locator('body').innerText(limit)) !== '';
      if (!shown) {
        throw new Error(`${address} does not show the typed name as text`);
      }
    }
    for (const [form, name] of [
      ['short-name', 'slug'],
      ['league-profile', 'contactEmail'],
      ['league-profile', 'timeZone'],
    ]) {
      await page.goto(at, limit);
      const body = new FormData();
      for (const [field, value] of await page
        .locator(`form[data-form="${form}"] input`)
        .evaluateAll((inputs) =>
          inputs.filter((i) => i.type !== 'checkbox').map((i) => [i.name, i.value]),
        )) {
        if (field !== '') body.set(field, value);
      }
      body.set(name, text);
      const answer = await fetch(at, {
        method: 'POST',
        body,
        headers: { origin, cookie: `srl_session=${owner}` },
        redirect: 'manual',
        signal: AbortSignal.timeout(60_000),
      });
      const to = answer.headers.get('location') ?? '';
      if (!to.includes('problem=')) throw new Error(`the attack in ${name} was not refused: ${to}`);
      typedInto.add(`/[league]/admin/settings ${name}`);
    }
    await ownerContext.close();
  });

  // Every page that shows the text, as each person who sees it.
  const visitorPages = [
    ['/north-valley', ['notice']],
    ['/north-valley/teams', ['team', 'notice']],
    ['/north-valley/teams/harmful-text', ['team', 'first', 'notice']],
    ['/north-valley/schedule', ['notice']],
    ['/north-valley/standings', ['notice']],
    ['/north-valley/stats', ['notice']],
    [`/north-valley/games/${liveGame}`, ['notice']],
    [`/north-valley/schedule?season=${encodeURIComponent(typed.query)}`, ['notice']],
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
    ['/north-valley/admin/season/divisions', ['division']],
    ['/north-valley/admin/schedule/venues', ['venueName', 'venueAddress', 'courtName']],
    ['/north-valley/admin/standings', ['reason']],
    ['/north-valley/standings', ['reason']],
    ['/north-valley/admin/games', []],
    // Step 2.56: Games → Scorekeepers has no box to type in; its names are text.
    ['/north-valley/admin/games/scorekeepers', []],
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
  await step("the Players panel's boxes are typed as the attack", async () => {
    const context = await contextFor(keeper);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}/north-valley/score/${liveGame}`);
      const c = court(page);
      await c.open();
      await c.more.click();
      await page.locator('[data-players-open="more"]').click();
      const team = page.locator('[data-players-team="home"]');
      await team.locator('[data-players-line="home"]').fill(typed.panelLine);
      await team.locator('[data-players-add="home"]').click();
      await team.locator('[data-players-said="home"]').waitFor();
      await team.locator('[data-players-line="home"]').fill('56');
      await team.locator('[data-players-name="home"]').fill(typed.panelName);
      await team.locator('[data-players-add="home"]').click();
      await team.locator('[data-player-row]', { hasText: '#56' }).waitFor();
      await page.waitForTimeout(300);
      const found = await harm(page);
      note(
        'the Players panel: the attack typed in its boxes ran no script and made no element',
        found.ran === null && found.made.length === 0 && found.scripts === 0,
        [found.ran, ...found.made].join(' | '),
      );
      note('the Players panel: the browser had nothing to refuse', found.refused.length === 0);
      note(
        'the Players panel: the name typed is shown as text',
        found.text.includes("onerror=__ran='panel'"),
      );
      typedInto.add('/[league]/score/[game] players-line');
      typedInto.add('/[league]/score/[game] players-name');
    } finally {
      await context.close();
    }
  });
  // Step 2.119: "Change the format" at the tracker's start and in the games area, each of the
  // form's ten typed boxes typed the attack; Save says the format is not one it can keep.
  const formatGame = '01900000-0000-7000-8000-006a00000003'; // Lions at Hawks, no plays
  for (const [who, cookie, address, route] of [
    ['the scorekeeper', keeper, `/north-valley/score/${formatGame}`, '/[league]/score/[game]'],
    ['the owner', owner, `/north-valley/admin/games/${formatGame}`, '/[league]/admin/games/[game]'],
  ]) {
    await step(`${who}: the format form's boxes are typed as the attack`, async () => {
      const context = await contextFor(cookie);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      try {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(origin + address);
        await page.locator('[data-game-format] [data-format-change]:not([disabled])').click();
        const form = page.locator('[data-format-form]');
        await form.waitFor();
        const boxes = form.locator('input:not([type=checkbox])');
        const names = await boxes.evaluateAll((els) => els.map((el) => el.getAttribute('name')));
        for (const name of names) {
          await form.locator(`input[name="${name}"]`).fill(attack(`format-${name}`));
        }
        await form.locator('[data-format-save]').click();
        await form.locator('[role=alert]').waitFor();
        await page.waitForTimeout(300);
        const found = await harm(page);
        note(
          `${who}: the format form's ${names.length} boxes typed the attack ran no script and made no element`,
          names.length === FORMAT_BOXES.length &&
            found.ran === null &&
            found.made.length === 0 &&
            found.scripts === 0,
          [names.join(','), found.ran, ...found.made].join(' | '),
        );
        note(
          `${who}: the format form: the browser had nothing to refuse`,
          found.refused.length === 0,
        );
        for (const name of names) typedInto.add(`${route} ${name}`);
      } finally {
        await context.close();
      }
    });
  }
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
}

/** The made-up roles that each see a different screen of the first league. */
const ROLES = [
  ['the owner', owner],
  ['a scheduler (an admin with a narrower grant)', 'local-scheduler-token'],
  ['a coach', coach],
  ['the scorekeeper', keeper],
  ['a signed-in person with no role', stranger],
  ['a visitor', null],
];
const asWho = (who) => (who === null ? {} : { cookie: `srl_session=${who}` });

/**
 * Every page route, by its folders' name, and the address it is opened at ('' when the
 * address could not be found, which fails). `at` holds the addresses found in the pages.
 */
const ROUTES = {
  '/': () => '/',
  '/account': () => '/account',
  '/account/confirm': () => '/account/confirm',
  '/privacy': () => '/privacy',
  '/signin': () => '/signin',
  '/signin/forgot': () => '/signin/forgot',
  '/signup': () => '/signup',
  '/signup/code': () => '/signup/code',
  '/signup/password': () => '/signup/password',
  '/terms': () => '/terms',
  '/[league]': () => '/north-valley',
  '/[league]/[...missing]': () => `/north-valley/${encodeURIComponent(typed.query)}`,
  '/[league]/admin': () => '/north-valley/admin',
  '/[league]/admin/[...missing]': () => `/north-valley/admin/${encodeURIComponent(typed.query)}`,
  '/[league]/admin/games': () => '/north-valley/admin/games',
  '/[league]/admin/games/[game]': () => boxScore,
  '/[league]/admin/games/scorekeepers': () => '/north-valley/admin/games/scorekeepers',
  '/[league]/admin/people': () => '/north-valley/admin/people',
  '/[league]/admin/people/[person]': (at) => at.person,
  '/[league]/admin/schedule': () => '/north-valley/admin/schedule',
  '/[league]/admin/schedule/import': () => '/north-valley/admin/schedule/import',
  '/[league]/admin/schedule/venues': () => '/north-valley/admin/schedule/venues',
  '/[league]/admin/season': () => '/north-valley/admin/season',
  '/[league]/admin/season/divisions': () => '/north-valley/admin/season/divisions',
  '/[league]/admin/settings': () => '/north-valley/admin/settings',
  '/[league]/admin/settings/activity': () => '/north-valley/admin/settings/activity',
  '/[league]/admin/settings/admins': () => '/north-valley/admin/settings/admins',
  '/[league]/admin/settings/bin': () => '/north-valley/admin/settings/bin',
  '/[league]/admin/standings': () => '/north-valley/admin/standings',
  '/[league]/admin/teams': () => '/north-valley/admin/teams',
  '/[league]/admin/teams/[team]': () => teamAdmin,
  '/[league]/games/[game]': () => `/north-valley/games/${liveGame}`,
  // The invitation's accept page (step 2.97): no link held, so the one "does not work" page.
  '/[league]/invitation': () => '/north-valley/invitation',
  '/[league]/my': () => '/north-valley/my',
  '/[league]/schedule': () => '/north-valley/schedule',
  '/[league]/score/[game]': () => `/north-valley/score/${liveGame}`,
  // The upload of a copy of a game (step 2.70): its one field is a file, read by the page's
  // script and never posted by a form.
  '/[league]/score/[game]/upload': () => `/north-valley/score/${liveGame}/upload`,
  '/[league]/standings': () => '/north-valley/standings',
  '/[league]/stats': () => '/north-valley/stats',
  '/[league]/teams': () => '/north-valley/teams',
  '/[league]/teams/[team]': (at) => at.team,
};

/** Every answer route (route.ts), at its made-up address, and who fetches it. */
const ANSWERS = {
  '/api/v1/health': [null],
  '/api/v1/live': [null, keeper],
  // The tracker kept on the device (step 2.38): its manifest names the league, its
  // worker the pages it keeps; asked signed out and as the scorekeeper.
  '/[league]/score/manifest.webmanifest': [null, keeper],
  '/[league]/score/tracker-worker.js': [null, keeper],
  '/api/v1/leagues/[leagueId]/games/[game]/commands': [keeper, owner],
  // The upload of a copy of a game (step 2.70).
  '/api/v1/leagues/[leagueId]/games/[game]/copy': [keeper, owner],
  // A game's format (step 2.119): every rule, read at the tracker's start and in Games.
  '/api/v1/leagues/[leagueId]/games/[game]/format': [keeper, owner],
  '/api/v1/leagues/[leagueId]/games/[game]/not-started': [keeper, owner],
  '/api/v1/leagues/[leagueId]/games/[game]/reopen': [keeper, owner],
  '/api/v1/leagues/[leagueId]/games/[game]/rosters': [keeper, owner],
  '/api/v1/leagues/[leagueId]/games/[game]/session': [keeper, owner],
  '/api/v1/leagues/[leagueId]/games/[game]/snapshot': [keeper, owner],
  '/api/v1/leagues/[leagueId]/games/[game]/state': [keeper, owner],
  '/api/v1/leagues/[leagueId]/scoring': [keeper, owner],
  // The numbers a page keeps from the public (step 2.46), asked with the attack as its
  // season and team: a question that names nothing is answered "nothing more", whoever asks.
  '/api/v1/leagues/[leagueId]/staff-numbers': [null, owner, coach, stranger],
  // A person's own teams (step 2.168): the coach's carry the attack team's name, a person with
  // no team and a visitor are answered nothing to mark.
  '/api/v1/leagues/[leagueId]/my-team': [null, coach, stranger],
  '/display.css': [null],
  // A fixed text (step 2.93: "do not index" outside production): nothing typed reaches it.
  '/robots.txt': [null],
  '/standalone.css': [null],
  // Its answer sends the browser on to Google: only its first answer is read, never followed.
  '/signin/google': [null],
  // An invitation's link (step 2.97), with the attack as its token: it forwards to the
  // accept page and draws nothing; only its first answer and our own forward are read.
  '/[league]/invitation/[token]': [null, owner],
};

/** Decodes the few entities a server's HTML uses in attribute values. */
const decode = (text) =>
  text
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
const attr = (tag, name) => {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? null : decode(value);
};
const flag = (tag, name) => new RegExp(`\\s${name}(?:[\\s=/>]|$)`).test(tag);
const plainName = (name) =>
  name.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '{id}');

/** The fields in a piece of the server's HTML: kind, name, the value it would send. */
function fieldsIn(html) {
  const fields = [];
  for (const [tag] of html.matchAll(/<input\b[^>]*>/g)) {
    const kind = (attr(tag, 'type') ?? 'text').toLowerCase();
    const ticked = kind === 'checkbox' || kind === 'radio';
    fields.push({
      kind,
      name: attr(tag, 'name'),
      value: attr(tag, 'value') ?? (ticked ? 'on' : ''),
      sent: !ticked || flag(tag, 'checked'),
    });
  }
  for (const [, tag, body] of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
    fields.push({ kind: 'textarea', name: attr(tag, 'name'), value: decode(body), sent: true });
  }
  for (const [, tag, body] of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const options = [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)];
    const chosen = options.find(([, option]) => flag(option, 'selected')) ?? options[0];
    const value = chosen ? (attr(chosen[1], 'value') ?? decode(chosen[2])) : '';
    fields.push({ kind: 'select', name: attr(tag, 'name'), value, sent: true });
  }
  // The framework's own fields (which action a form calls) are not the product's.
  return fields.filter((field) => !field.name?.startsWith('$ACTION'));
}

/** The forms in the server's HTML, with their fields. */
const formsIn = (html) =>
  [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].map(([, tag, body]) => ({
    method: (attr(tag, 'method') ?? 'get').toLowerCase(),
    action: attr(tag, 'action') ?? '',
    fields: fieldsIn(body),
    body,
  }));

/** Reads an answer for at most a few seconds (a live answer never ends), never following it. */
async function readAnswer(url, init = {}) {
  const answer = await fetch(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(4000),
  });
  let body = '';
  const decoder = new TextDecoder();
  try {
    for await (const chunk of answer.body ?? []) body += decoder.decode(chunk, { stream: true });
  } catch {
    // Cut short by the time limit: what arrived is read.
  }
  return { answer, body };
}

/** Posts the attack by hand into one field of a plain form, as `who`; what came back. */
async function postedByHand(who, page, form, field) {
  const target = new URL(form.action === '' ? page : form.action, origin + page);
  const values = [];
  for (const other of form.fields) {
    if (other.name === null) continue;
    if (other === field) values.push([other.name, typed.posted]);
    else if (other.sent) values.push([other.name, other.value]);
  }
  if (!field.sent) values.push([field.name, typed.posted]);
  const headers = { ...asWho(who), origin };
  let first;
  if (form.method === 'get') {
    for (const [name, value] of values) target.searchParams.append(name, value);
    first = await readAnswer(target, { headers });
  } else {
    const body = new FormData();
    for (const [name, value] of values) body.append(name, value);
    // The framework's own fields go back as they were: the form's action is the one called.
    for (const [tag] of form.body.matchAll(/<input\b[^>]*name="\$ACTION[^"]*"[^>]*>/g)) {
      body.append(attr(tag, 'name') ?? '', attr(tag, 'value') ?? '');
    }
    first = await readAnswer(target, { method: 'POST', body, headers });
  }
  const bodies = [first.body];
  const location = first.answer.headers.get('location');
  if (location !== null) {
    const next = new URL(location, target);
    // Only this computer's own answers are followed.
    if (next.origin === origin) bodies.push((await readAnswer(next, { headers: asWho(who) })).body);
  }
  return { status: first.answer.status, location, problems: bodies.flatMap(unescapedIn) };
}

/** The address of a team's page, found in the teams page as a visitor sees it. */
async function addressesFound() {
  const teams = await (await fetch(`${origin}/north-valley/teams`)).text();
  // A person's page in People, as the owner finds it.
  const people = await (
    await fetch(`${origin}/north-valley/admin/people`, { headers: asWho(owner) })
  ).text();
  return {
    team: /href="(\/north-valley\/teams\/[^"/?#]+)"/.exec(teams)?.[1] ?? '',
    person: /href="(\/north-valley\/admin\/people\/[^"/?#]+)"/.exec(people)?.[1] ?? '',
  };
}

/** The questions a page reads (?season=…), from its own source, and the usual ones. */
function questionsOf(source) {
  const names = new Set(['season', 'next', 'problem', 'done', 'email', 'token', 'code', 'q']);
  for (const [, name] of source.matchAll(/\bsearch(?:Params)?\??\.([a-zA-Z]+)\b/g)) names.add(name);
  return [...names];
}

async function walkEveryRoute() {
  // The routes: every one of the app's folders is known, and every known one is still a page.
  for (const { route } of pageRoutes) {
    note(`the page route ${route} is one this test opens`, Object.hasOwn(ROUTES, route));
  }
  for (const route of Object.keys(ROUTES)) {
    note(
      `the route ${route} this test opens is still a page`,
      pageRoutes.some((page) => page.route === route),
    );
  }
  for (const { route } of answerRoutes) {
    note(`the answer route ${route} is one this test fetches`, Object.hasOwn(ANSWERS, route));
  }

  /** Every field seen, by route and name: its kinds, and whether a plain form holds it. */
  const inventory = new Map();
  const saw = (route, field, inForm) => {
    const key = `${route} ${plainName(field.name ?? '(no name)')}`;
    const entry = inventory.get(key) ?? { route, kinds: new Set(), inForm: false };
    entry.kinds.add(field.kind);
    entry.inForm ||= inForm;
    inventory.set(key, entry);
  };
  for (const { route, field, inForm } of seenEarly) saw(route, field, inForm);

  // A. Every route as each role, from the server's answer: no attack unescaped, every field
  // written down, every plain form kept to be posted to.
  let at = await addressesFound();
  const toPost = new Map();
  await step('every route, as each role, is read from the server', async () => {
    for (const { route } of pageRoutes) {
      const address = ROUTES[route]?.(at) ?? '';
      if (!Object.hasOwn(ROUTES, route)) continue;
      note(`${route}: an address to open was found`, address !== '');
      if (address === '') continue;
      await Promise.all(
        ROLES.map(async ([role, who]) => {
          const answer = await fetch(origin + address, { headers: asWho(who) });
          const html = await answer.text();
          const landed = new URL(answer.url).pathname;
          const shown = routeOf(landed);
          const raw = unescapedIn(html);
          note(
            `${role} at ${address}: the raw answer holds no attack unescaped`,
            raw.length === 0,
            raw.join(', '),
          );
          note(
            `${role} at ${address}: the answer is not a server failure`,
            answer.status < 500,
            String(answer.status),
          );
          for (const field of fieldsIn(html)) saw(shown, field, false);
          for (const form of formsIn(html)) {
            for (const field of form.fields) {
              saw(shown, field, true);
              if (field.name === null || KINDS[field.kind] === 'not a field') continue;
              if (field.kind === 'file') continue;
              const key = `${shown} ${plainName(field.name)}`;
              if (!toPost.has(key)) toPost.set(key, { who, role, page: landed, form, field });
            }
          }
        }),
      );
    }
  });

  // B. The attack posted by hand into every field a plain form holds, of every kind.
  await step('every field of a plain form is posted the attack by hand', async () => {
    const posts = [...toPost.entries()];
    for (let start = 0; start < posts.length; start += 6) {
      await Promise.all(
        posts.slice(start, start + 6).map(async ([key, { who, role, page, form, field }]) => {
          const label = `${role}, ${key} (${field.kind}) posted the attack by hand`;
          const back = await postedByHand(who, page, form, field);
          note(
            `${label}: the answer is not a server failure`,
            back.status < 500,
            String(back.status),
          );
          note(
            `${label}: no answer holds the attack unescaped`,
            back.problems.length === 0,
            back.problems.join(', '),
          );
        }),
      );
    }
    note(
      'the walk posted the attack by hand into some fields',
      posts.length > 0,
      String(posts.length),
    );
    console.log(
      `The walk: ${pageRoutes.length} page routes as ${ROLES.length} roles, ${posts.length} fields posted by hand, ${answerRoutes.length} answer routes.`,
    );
  });

  // C. Every route again, in a browser as each role, with the script policy off: whatever was
  // kept from the posts above is shown as text, and the questions too.
  at = await addressesFound();
  // The names posted into People (the add-a-person form and a person's record) are kept, and
  // are read back as text where People shows them.
  await step('the names posted into People are shown as text', async () => {
    await looked(owner, '/north-valley/admin/people', ['posted']);
    await looked(owner, at.person, ['posted']);
  });
  await step('every route, as each role, holds the attack only as text in a browser', async () => {
    const opened = await Promise.all(
      ROLES.map(async ([role, who]) => {
        const context = await contextFor(who, { withoutPolicy: true });
        // Nothing leaves this computer.
        await context.route(
          (url) => url.origin !== origin,
          (request) => request.abort(),
        );
        const page = await context.newPage();
        page.setDefaultTimeout(15_000);
        const dialogs = [];
        page.on('dialog', (dialog) => {
          dialogs.push(dialog.message());
          void dialog.dismiss();
        });
        return { role, who, context, page, dialogs };
      }),
    );
    const look = async ({ role, page, dialogs }, address) => {
      const label = `${role} at ${address.slice(0, 90)}`;
      dialogs.length = 0;
      await page.goto(origin + address);
      await page.waitForFunction(() => Array.isArray(self.__next_f)).catch(() => {});
      await page.waitForTimeout(150);
      const found = await harm(page);
      note(
        `${label}: with the script policy off, nothing of the attack ran or became an element`,
        found.ran === null &&
          dialogs.length === 0 &&
          found.made.length === 0 &&
          found.scripts === 0,
        [found.ran ?? '', ...dialogs, ...found.made].join(' | '),
      );
      for (const field of await page.evaluate(() =>
        [...document.querySelectorAll('input, textarea, select')].map((element) => ({
          kind:
            element.tagName === 'INPUT'
              ? (element.getAttribute('type') ?? 'text').toLowerCase()
              : element.tagName.toLowerCase(),
          name: element.getAttribute('name') ?? element.getAttribute('aria-label') ?? element.id,
          inForm: element.closest('form') !== null,
        })),
      )) {
        if (!field.name?.startsWith('$ACTION'))
          saw(routeOf(new URL(page.url()).pathname), field, field.inForm);
      }
    };
    try {
      for (const { route, source } of pageRoutes) {
        const address = ROUTES[route]?.(at) ?? '';
        if (address === '') continue;
        await Promise.all(opened.map((one) => look(one, address)));
        const questions = questionsOf(source)
          .map((name) => `${name}=${encodeURIComponent(typed.query)}`)
          .join('&');
        const asked = `${address}${address.includes('?') ? '&' : '?'}${questions}`;
        await Promise.all(
          opened.filter(({ who }) => who === owner || who === null).map((one) => look(one, asked)),
        );
        for (const { role, who } of opened.filter(({ who }) => who === owner || who === null)) {
          const raw = await rawProblems(asked, who === null ? undefined : `srl_session=${who}`);
          note(
            `${role} at ${route} with the attack in its questions: the raw answer holds no attack unescaped`,
            raw.length === 0,
            raw.join(', '),
          );
        }
      }
    } finally {
      await Promise.all(opened.map(({ context }) => context.close()));
    }
  });

  // D. Every answer route, as the roles that use it: JSON carries the attack as data, CSS
  // never holds it, and no answer holds it as markup.
  await step('every answer route holds the attack only as data', async () => {
    let carried = false;
    for (const { route, source } of answerRoutes) {
      const address = `${route
        .replace('[leagueId]', leagueId)
        .replace('[league]', 'north-valley')
        .replace('[token]', encodeURIComponent(typed.query))
        .replace('[game]', liveGame)}${
        route.endsWith('/staff-numbers')
          ? `?page=team&season=${encodeURIComponent(typed.query)}&team=${encodeURIComponent(typed.query)}`
          : ''
      }`;
      const methods = ['GET', 'POST'].filter((method) =>
        new RegExp(`export\\s+(?:async\\s+function|const)\\s+${method}\\b`).test(source),
      );
      for (const who of ANSWERS[route] ?? []) {
        for (const method of methods) {
          const label = `${method} ${route} as ${ROLES.find(([, token]) => token === who)?.[0]}`;
          const { answer, body } = await readAnswer(origin + address, {
            method,
            headers: { ...asWho(who), origin, 'content-type': 'application/json' },
            ...(method === 'POST'
              ? {
                  body: JSON.stringify({
                    reason: typed.posted,
                    name: typed.posted,
                    commands: typed.posted,
                  }),
                }
              : {}),
          });
          const type = answer.headers.get('content-type') ?? '';
          note(
            `${label}: the answer is not a server failure`,
            answer.status < 500,
            String(answer.status),
          );
          if (type.includes('json')) {
            let parsed = null;
            try {
              parsed = JSON.parse(body);
            } catch {
              parsed = null;
            }
            note(
              `${label}: its JSON answer is data`,
              parsed !== null || body === '',
              body.slice(0, 80),
            );
            carried ||= body.includes(JSON.stringify(typed.table).slice(1, -1));
            if (route.endsWith('/staff-numbers')) {
              note(
                `${label}: a question holding the attack is answered nothing more`,
                body === '{"more":null}',
                body.slice(0, 80),
              );
            }
            if (route.endsWith('/my-team')) {
              const names = (parsed?.marked ?? []).map((team) => team.name);
              note(
                who === coach
                  ? `${label}: the coach's own teams carry the attack team's name as data`
                  : `${label}: someone with no team of their own is marked no team`,
                who === coach ? names.includes(typed.team) : names.length === 0,
                JSON.stringify(names).slice(0, 120),
              );
            }
          } else if (route.endsWith('/my-team')) {
            note(`${label}: the answer is JSON`, false, type || 'untyped');
          } else if (type.includes('html')) {
            const raw = unescapedIn(body);
            note(
              `${label}: its HTML answer holds no attack unescaped`,
              raw.length === 0,
              raw.join(', '),
            );
          } else {
            note(
              `${label}: its ${type || 'untyped'} answer holds nothing of the attack`,
              !body.includes('__ran'),
            );
          }
        }
      }
    }
    note("a JSON answer carries the scorer's table name as data", carried);
  });

  // E. Every field seen is one this test knows: its kind, and a free-text one by name.
  await step('every field on every route is one this test knows', async () => {
    const scriptOnly = [];
    for (const [key, { route, kinds, inForm }] of inventory) {
      for (const kind of kinds) {
        note(`${key}: the field kind "${kind}" is one this test knows`, Object.hasOwn(KINDS, kind));
        if (TYPED_KINDS.includes(kind)) {
          note(
            `${key}: the free-text field is one this test types into`,
            Object.hasOwn(FIELDS[route] ?? {}, key.slice(route.length + 1)),
          );
        } else if (KINDS[kind] === 'posted' && !inForm) scriptOnly.push(`${key} (${kind})`);
      }
    }
    for (const [route, fields] of Object.entries(FIELDS)) {
      for (const name of Object.keys(fields)) {
        note(
          `FIELDS names ${route} ${name}, and a page holds it`,
          inventory.has(`${route} ${name}`) || typedInto.has(`${route} ${name}`),
        );
      }
    }
    if (process.argv.includes('--list')) {
      for (const [key, { kinds, inForm }] of inventory) {
        console.log(`field: ${key} [${[...kinds].join(',')}]${inForm ? ' form' : ''}`);
      }
    }
    NOT_COVERED.push(
      `fields only a script draws, of a kind posted by hand: not posted, because no plain form holds them: ${scriptOnly.length > 0 ? scriptOnly.join(', ') : 'none found in this run'}`,
    );
  });
}

/**
 * The Publishing part of League settings (step 2.240) draws its form only on a draft whose
 * must-fix items are met, so the walk above, on the live first league, never meets it. Here
 * the draft league (quiet-pines) is put right the owner's way (Names on public pages saved, in
 * a browser), its asking state `?publish=ask` and a question of the attack are read, and every
 * field of the publish form is posted the attack by hand. The league stays a draft.
 */
async function walkThePublishPart() {
  const settings = '/quiet-pines/admin/settings';
  await step("the draft league's Publishing part is asked and posted the attack", async () => {
    const context = await contextFor(owner);
    const page = await context.newPage();
    await page.goto(origin + settings);
    if ((await page.locator('li[data-check="privacyChosen"][data-met="no"]').count()) > 0) {
      const save = page.locator('section[data-setting="privacy.publicNames"] button[type=submit]');
      await Promise.all([page.waitForURL(/done=|problem=/), save.first().click()]);
    }
    await context.close();
    const asked = `${settings}?publish=ask`;
    for (const address of [asked, `${settings}?publish=${encodeURIComponent(typed.query)}`]) {
      const answer = await fetch(origin + address, { headers: asWho(owner) });
      const raw = unescapedIn(await answer.text());
      note(
        `the owner at ${address}: not a server failure`,
        answer.status < 500,
        `${answer.status}`,
      );
      note(`the owner at ${address}: no attack unescaped`, raw.length === 0, raw.join(', '));
    }
    const html = await (await fetch(origin + asked, { headers: asWho(owner) })).text();
    const forms = formsIn(html).filter((form) => form.fields.some((f) => f.name === 'version'));
    const publish = forms.filter((form) => form.body.includes('Publish this league?'));
    note('the asking state draws the publish form', publish.length === 1, `${publish.length}`);
    for (const form of publish) {
      for (const field of form.fields) {
        if (field.name === null || KINDS[field.kind] === 'not a field') continue;
        const label = `the publish form's ${plainName(field.name)} posted the attack by hand`;
        const back = await postedByHand(owner, asked, form, field);
        note(`${label}: not a server failure`, back.status < 500, String(back.status));
        note(`${label}: no attack unescaped`, back.problems.length === 0, back.problems.join(', '));
      }
    }
    const visitor = await fetch(`${origin}/quiet-pines`);
    note('the attack published nothing: a visitor is still told not found', visitor.status === 404);
  });
}

if (browser) await walkEveryRoute();
if (browser) await walkThePublishPart();

await browser?.close();
server?.child.kill();

console.log(`Not covered, by name:\n- ${NOT_COVERED.join('\n- ')}`);
if (failures.length > 0) {
  console.error(`Harmful text browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Harmful text browser test passed (${checked.length} checks).`);
