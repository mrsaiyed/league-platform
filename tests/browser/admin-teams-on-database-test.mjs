// Step 2.93 part 5: Admin → Teams on the made-up database, in a real browser, as a seed
// league's owner signed in through the screens (step 2.96: the code read on the kept
// emails' page). The web app runs on its made-up database (APP_ENV=test,
// LOCAL_DATA=made-up-database): every migration and the two seed leagues in memory, each
// season under way. Nothing leaves this computer; every league, team and person is made up.
// Builds the app first unless given --no-build. The same screens on the stand-in are
// checked by web-exit-test.mjs.
//
// The owner opens Admin → Teams and sees the season's six teams; adds a team and lands on
// its page; adds someone not in the league list with a number, and a person from the list
// with a number and a role; changes a number; marks a player as left and puts them back;
// moves a player up; moves the team to the bin and finds it gone from the list. Every
// change is a plain form, read back from the database. Each page passes the accessibility
// checks; the server's output holds no code and none of the seed's private values.
import {
  accessibilityProblems,
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

const run = Date.now().toString(36);
const seedOwner = 'owner@lakeside.example.test';
const chosenPassword = 'a made-up chosen password';
const teamName = `Database Larks ${run}`;
const newcomer = { first: 'Avery', last: `Newcomer${run}` };
/** The seed's private values (packages/database/src/seed/seed-data.ts): never printed. */
const privateValues = ['1990-04-12', '2012-09-03', '2013-06-02', 'morgan@lakeside.example.test'];
const seasonTeams = [
  'Lakeside Foxes',
  'Lakeside Gulls',
  'Lakeside Herons',
  'Lakeside Otters',
  'Lakeside Owls',
  'Lakeside Pines',
];
/** Today in the seed league's own time zone, yyyy-mm-dd: a leaving date cannot be after it. */
const leagueToday = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}

/** The code in the newest kept email to `address`, read on the kept emails' page. */
async function codeOnThePage(page, origin, address) {
  await page.goto(`${origin}/signin/kept-emails`);
  const email = page.locator(`li[data-kept-email="${address}"]`).first();
  await email.waitFor();
  return (await email.locator('code[data-code]').innerText()).trim();
}

/** Signs `address` up through the screens, with its code read on the kept emails' page. */
async function signUpByTheKeptCode(page, origin, address) {
  await page.goto(`${origin}/signup`);
  await page.getByLabel('Email').fill(address);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/signup/code'),
    page.getByRole('button', { name: 'Email me a code' }).click(),
  ]);
  let code = '';
  for (let tries = 0; tries < 10 && !/^\d{6}$/.test(code); tries += 1) {
    code = await codeOnThePage(page, origin, address).catch(() => '');
  }
  note(`a 6-digit code for ${address} is on the kept emails' page`, /^\d{6}$/.test(code), code);
  await page.goto(`${origin}/signup/code`);
  await page.getByLabel('Code').fill(code);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/signup/password'),
    page.getByRole('button', { name: 'Continue' }).click(),
  ]);
  await page.getByLabel('Password').fill(chosenPassword);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/signup/password'),
    page.getByRole('button', { name: 'Save and sign in' }).click(),
  ]);
  return code;
}

/**
 * Submits the form `button` is in, as a plain form with no script in the page, and waits
 * for the page it is sent back to, whose address must carry `answer`.
 */
async function submit(page, button, answer) {
  await Promise.all([page.waitForEvent('load'), button.click()]);
  if (!answer.test(page.url())) throw new Error(`landed on ${page.url()}, not ${answer}`);
}

/** The roster line (an open one) of a person, by the start of their name. */
const lineOf = (page, name) =>
  page.locator('ol.admin-roster > li').filter({ has: page.getByText(name, { exact: false }) });

const origin = `http://localhost:${await freePort()}`;
const server = built
  ? startNext(['start', '--port', new URL(origin).port], {
      APP_ENV: 'test',
      PUBLIC_BASE_URL: origin,
      LOG_LEVEL: 'debug',
      LOCAL_DATA: 'made-up-database',
    })
  : null;
let browser = null;
let code = '';
if (server !== null) {
  await step('starting the server on the made-up database and the browser', async () => {
    await waitFor(`${origin}/`, server, [{ address: '/lakeside' }]);
    browser = await launch();
  });
}

if (browser !== null) {
  const screen = { width: 390, height: 844 };
  // Signing in uses the screens as a person would; the Teams screens are then used with no
  // script in the page, as plain forms, in the same session.
  const signingIn = await browser.newContext({ viewport: screen });
  let session;
  await step("the seed league's owner signs in by the code on the page", async () => {
    const page = await signingIn.newPage();
    page.setDefaultTimeout(60_000);
    code = await signUpByTheKeptCode(page, origin, seedOwner);
    await page.goto(`${origin}/account`);
    note(
      "signed in as the seed league's owner",
      (await page.getByText(`Signed in as ${seedOwner}`).count()) === 1,
    );
    session = await signingIn.storageState();
  });
  await signingIn.close();
  const context = await browser.newContext({
    viewport: screen,
    javaScriptEnabled: false,
    ...(session === undefined ? {} : { storageState: session }),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  let teamPath = '';

  await step('Admin → Teams lists the season’s teams, read from the database', async () => {
    const response = await page.goto(`${origin}/lakeside/admin/teams`);
    await page.locator('main').first().waitFor();
    note('Admin → Teams answers', response?.status() === 200, String(response?.status()));
    const listed = await page.locator('a.staff-row-link').allInnerTexts();
    note(
      'it lists the six seed teams by name',
      JSON.stringify(listed.filter((name) => name.startsWith('Lakeside'))) ===
        JSON.stringify(seasonTeams),
      listed.join(', '),
    );
    await accessible(page, 'Admin → Teams on the database');
  });

  await step('a team is added and its page opens', async () => {
    await page.getByLabel('Name', { exact: true }).fill(teamName);
    await submit(page, page.getByRole('button', { name: 'Add team' }), /done=created/);
    teamPath = new URL(page.url()).pathname;
    note(
      "the team's own page opens",
      /^\/lakeside\/admin\/teams\/[0-9a-f-]{36}$/.test(teamPath) &&
        (await page.getByRole('heading', { level: 1, name: teamName }).count()) === 1,
      page.url(),
    );
    note('it says the team was added', (await page.getByText('The team was added.').count()) === 1);
    await accessible(page, "a team's page on the database");
  });

  await step('someone new is added to the roster with a number', async () => {
    const form = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Add the person and put them on the roster' }),
    });
    await form.getByLabel('First name').fill(newcomer.first);
    await form.getByLabel('Last name').fill(newcomer.last);
    await form.getByLabel('Jersey number (0 to 99, or 00)').fill('21');
    await submit(
      page,
      form.getByRole('button', { name: 'Add the person and put them on the roster' }),
      /done=added/,
    );
    const line = lineOf(page, `${newcomer.first} ${newcomer.last}`);
    note('the newcomer is on the roster', (await line.count()) === 1);
    note(
      'with the number 21',
      (await line
        .getByLabel('Number')
        .inputValue()
        .catch(() => '')) === '21',
    );
  });

  await step('a person from the league list is added with a number and a role', async () => {
    const form = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Add to the roster' }),
    });
    await form.getByLabel('Person').selectOption({ label: 'Morgan Example' });
    await form.getByLabel('Jersey number (0 to 99, or 00)').fill('8');
    await form.getByLabel('Role').selectOption({ label: 'Captain' });
    await submit(page, form.getByRole('button', { name: 'Add to the roster' }), /done=added/);
    note(
      'it says the player was added',
      (await page.getByText('The player was added to the roster.').count()) === 1,
    );
    const line = lineOf(page, 'Morgan Example');
    note('Morgan Example is on the roster', (await line.count()) === 1);
    note(
      'as captain, with the number 8',
      (await line
        .getByLabel('Role')
        .inputValue()
        .catch(() => '')) === 'captain' &&
        (await line
          .getByLabel('Number')
          .inputValue()
          .catch(() => '')) === '8',
    );
  });

  await step("a player's number is changed", async () => {
    const line = lineOf(page, `${newcomer.first} ${newcomer.last}`);
    await line.getByLabel('Number').fill('22');
    await submit(
      page,
      line.getByRole('button', { name: 'Save number and role' }),
      /done=entrySaved/,
    );
    note(
      'it says the number and role were saved',
      (await page.getByText('The number and role were saved.').count()) === 1,
    );
    note(
      'the number is 22, read back',
      (await lineOf(page, `${newcomer.first} ${newcomer.last}`)
        .getByLabel('Number')
        .inputValue()
        .catch(() => '')) === '22',
    );
  });

  await step('a player is moved up', async () => {
    const names = async () =>
      page.locator('ol.admin-roster > li .admin-roster-name strong').allInnerTexts();
    const before = await names();
    await submit(
      page,
      lineOf(page, 'Morgan Example').getByRole('button', { name: 'Move up' }),
      /done=moved/,
    );
    const after = await names();
    note(
      'Morgan Example is now first',
      after[0] === 'Morgan Example' && before[0] !== 'Morgan Example',
      `${before.join(', ')} → ${after.join(', ')}`,
    );
  });

  await step('a player is marked as left and put back', async () => {
    const name = `${newcomer.first} ${newcomer.last}`;
    const line = lineOf(page, name);
    await line.getByLabel('Left on').fill(leagueToday);
    await submit(page, line.getByRole('button', { name: 'Mark as left' }), /done=left/);
    const left = page.locator('li[data-left-entry]').filter({ hasText: name });
    note('the player is under "Left the team"', (await left.count()) === 1);
    note('and no longer on the roster', (await lineOf(page, name).count()) === 0);
    await submit(
      page,
      left.getByRole('button', { name: 'Put back on the roster (marked by mistake)' }),
      /done=putBack/,
    );
    note('the player is back on the roster', (await lineOf(page, name).count()) === 1);
  });

  await step('the team is moved to the bin, and is gone from the list', async () => {
    await page.goto(`${origin}${teamPath}`);
    const form = page.locator('form').filter({
      has: page.getByRole('button', { name: 'Move the team to the bin' }),
    });
    await form.getByLabel('Yes, I am sure').check();
    await submit(
      page,
      form.getByRole('button', { name: 'Move the team to the bin' }),
      /done=removed/,
    );
    note(
      'back on the list of teams',
      new URL(page.url()).pathname === '/lakeside/admin/teams',
      page.url(),
    );
    const listed = await page.locator('a.staff-row-link').allInnerTexts();
    note('the team is not listed', !listed.includes(teamName), listed.join(', '));
    const gone = await page.goto(`${origin}${teamPath}`);
    note('its page is not found any more', gone?.status() === 404, String(gone?.status()));
  });

  await context.close();
  await browser.close();
}

if (server !== null) {
  server.child.kill();
  const output = server.output();
  note('the server printed no code', code === '' || !output.includes(code));
  for (const value of privateValues) {
    note(
      `the server printed no private value (${value.length} characters)`,
      !output.includes(value),
    );
  }
}

if (failures.length > 0) {
  console.error(`Admin → Teams on the database browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Admin → Teams on the database browser test passed (${checked.length} checks).`);
