// Step 2.243 (S-109, T-402): a child recorded in an adult league is never shown in full on
// an old yes, in a real browser, against the web app on its made-up stand-in
// (APP_ENV=test). Nothing leaves this computer; every league and person is made up. Builds
// the app first unless given --no-build.
//
// In the adult league with nothing in it (still-waters) the owner finds the parents'
// confirmation not offered, and a yes posted by hand refused, while no child is recorded.
// A child (Ada, by a birth date) makes the yes possible; the owner gives it. Ada goes to
// the bin, and the yes stays (no child is recorded). Brought back, she is the first child
// again: the bin's page says the yes went back to no. The owner confirms again; Ada's birth
// date is corrected to an adult's, and the yes stays. Then Bea, a child by a birth date,
// is added: her page says the yes went back, the public team page shows her as "Bea L."
// at once, League settings asks to confirm the privacy choices, and once the owner
// confirms, the public page shows "Bea Lark".
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
let built = true;
if (!process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}
const league = 'still-waters';
const origin = `http://localhost:${await freePort()}`;
const year = new Date().getUTCFullYear();
const childBorn = `${year - 10}-06-15`;
const adultBorn = `${year - 30}-06-15`;
const confirmation = 'section[data-setting="privacy.childrenInFullConfirmed"]';
const names = 'section[data-setting="privacy.publicNames"]';
const firstChildSaid = 'This is the first child recorded in this league, so the confirmation';
let server;
let browser;
let at = 'starting';
if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
}
try {
  if (server === undefined) throw new Error('no server');
  await waitFor(`${origin}/`, server, [
    { address: `/${league}/admin/settings`, cookie: 'srl_session=local-owner-token' },
    { address: `/${league}/admin/people`, cookie: 'srl_session=local-owner-token' },
  ]);
  browser = await launch();
  const owner = await browser.newContext();
  await owner.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const page = await owner.newPage();
  const visitor = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(60_000);
  visitor.setDefaultTimeout(60_000);
  const settings = `${origin}/${league}/admin/settings`;
  const said = () => page.locator('main [role=status], main [role=alert]').first().innerText();
  const submit = async (button, url = /done=|problem=|back=|not=/) => {
    try {
      await Promise.all([page.waitForURL(url), button.click()]);
    } catch (error) {
      throw new Error(`${button} left ${page.url()}: ${whatWentWrong(error)}`);
    }
  };
  const confirmAgain = async (label) => {
    await page.goto(settings);
    await page.locator(`${confirmation} input[type=checkbox]`).check();
    await submit(page.locator(`${confirmation} button[type=submit]`).first());
    note(`${label}: the yes is saved`, (await said()) === 'The setting was saved.', await said());
  };
  const confirmed = async () => {
    await page.goto(settings);
    const box = page.locator(`${confirmation} input[type=checkbox]`);
    return (await box.count()) === 1 && (await box.isChecked());
  };
  const addPerson = async (first, last, born) => {
    await page.goto(`${origin}/${league}/admin/people`);
    await page.getByRole('link', { name: 'Add a person' }).first().click();
    const add = page.locator('#add-person');
    await add.getByLabel('First name').fill(first);
    await add.getByLabel('Last name').fill(last);
    await add.getByLabel('Date of birth (optional)').fill(born);
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
      add.getByRole('button', { name: 'Add to the league' }).click(),
    ]);
    return page.url().split(/[?#]/)[0];
  };
  const firstChildLine = () => page.locator('main [data-says="first-child"]');

  at = 'no child yet: the yes is not offered, and a yes posted by hand is refused';
  await page.goto(settings);
  note(
    'no tick is offered in an adult league with no child',
    (await page.locator(`${confirmation} input[type=checkbox]`).count()) === 0,
  );
  // The names form, turned by hand into a yes to "children in full", ticked.
  await page
    .locator(`${names} form`)
    .first()
    .evaluate((form, key) => {
      for (const box of form.querySelectorAll('[name=value], [name=confirmed]')) box.remove();
      form.querySelector('input[name=key]').value = key;
      for (const [name, value] of [
        ['value', 'tick'],
        ['confirmed', 'yes'],
      ]) {
        const input = document.createElement('input');
        Object.assign(input, { type: 'hidden', name, value });
        form.append(input);
      }
    }, 'privacy.childrenInFullConfirmed');
  await submit(page.locator(`${names} form button[type=submit]`).first());
  note(
    'the hand-posted yes is refused in plain words',
    (await said()).startsWith(
      'This league is for adults and no one in it is recorded as a child, so there is nothing to confirm yet.',
    ),
    await said(),
  );
  note('and nothing was saved', !(await confirmed()));

  at = 'Ada, a child, makes the yes possible; in the bin the yes stays; back, it goes to no';
  const ada = await addPerson('Ada', 'Moss', childBorn);
  note(
    'the first child with no yes saved says nothing of a yes',
    (await firstChildLine().count()) === 0,
  );
  await confirmAgain('with Ada recorded');
  await page.goto(ada);
  const remove = page.locator('section', {
    has: page.getByRole('heading', { name: 'Remove from the league list' }),
  });
  await remove.getByLabel('Yes, I am sure').check();
  await submit(
    remove.getByRole('button', { name: 'Remove from the league list' }),
    /\/admin\/people(\?|$)/,
  );
  note('with Ada in the bin the yes stays', await confirmed());
  await page.goto(`${origin}/${league}/admin/settings/bin`);
  const row = page.locator('li[data-bin]', { hasText: 'Ada Moss' });
  await submit(row.getByRole('button', { name: 'Bring it back' }), /back=person/);
  note(
    "the bin's page says Ada back is the first child and the yes went back",
    (await firstChildLine().innerText()).startsWith(firstChildSaid),
  );
  note('the yes is back to no', !(await confirmed()));

  at = "Ada's birth date made an adult's: the yes, given again, stays";
  await confirmAgain('with Ada back');
  await page.goto(ada);
  const details = page.locator('form', { has: page.getByRole('button', { name: 'Save details' }) });
  await details.getByLabel('Date of birth (optional)').fill(adultBorn);
  await details.getByRole('button', { name: 'Save details' }).click();
  await details.getByText('Saved: Ada Moss.').waitFor();
  note('with no child recorded the yes stays', await confirmed());

  at = 'Bea, a child by a birth date, is the first child: the yes goes back in the same save';
  await page.goto(`${origin}/${league}/admin/teams`);
  await page.locator('input[name=name]').fill('Herons');
  await submit(page.getByRole('button', { name: 'Add team' }), /done=created/);
  const herons = page.url().split(/[?#]/)[0];
  await addPerson('Bea', 'Lark', childBorn);
  note(
    "Bea's page says she is the first child and the yes went back",
    (await firstChildLine().innerText()).startsWith(firstChildSaid),
  );
  await page.goto(herons);
  const roster = page.locator('form', { has: page.locator('select[name=personId]') });
  await roster.locator('select[name=personId]').selectOption({ label: 'Bea Lark' });
  await submit(roster.getByRole('button', { name: 'Add to the roster' }));
  await visitor.goto(`${origin}/${league}/teams`);
  await Promise.all([
    visitor.waitForURL(/\/teams\/[^/]+$/),
    visitor.locator('main').getByRole('link', { name: 'Herons' }).first().click(),
  ]);
  const publicTeam = visitor.url();
  let shown = await visitor.locator('main').innerText();
  note(
    'the public team page shows Bea as a youth league would, at once',
    shown.includes('Bea L.') && !shown.includes('Bea Lark'),
    shown.slice(0, 300),
  );
  await page.goto(settings);
  note(
    'League settings asks to confirm the privacy choices',
    (await page.locator('main').innerText()).includes(
      'Under-18s play in this league, so its privacy choices must be confirmed.',
    ),
  );
  note('the yes is no', !(await confirmed()));

  at = 'the owner confirms again: Bea is shown in full';
  await page.goto(settings);
  await page.locator(`${names} input[type=radio][value="fullName"]`).check();
  await submit(page.locator(`${names} button[type=submit]`).first());
  await confirmAgain('with Bea recorded');
  await visitor.goto(publicTeam);
  shown = await visitor.locator('main').innerText();
  note(
    'after the confirmation Bea is shown in full',
    shown.includes('Bea Lark'),
    shown.slice(0, 300),
  );
} catch (error) {
  failures.push(`${at}: ${whatWentWrong(error)}`);
} finally {
  await browser?.close();
  server?.child.kill();
}
if (failures.length > 0) {
  console.error(`First child browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`First child browser test passed: ${checked.length} checks in a real browser.`);
