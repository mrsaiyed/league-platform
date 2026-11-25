// Step 2.90: Admin → Teams in a real browser with scripts on, on the web app's made-up
// stand-in (APP_ENV=test). Nothing leaves this computer.
// - A new team gets a roster of ten, each with a jersey number, and one of them is marked
//   as having left: nine stay on the roster and the tenth is listed under "left";
// - the league is filled to 250 people (by request, as the People page's own form posts),
//   the 250th by name the last of them: the team's first page of the league list (200)
//   does not offer them and says there is a next page; "Find a person by name" on the
//   server finds them, and they are added to the roster with a number;
// - every answer appears without a reload: the document of the first visit is still the
//   one on the screen at the end, and the search is still shown after the add;
// - an email typed into "Find" is said in words (people are found by name), never put in
//   the address; the team's page draws no "Remove from the league list" (S-128);
// - with scripts OFF: "Next page" is followed and the 250th is on page 2; a search, its
//   next page, a refused add (number "05") and an add all come back to that same search
//   and page, the person chosen and the number typed kept on the refusal.
// `--no-build` serves the build already here.
import {
  answered,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
  worldAtNoon,
} from './web-browser-kit.mjs';

const failures = [];
const checked = [];
const note = (label, ok, detail = '') => {
  checked.push(label);
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
};

let built = true;
if (!process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

const leagueSize = 250;
const teamName = 'Paging Hawks';
const players = Array.from({ length: 10 }, (_, i) => ({
  first: `Ten${String.fromCharCode(97 + i)}`,
  last: 'Rosterly',
  number: String(i + 4),
}));
const lastOne = { first: 'Final', last: 'Zzzzquill' };
/** A made-up last name that sorts after the league's own people: "Zzaa", "Zzab", … */
const filler = (n) =>
  `Zz${String.fromCharCode(97 + (Math.floor(n / 26) % 26))}${String.fromCharCode(97 + (n % 26))}`;

/** How many people the league list holds now, page by page of the People screen. */
async function peopleCount(page, origin) {
  let total = 0;
  for (let n = 1; n <= 20; n += 1) {
    await page.goto(`${origin}/north-valley/admin/people?page=${n}`);
    const rows = await page.locator('main li[data-person]').count();
    total += rows;
    if (rows < 50) return total;
  }
  throw new Error('the People list holds more than 20 pages');
}

/** Posts the People page's "Add a person" form by request, once for each name. */
async function addPeople(page, origin, names) {
  await page.goto(`${origin}/north-valley/admin/people`);
  const form = page.locator('main form', { has: page.locator('input[name=firstName]') });
  const fields = await form.evaluate((element) =>
    Object.fromEntries([...new FormData(element).entries()].map(([k, v]) => [k, String(v)])),
  );
  const statuses = [];
  for (let i = 0; i < names.length; i += 10) {
    const batch = names.slice(i, i + 10).map((name) =>
      page.request.post(page.url(), {
        multipart: {
          ...fields,
          firstName: name.first,
          lastName: name.last,
          requestToken: crypto.randomUUID(),
        },
        headers: { origin },
        maxRedirects: 0,
      }),
    );
    for (const response of await Promise.all(batch)) statuses.push(response.status());
  }
  return statuses;
}

async function journey(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  let teamAddress = '';
  try {
    // Filled to 250 first, so the team's page is drawn on a league of 250.
    const before = await peopleCount(page, origin);
    note('the league holds fewer than 239 people to start', before < leagueSize - 11, `${before}`);
    const fill = Array.from({ length: leagueSize - before - 11 }, (_, n) => ({
      first: 'Paged',
      last: filler(n),
    }));
    const statuses = await addPeople(page, origin, [...fill, lastOne]);
    note(
      'every person posted was added',
      statuses.every((s) => s === 303),
      [...new Set(statuses)].join(', '),
    );

    // A new team, its page reached without a reload from here on.
    await page.goto(`${origin}/north-valley/admin/teams`);
    const create = page.locator('form[data-form=create-team]');
    await create.locator('input[name=name]').fill(teamName);
    await Promise.all([
      page.waitForURL(/\/north-valley\/admin\/teams\/[0-9a-f-]{36}/),
      create.getByRole('button', { name: 'Add team' }).click(),
    ]);
    teamAddress = page.url().split(/[?#]/)[0];
    await page.evaluate(() => {
      window.sameDocument = 'yes';
    });
    const kept = async () => (await page.evaluate(() => window.sameDocument ?? 'no')) === 'yes';

    // Ten players with numbers (each a new person, so the league reaches 250 exactly).
    const roster = page.locator('ol.admin-roster > li');
    const newPlayer = page.locator('form[data-form=new-player]');
    for (const player of players) {
      await newPlayer.locator('input[name=firstName]').fill(player.first);
      await newPlayer.locator('input[name=lastName]').fill(player.last);
      await newPlayer.locator('input[name=jerseyNumber]').fill(player.number);
      await newPlayer
        .getByRole('button', { name: 'Add the person and put them on the roster' })
        .click();
      await answered(page, `${player.first} ${player.last} was added to`, 30_000);
    }
    note('the roster holds ten', (await roster.count()) === 10, String(await roster.count()));
    const numbers = await page
      .locator('ol.admin-roster input[name=jerseyNumber]')
      .evaluateAll((boxes) => boxes.map((box) => box.value));
    note(
      'each of the ten wears their number',
      players.every((p) => numbers.includes(p.number)),
      numbers.join(','),
    );
    note('ten added without a reload', await kept());
    note('the league holds 250 people', (await peopleCountHere()) === leagueSize);

    // One marked as having left: nine stay, the tenth is listed as left.
    const leaver = players[3];
    const line = roster.filter({ hasText: `${leaver.first} ${leaver.last}` });
    const leftOn = line.locator('input[name=leftOn]');
    const latest = await leftOn.getAttribute('max');
    await leftOn.fill(latest ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
    await line.getByRole('button', { name: 'Mark as left' }).click();
    await answered(page, `${leaver.first} ${leaver.last} was marked as having left`, 30_000);
    note('nine stay on the roster', (await roster.count()) === 9, String(await roster.count()));
    note(
      'the one who left is listed as left',
      (await page.locator('[data-left-entry]', { hasText: leaver.first }).count()) === 1,
    );
    note('marked as left without a reload', await kept());

    // The 250th: not on the first page of 200, found by name on the server, added.
    const choose = page.locator('form[data-form=from-list] select[name=personId]');
    const lastName = `${lastOne.first} ${lastOne.last}`;
    // Proved on the select itself: a page that lost it must not pass as "not offered".
    const firstPage = await choose.locator('option').count();
    note(
      'the first page of the league list does not hold the 250th',
      (await choose.count()) === 1 &&
        firstPage > 150 &&
        (await choose.locator('option', { hasText: lastName }).count()) === 0,
      String(firstPage),
    );
    note(
      'the team page offers no "Remove from the league list" (S-128)',
      (await page.getByRole('button', { name: 'Remove from the league list' }).count()) === 0,
    );
    note(
      'the list says there is a next page',
      (await page.locator('[data-person-pages] a', { hasText: 'Next page' }).count()) === 1,
    );
    const find = page.locator('[data-find-person] form');
    await find.locator('input[name=q]').fill('someone@example.test');
    await find.getByRole('button', { name: 'Find', exact: true }).click();
    await page.locator('[data-found-by-name]').waitFor({ timeout: 30_000 });
    note(
      'an email typed into Find is said in words: people are found by name',
      (await page.locator('[data-found-by-name]').innerText()).includes('found here by name'),
    );
    note('the email is not in the address', !page.url().includes('example.test'), page.url());
    note('said without a reload', await kept());
    await find.locator('input[name=q]').fill(lastOne.last);
    await find.getByRole('button', { name: 'Find', exact: true }).click();
    await page.locator('[data-found-for]').waitFor({ timeout: 30_000 });
    const options = await choose.locator('option').allInnerTexts();
    note(
      'the search finds the 250th and only them',
      options.length === 2 && options[1].trim() === lastName,
      options.join(' | '),
    );
    note('found without a reload', await kept());
    await choose.selectOption({ label: lastName });
    await page.locator('form[data-form=from-list] input[name=jerseyNumber]').fill('25');
    await page
      .locator('form[data-form=from-list]')
      .getByRole('button', { name: 'Add to the roster', exact: true })
      .click();
    await answered(page, `${lastName} was added to`, 30_000);
    note(
      'the 250th is on the roster',
      (await roster.filter({ hasText: lastName }).count()) === 1 && (await roster.count()) === 10,
      String(await roster.count()),
    );
    note('added without a reload', await kept());
    note(
      'the search is still shown after the add',
      (await page.locator('[data-found-for]').count()) === 1 &&
        (await find.locator('input[name=q]').inputValue()) === lastOne.last &&
        new URL(page.url()).searchParams.get('q') === lastOne.last,
      page.url(),
    );
  } finally {
    await context.close();
  }
  return teamAddress;

  /** The league's count, read in a page of its own so the team's page stays as it is. */
  async function peopleCountHere() {
    const other = await context.newPage();
    try {
      return await peopleCount(other, origin);
    } finally {
      await other.close();
    }
  }
}

/** The same team's page with scripts OFF: every form a plain post, every answer a page. */
async function scriptsOff(browser, origin, teamAddress) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
  });
  await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const go = async (locator) => {
    await Promise.all([page.waitForEvent('load'), locator.click()]);
  };
  const asked = () => new URL(page.url()).searchParams;
  const fromList = page.locator('form[data-form=from-list]');
  const choose = fromList.locator('select[name=personId]');
  const roster = page.locator('ol.admin-roster > li');
  const lastName = `${lastOne.first} ${lastOne.last}`;
  try {
    await page.goto(teamAddress);
    await go(page.locator('[data-person-pages] a', { hasText: 'Next page' }));
    note('scripts off: "Next page" leads to page 2', asked().get('page') === '2', page.url());
    note(
      'scripts off: the 250th is on a later page of the league list',
      (await choose.locator('option', { hasText: lastName }).count()) === 1 ||
        (await roster.filter({ hasText: lastName }).count()) === 1,
    );

    // An email: said in words, never in the address.
    const find = page.locator('[data-find-person] form');
    await find.locator('input[name=q]').fill('someone@example.test');
    await go(find.getByRole('button', { name: 'Find', exact: true }));
    note(
      'scripts off: an email typed into Find is said in words, not put in the address',
      (await page.locator('[data-found-by-name]').count()) === 1 &&
        !page.url().includes('example.test'),
      page.url(),
    );

    // A search with more than one page ("a": the Paged fillers and many of the league's
    // own), its second page, then a refused add and an add.
    const many = 'a';
    await find.locator('input[name=q]').fill(many);
    await go(find.getByRole('button', { name: 'Find', exact: true }));
    note('scripts off: the search is in the address', asked().get('q') === many, page.url());
    const next = page.locator('[data-person-pages] a', { hasText: 'Next page' });
    note('scripts off: the search has a next page', (await next.count()) === 1);
    if ((await next.count()) === 1) await go(next);
    const onPage2 = () => asked().get('q') === many && asked().get('page') === '2';
    note("scripts off: the search's next page", onPage2(), page.url());
    const chosen = await choose.locator('option').nth(1).getAttribute('value');
    const chosenName = (await choose.locator('option').nth(1).innerText()).trim();
    await choose.selectOption(chosen ?? '');
    await fromList.locator('input[name=jerseyNumber]').fill('05');
    const before = await roster.count();
    await go(fromList.getByRole('button', { name: 'Add to the roster', exact: true }));
    note(
      'scripts off: a refused add comes back to the same search and page',
      onPage2(),
      page.url(),
    );
    note(
      'scripts off: a refused add keeps the person chosen and the number typed',
      (await choose.inputValue()) === chosen &&
        (await fromList.locator('input[name=jerseyNumber]').inputValue()) === '05',
    );
    note('scripts off: the refused add added no one', (await roster.count()) === before);
    await fromList.locator('input[name=jerseyNumber]').fill('33');
    await go(fromList.getByRole('button', { name: 'Add to the roster', exact: true }));
    note('scripts off: an add comes back to the same search and page', onPage2(), page.url());
    note(
      'scripts off: the search is still shown after the add',
      (await page.locator('[data-found-for]').count()) === 1 &&
        (await find.locator('input[name=q]').inputValue()) === many,
    );
    note(
      'scripts off: the person chosen is on the roster',
      (await roster.filter({ hasText: chosenName }).count()) === 1 &&
        (await roster.count()) === before + 1,
      chosenName,
    );
  } finally {
    await context.close();
  }
}

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldAtNoon(),
  });
  let browser;
  try {
    await waitFor(`${origin}/`, server);
    browser = await launch();
    const teamAddress = await journey(browser, origin);
    await scriptsOff(browser, origin, teamAddress);
  } catch (error) {
    failures.push(whatWentWrong(error));
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`Team-roster-paging browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Team-roster-paging browser test passed: ${checked.length} checks in a real browser.`);
