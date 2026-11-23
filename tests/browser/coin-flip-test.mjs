// Step 2.56, last part: the coin flip (S-89). At 390 wide, by taps from the admin's own
// menu, the owner adds two teams in Admin → Teams (they have played nobody, so they are
// level after every tiebreaker), finds them named on Admin → Standings and stats, records the
// order a flip at the table gave them with a note, sees the public table say a coin flip
// put them in that order, lets the server flip for them, and takes the flip off with a
// reason, after which they share a place again. Found by their own marks (`data-level-set`,
// `data-flip-form`, `data-remove-flip`); `--no-build` uses the build already there.
import {
  buildNext,
  freePort,
  launch,
  openStaffMenu,
  startNext,
  waitFor,
  worldAtNoon,
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
const area = '/north-valley/admin/standings';
const flipNote = 'Flipped by the referee before the final';
const made = ['Coin Herons', 'Coin Owls'];

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
if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_NOW: worldAtNoon(),
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

/** The public table's text, read in a fresh signed-out page. */
async function publicTable() {
  const context = await browser.newContext({ viewport: phone });
  try {
    const page = await context.newPage();
    await page.goto(`${origin}/north-valley/standings`);
    await page.locator('main').waitFor();
    return (await page.locator('main').textContent()) ?? '';
  } finally {
    await context.close();
  }
}

if (browser) {
  await step('a coin flip recorded, drawn and taken off', async () => {
    const context = await browser.newContext({ viewport: phone });
    await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    try {
      const openFromMenu = async (address, heading) => {
        await page.goto(`${origin}/north-valley/admin`);
        await openStaffMenu(page);
        await Promise.all([
          page.waitForURL((url) => url.pathname === address),
          page
            .getByRole('navigation', { name: 'Admin areas' })
            .locator(`a[href="${address}"]`)
            .click(),
        ]);
        await page.getByRole('heading', { level: 1, name: heading }).waitFor();
      };
      // The made-up world's tables have no teams level after every tiebreaker, so the test
      // makes two: new teams that have played nobody share a place.
      for (const name of made) {
        // Adding a team opens its own page: back to the list, through the menu, each time.
        await openFromMenu('/north-valley/admin/teams', 'Teams');
        const create = page.locator('form[data-form=create-team]');
        await create.locator('input[name=name]').fill(name);
        await Promise.all([
          page.waitForLoadState('load'),
          create.getByRole('button', { name: 'Add team' }).click(),
        ]);
        await page.getByText(name).first().waitFor();
      }
      await openFromMenu(area, 'Standings and stats');
      const wide = await page.evaluate(() => document.documentElement.scrollWidth);
      note('the screen is no wider than the phone', wide <= phone.width, String(wide));

      const set = page.locator(`[data-level-set*="${made[0]}"]`);
      await set.waitFor();
      const names = ((await set.getAttribute('data-level-set')) ?? '').split(',');
      note(
        'the two new teams are named as level after every tiebreaker',
        made.every((name) => names.includes(name)),
        names.join(', '),
      );
      note('they share a place: no flip yet', (await set.getAttribute('data-flipped')) === 'no');
      note('the public table has no coin flip yet', !(await publicTable()).includes('A coin flip'));

      // The flip at the table put the last team first and moved the others down one.
      const order = [names[names.length - 1], ...names.slice(0, -1)];
      const byHand = set.locator('[data-flip-form=by-hand] form[data-form=record-coin-flip]');
      for (const [i, name] of order.entries()) {
        await byHand.locator(`select[name=place${i + 1}]`).selectOption({ label: name });
      }
      await byHand.getByLabel('Note (optional)').fill(flipNote);
      await byHand.getByRole('button', { name: 'Save this order' }).click();
      await page.getByText(/^Saved: a coin flip for /).waitFor();
      note('recorded: marked as flipped', (await set.getAttribute('data-flipped')) === 'yes');
      note(
        'recorded: the new order and the note are shown',
        ((await set.locator('h3').textContent()) ?? '').startsWith(order[0]) &&
          ((await set.textContent()) ?? '').includes(flipNote),
      );
      const flipped = await publicTable();
      // Two teams: "A coin flip puts Owls ahead of Herons." Three or more: "…in this order".
      const at = flipped.indexOf('A coin flip puts');
      note(
        'the public table says a coin flip put them in this order',
        at >= 0 && order.every((name) => flipped.includes(name)),
        flipped.slice(Math.max(0, flipped.indexOf(order[0]) - 40), flipped.indexOf(order[0]) + 300),
      );

      // "Flip for us": drawn on the server, said as such.
      await set
        .locator('[data-flip-form=drawn]')
        .getByRole('button', { name: 'Flip for us' })
        .click();
      await set.locator('[data-flip-made=drawn]').waitFor();
      note('flip for us: drawn by the server', true);

      // Taken off, with a reason, after the tick.
      const remove = set.locator('[data-remove-flip] form');
      await remove.getByLabel('Why it comes off').fill('Flipped in error');
      await remove.getByLabel('Yes, take this coin flip off').check();
      await remove.getByRole('button', { name: 'Take the coin flip off' }).click();
      await page.getByText(/^Taken off: the coin flip for /).waitFor();
      note(
        'taken off: they share a place again',
        (await set.getAttribute('data-flipped')) === 'no',
      );
      note(
        'the public table has no coin flip again',
        !(await publicTable()).includes('A coin flip'),
      );
    } finally {
      await context.close();
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Coin flip browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Coin flip browser test passed (${checked.length} checks).`);
