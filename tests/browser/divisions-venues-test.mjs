// Step 2.49: Admin → Season settings → Divisions and Admin → Schedule → Venues, in a real
// browser at phone width (390), by taps, with scripts on and with scripts off, against the
// web app on its made-up stand-in (APP_ENV=test). Nothing leaves this computer; every
// league, team, venue and person is made up. Builds the app first unless given --no-build.
//
// The owner of the first made-up league (two divisions, East and West, each holding teams;
// two venues, Central Gym with two courts that have games to come and Riverside Hall with
// one court):
// - adds two divisions, each answered "Added: …" in its own panel, on the screen; a third
//   with a name already taken (in other capitals) is refused beside the name box, which
//   still holds what was typed and is marked; renames one and gives it a color; moves it
//   up; a reload says nothing again and nothing of any answer is in the address;
// - sees that East, which holds teams, offers no remove button and says why, with the way
//   to Teams; removes a new division after the tick and is answered "Removed: …" with "Put
//   it back", which brings it back;
// - from the admin's home, by the menu and Schedule's "Venues and courts", adds a venue
//   (a map link that is not https is refused beside its box first, kept), then two courts;
// - sees that Central Gym's courts, with games to come, offer no remove button and say how
//   many; that a venue with courts offers none either; removes a court with no games after
//   the tick and puts it back;
// - with scripts off: a refused division name kept and marked, a division added and said
//   "Added", a venue and a court added, a court removed and put back.
// A scheduler is refused the divisions screen and may use the venues screen. Each screen
// passes the accessibility checks and nothing scrolls sideways at 390.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
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

const phone = { width: 390, height: 844 };
const league = 'north-valley';
const run = Date.now().toString(36).slice(-4);

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
const divisionsAt = `${origin}/${league}/admin/season/divisions`;

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server and the browser', async () => {
    const owner = 'srl_session=local-owner-token';
    await waitFor(`${origin}/`, server, [
      { address: `/${league}/admin`, cookie: owner },
      { address: `/${league}/admin/season/divisions`, cookie: owner },
      { address: `/${league}/admin/schedule/venues`, cookie: owner },
    ]);
    browser = await launch();
  });
}

async function signedInAs(token, options = {}) {
  const context = await browser.newContext({ viewport: phone, ...options });
  await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  return { context, page };
}

/** Whether the element is on the screen without scrolling and not under the header. */
const seenWhole = (locator) =>
  locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight || box.height === 0) return false;
    const atCentre = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return atCentre !== null && el.contains(atCentre);
  });

async function accessible(page, label) {
  // The pointer is taken off whatever it last tapped, so a button is read as it rests.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
  const [width, inner] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  note(`no sideways scrolling at 390: ${label}`, width <= inner, `${width} > ${inner}`);
}

const division = (page, name) => page.locator(`section[data-division="${name}"]`);
const venue = (page, name) => page.locator(`section[data-venue="${name}"]`);
const court = (page, venueName, name) => venue(page, venueName).locator(`[data-court="${name}"]`);

/** Taps a form's button and waits for the answer: a page load with scripts off, else `then`. */
async function tap(page, button, then, scripts) {
  if (scripts) {
    await button.click();
    await then.waitFor();
  } else {
    await Promise.all([page.waitForEvent('load'), button.click()]);
    await then.waitFor();
  }
}

/** Checks a "said" line: its words, on the screen at 390, and nothing in the address. */
async function checkSaid(page, label, line, words) {
  const text = ((await line.textContent()) ?? '').trim();
  note(`${label}: says "${words}"`, text.startsWith(words), text);
  note(`${label}: said where the phone is looking`, await seenWhole(line));
  note(
    `${label}: nothing of the answer is in the address`,
    new URL(page.url()).search === '' || /^\?season=[a-z0-9-]+$/.test(new URL(page.url()).search),
    page.url(),
  );
}

/** Adds a division by the add form; returns its panel. */
async function addDivision(page, name, scripts) {
  const form = page.locator('form[data-form="add"]');
  await form.getByLabel('Name').fill(name);
  const panel = division(page, name);
  await tap(
    page,
    form.getByRole('button', { name: 'Add the division' }),
    panel.getByRole('status'),
    scripts,
  );
  return panel;
}

async function divisionsWithScripts() {
  const { context, page } = await signedInAs('local-owner-token');
  await page.goto(divisionsAt);
  await page.getByRole('heading', { level: 1, name: 'Divisions' }).waitFor();
  await accessible(page, 'divisions');
  note(
    'the season’s two divisions are listed, East then West',
    JSON.stringify(
      await page
        .locator('section[data-division]')
        .evaluateAll((s) => s.map((x) => x.dataset.division)),
    ) === JSON.stringify(['East', 'West']),
  );
  // The main action leads to the add form.
  await page.getByRole('link', { name: 'Add a division' }).click();
  const north = await addDivision(page, `North ${run}`, true);
  await checkSaid(
    page,
    'adding the first division',
    north.getByRole('status'),
    `Added: North ${run}.`,
  );
  const south = await addDivision(page, `South ${run}`, true);
  await checkSaid(
    page,
    'adding the second division',
    south.getByRole('status'),
    `Added: South ${run}.`,
  );
  note(
    'both new divisions are listed after East and West',
    JSON.stringify(
      await page
        .locator('section[data-division]')
        .evaluateAll((s) => s.map((x) => x.dataset.division)),
    ) === JSON.stringify(['East', 'West', `North ${run}`, `South ${run}`]),
  );

  // A name taken, in other capitals: refused beside the box, kept, marked.
  const add = page.locator('form[data-form="add"]');
  await add.getByLabel('Name').fill(`NORTH ${run}`);
  await add.getByRole('button', { name: 'Add the division' }).click();
  const problem = add.getByRole('alert');
  await problem.waitFor();
  note(
    'a taken name is refused in words',
    ((await problem.textContent()) ?? '').includes('Another division of this season has that name'),
    (await problem.textContent()) ?? '',
  );
  const box = add.getByLabel('Name');
  note('the refused name is still in its box', (await box.inputValue()) === `NORTH ${run}`);
  note(
    'the name box is marked and described by the refusal',
    (await box.getAttribute('aria-invalid')) === 'true' &&
      (await box.getAttribute('aria-describedby')) === (await problem.getAttribute('id')),
  );
  note('the refusal is on the screen at 390', await seenWhole(problem));
  await accessible(page, 'divisions, a name refused');

  // Rename and color.
  const change = south.locator('form[data-form="change"]');
  await change.getByLabel('Name').fill(`Southern ${run}`);
  await change.getByLabel('Use the league’s own colors').uncheck();
  await change.getByLabel('Color', { exact: true }).fill('#1f7a4d');
  const southern = division(page, `Southern ${run}`);
  await tap(page, change.getByRole('button', { name: 'Save' }), southern.getByRole('status'), true);
  await checkSaid(
    page,
    'renaming a division',
    southern.getByRole('status'),
    `Saved: Southern ${run}.`,
  );
  note(
    'its color is saved',
    (await southern.locator('form[data-form="change"] input[type="color"]').inputValue()) ===
      '#1f7a4d',
  );

  // Order: Southern up, above North.
  await tap(
    page,
    southern.getByRole('button', { name: 'Move up' }),
    southern.getByText(`Moved: Southern ${run}.`),
    true,
  );
  note(
    'a division moved up stands above the one it passed',
    JSON.stringify(
      await page
        .locator('section[data-division]')
        .evaluateAll((s) => s.map((x) => x.dataset.division)),
    ) === JSON.stringify(['East', 'West', `Southern ${run}`, `North ${run}`]),
  );
  await page.reload();
  await page.getByRole('heading', { level: 1, name: 'Divisions' }).waitFor();
  note('a reload says nothing again', (await page.locator('[data-said]').count()) === 0);

  // East holds teams: said up front, no remove button.
  const east = division(page, 'East');
  note(
    'East offers no remove button',
    (await east.getByRole('button', { name: 'Remove the division' }).count()) === 0,
  );
  const held = east.locator('[data-held="teams"]');
  note(
    'East says why it cannot be removed, and the way to Teams',
    ((await held.textContent()) ?? '').includes('East cannot be removed while 3 teams are in it') &&
      (await held.getByRole('link', { name: 'Go to Teams' }).getAttribute('href')) ===
        `/${league}/admin/teams`,
    (await held.textContent()) ?? '',
  );

  // Remove North: tick, tap, "Removed" with "Put it back".
  const north2 = division(page, `North ${run}`);
  await north2.getByLabel(`Yes, remove North ${run}`).check();
  const removed = page.locator('[data-said="removed"]');
  await tap(page, north2.getByRole('button', { name: 'Remove the division' }), removed, true);
  await checkSaid(page, 'removing a division', removed, `Removed: North ${run}.`);
  note(
    'the removed division is gone from the list',
    (await division(page, `North ${run}`).count()) === 0,
  );
  await accessible(page, 'divisions, one removed');
  await tap(
    page,
    removed.getByRole('button', { name: 'Put it back' }),
    division(page, `North ${run}`).getByRole('status'),
    true,
  );
  await checkSaid(
    page,
    'putting a division back',
    division(page, `North ${run}`).getByRole('status'),
    `Put back: North ${run}.`,
  );
  await context.close();
}

async function venuesWithScripts() {
  const { context, page } = await signedInAs('local-owner-token');
  // From the admin's home, by the menu and Schedule's link.
  await page.goto(`${origin}/${league}/admin`);
  await openStaffMenu(page);
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/${league}/admin/schedule`),
    page
      .getByRole('navigation', { name: 'Admin areas' })
      .locator(`a[href="/${league}/admin/schedule"]`)
      .click(),
  ]);
  await Promise.all([
    page.waitForURL((url) => url.pathname === `/${league}/admin/schedule/venues`),
    page.getByRole('link', { name: 'Venues and courts' }).click(),
  ]);
  await page.getByRole('heading', { level: 1, name: 'Venues' }).waitFor();
  await accessible(page, 'venues');

  // Central Gym's courts have games to come: no remove button, the count, the way on.
  for (const name of ['Court 1', 'Court 2']) {
    const part = court(page, 'Central Gym', name);
    note(
      `${name} of Central Gym offers no remove button`,
      (await part.getByRole('button', { name: 'Remove the court' }).count()) === 0,
    );
    const held = ((await part.locator('[data-held="games"]').textContent()) ?? '').trim();
    note(
      `${name} says how many games are still to come on it`,
      /cannot be removed while \d+ games? (are|is) still to come on it/.test(held),
      held,
    );
  }
  note(
    'a venue with courts offers no remove button',
    (await venue(page, 'Central Gym').getByRole('button', { name: 'Remove the venue' }).count()) ===
      0,
  );

  // A venue: a map link that is not https refused first, beside its box, kept.
  const hall = `Test Hall ${run}`;
  const add = page.locator('form[data-form="add-venue"]');
  await add.getByLabel('Name').fill(hall);
  await add.getByLabel('Map link (if you like)').fill('http://maps.example.test/hall');
  await add.getByRole('button', { name: 'Add the venue' }).click();
  const problem = add.getByRole('alert');
  await problem.waitFor();
  const link = add.getByLabel('Map link (if you like)');
  note(
    'a map link that is not https is refused in words',
    ((await problem.textContent()) ?? '').includes('starts with https://'),
  );
  note(
    'the map link box is marked, and both boxes keep what was typed',
    (await link.getAttribute('aria-invalid')) === 'true' &&
      (await link.inputValue()) === 'http://maps.example.test/hall' &&
      (await add.getByLabel('Name').inputValue()) === hall,
  );
  await accessible(page, 'venues, a map link refused');
  await link.fill('https://maps.example.test/hall');
  const panel = venue(page, hall);
  await tap(
    page,
    add.getByRole('button', { name: 'Add the venue' }),
    panel.getByRole('status'),
    true,
  );
  await checkSaid(
    page,
    'adding a venue',
    panel.getByRole('status'),
    `Added: ${hall}. Now add its courts.`,
  );

  for (const name of ['Court 1', 'Court 2']) {
    const form = venue(page, hall).locator('form[data-form="add-court"]');
    await form.getByLabel('Court name').fill(name);
    await tap(
      page,
      form.getByRole('button', { name: 'Add the court' }),
      court(page, hall, name).getByRole('status'),
      true,
    );
    await checkSaid(
      page,
      `adding ${name}`,
      court(page, hall, name).getByRole('status'),
      `Added: ${name}.`,
    );
  }
  note(
    'the new venue lists its two courts in order',
    JSON.stringify(
      await venue(page, hall)
        .locator('[data-court]')
        .evaluateAll((c) => c.map((x) => x.dataset.court)),
    ) === JSON.stringify(['Court 1', 'Court 2']),
  );

  // Court 2 has no games: removed after the tick, and put back.
  const two = court(page, hall, 'Court 2');
  await two.getByLabel('Yes, remove Court 2').check();
  const removed = venue(page, hall).locator('[data-said="removed"]');
  await tap(page, two.getByRole('button', { name: 'Remove the court' }), removed, true);
  await checkSaid(page, 'removing a court', removed, 'Removed: Court 2.');
  note('the removed court is gone', (await court(page, hall, 'Court 2').count()) === 0);
  await tap(
    page,
    removed.getByRole('button', { name: 'Put it back' }),
    court(page, hall, 'Court 2').getByRole('status'),
    true,
  );
  await checkSaid(
    page,
    'putting a court back',
    court(page, hall, 'Court 2').getByRole('status'),
    'Put back: Court 2.',
  );
  await accessible(page, 'venues, after the changes');
  await context.close();
}

async function withScriptsOff() {
  const { context, page } = await signedInAs('local-owner-token', { javaScriptEnabled: false });
  await page.goto(divisionsAt);
  const add = page.locator('form[data-form="add"]');
  await add.getByLabel('Name').fill('east');
  await Promise.all([
    page.waitForEvent('load'),
    add.getByRole('button', { name: 'Add the division' }).click(),
  ]);
  const problem = page.locator('form[data-form="add"]').getByRole('alert');
  await problem.waitFor();
  note(
    'scripts off: a taken name is refused beside the box',
    ((await problem.textContent()) ?? '').includes('Another division'),
  );
  note(
    'scripts off: the refused name is kept in its box',
    (await page.locator('form[data-form="add"]').getByLabel('Name').inputValue()) === 'east',
  );
  const off = await addDivision(page, `Offline ${run}`, false);
  await checkSaid(
    page,
    'scripts off: adding a division',
    off.getByRole('status'),
    `Added: Offline ${run}.`,
  );
  await accessible(page, 'divisions, scripts off');

  await page.goto(`${origin}/${league}/admin/schedule/venues`);
  const hall = `Quiet Hall ${run}`;
  const addVenue = page.locator('form[data-form="add-venue"]');
  await addVenue.getByLabel('Name').fill(hall);
  await tap(
    page,
    addVenue.getByRole('button', { name: 'Add the venue' }),
    venue(page, hall).getByRole('status'),
    false,
  );
  await checkSaid(
    page,
    'scripts off: adding a venue',
    venue(page, hall).getByRole('status'),
    `Added: ${hall}.`,
  );
  const addCourt = venue(page, hall).locator('form[data-form="add-court"]');
  await addCourt.getByLabel('Court name').fill('Main court');
  await tap(
    page,
    addCourt.getByRole('button', { name: 'Add the court' }),
    court(page, hall, 'Main court').getByRole('status'),
    false,
  );
  const main = court(page, hall, 'Main court');
  await main.getByLabel('Yes, remove Main court').check();
  const removed = venue(page, hall).locator('[data-said="removed"]');
  await tap(page, main.getByRole('button', { name: 'Remove the court' }), removed, false);
  await checkSaid(page, 'scripts off: removing a court', removed, 'Removed: Main court.');
  await tap(
    page,
    removed.getByRole('button', { name: 'Put it back' }),
    court(page, hall, 'Main court').getByRole('status'),
    false,
  );
  note('scripts off: the court is back', (await court(page, hall, 'Main court').count()) === 1);
  await accessible(page, 'venues, scripts off');
  await context.close();
}

async function whoMay() {
  const { context, page } = await signedInAs('local-scheduler-token');
  const refused = await page.goto(divisionsAt);
  note(
    'a scheduler is refused the divisions screen',
    refused?.status() === 403,
    String(refused?.status()),
  );
  const open = await page.goto(`${origin}/${league}/admin/schedule/venues`);
  note('a scheduler may use the venues screen', open?.status() === 200, String(open?.status()));
  note(
    'a scheduler, who cannot restore from the bin, is never offered "Put it back" (no button that could only be refused)',
    (await page.getByRole('button', { name: 'Put it back' }).count()) === 0,
  );
  await context.close();
}

if (browser !== undefined) {
  await step('divisions, scripts on', divisionsWithScripts);
  await step('venues, scripts on', venuesWithScripts);
  await step('scripts off', withScriptsOff);
  await step('who may', whoMay);
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Divisions and venues browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Divisions and venues browser test passed (${checked.length} checks).`);
