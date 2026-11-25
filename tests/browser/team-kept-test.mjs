// Step 2.155: a refused "Add team" keeps what was typed, and "Saved" is said where the
// person is looking, in a real browser at phone width, on the web app's made-up stand-in
// (APP_ENV=test). Nothing leaves this computer. With scripts on and with scripts off:
// - a team typed with the short name "Gym Rats!" is refused: its name, short name, color
//   and division are all still in their boxes, the short name is marked and the sentence
//   beside it names it, on the screen, with the focus on the marked box (scripts on);
// - put right and tapped twice, one team is added, its own page says "Saved" with its
//   name at the top without scrolling, never "Someone else changed…", and a reload says
//   nothing old.
// `--no-build` serves the build already here.
import {
  accessibilityProblems,
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
const phone = { width: 390, height: 844 };
const color = '#c0392b';
const newTeamPage = /\/north-valley\/admin\/teams\/[0-9a-f-]{36}$/;

/** On the screen as it stands, without scrolling. */
const onScreen = async (locator) => {
  const box = await locator.boundingBox();
  return box !== null && box.y >= 0 && box.y + box.height <= phone.height;
};

async function journey(browser, origin, scripts) {
  const how = scripts ? 'scripts on' : 'scripts off';
  const name = scripts ? 'Gym Rats' : 'Gym Rats Two';
  const short = scripts ? 'gym-rats' : 'gym-rats-two';
  const context = await browser.newContext({ javaScriptEnabled: scripts, viewport: phone });
  await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  try {
    await page.goto(`${origin}/north-valley/admin/teams`);
    const form = page.locator('form[data-form=create-team]');
    await form.locator('input[name=name]').fill(name);
    await form.locator('input[name=shortName]').fill(`${name}!`);
    await form.locator('input[name=useOwnColors]').uncheck();
    await form.locator('input[name=color]').fill(color);
    const division = await form
      .locator('select[name=divisionId] option')
      .evaluateAll((options) => options.find((o) => o.value !== '')?.value ?? '');
    note(`${how}: the league has a division to choose`, division !== '');
    await form.locator('select[name=divisionId]').selectOption(division);
    await form.getByRole('button', { name: 'Add team' }).click();

    const again = page.locator('form[data-form=create-team]');
    const problem = again.locator('[data-problem=create-team]');
    await problem.waitFor();
    note(
      `${how}: the name is kept`,
      (await again.locator('input[name=name]').inputValue()) === name,
    );
    note(
      `${how}: the short name is kept as typed`,
      (await again.locator('input[name=shortName]').inputValue()) === `${name}!`,
    );
    note(
      `${how}: the color is kept`,
      (await again.locator('input[name=color]').inputValue()) === color,
    );
    note(
      `${how}: "the league's own colors" stays unticked`,
      !(await again.locator('input[name=useOwnColors]').isChecked()),
    );
    note(
      `${how}: the division is kept`,
      (await again.locator('select[name=divisionId]').inputValue()) === division,
    );
    const shortBox = again.locator('input[name=shortName]');
    note(
      `${how}: the short name is marked`,
      (await shortBox.getAttribute('aria-invalid')) === 'true',
    );
    note(
      `${how}: only the short name is marked`,
      (await again.locator('[aria-invalid=true]').count()) === 1,
    );
    const beside = again
      .locator('.admin-field-group', { has: page.locator('input[name=shortName]') })
      .locator('[data-problem]');
    const said = (await beside.count()) === 1 ? await beside.innerText() : '';
    note(
      `${how}: the sentence is beside the short name and names it`,
      /short name/i.test(said),
      said,
    );
    if (scripts) {
      note(`${how}: the sentence is on the screen`, await onScreen(problem));
      note(
        `${how}: the marked box has the focus`,
        await shortBox.evaluate((box) => document.activeElement === box),
      );
    }
    const found = await accessibilityProblems(page);
    note(
      `${how}: the refused form passes the accessibility checks`,
      found.length === 0,
      String(found),
    );
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    note(`${how}: no sideways scrolling`, wide <= phone.width, String(wide));

    await shortBox.fill(short);
    const button = again.getByRole('button', { name: 'Add team' });
    if (scripts) {
      await Promise.all([page.waitForURL(newTeamPage), button.dblclick()]);
    } else {
      await button.click();
      await page.waitForLoadState('load');
      if (!newTeamPage.test(new URL(page.url()).pathname)) {
        const words = (await page.locator('main').innerText()).slice(0, 300);
        throw new Error(`not on the new team's page but at ${page.url()}: ${words}`);
      }
    }
    const saved = page.locator('[role=status]', { hasText: `Saved: ${name} was added` });
    await saved.waitFor();
    note(`${how}: "Saved" names the team, on the screen without scrolling`, await onScreen(saved));
    const words = await page.locator('main').innerText();
    note(`${how}: nobody else is said to have changed anything`, !/someone else/i.test(words));
    note(`${how}: the answer is not in the address`, !page.url().includes('?'));
    await page.reload();
    await page.locator('h1').first().waitFor();
    note(
      `${how}: a reload says nothing old`,
      (await page.locator('main', { hasText: `Saved: ${name} was added` }).count()) === 0,
    );
    await page.goto(`${origin}/north-valley/admin/teams`);
    const rows = await page.locator('[data-team-row] .staff-row-link').allInnerTexts();
    note(
      `${how}: one team was added`,
      rows.filter((row) => row.trim() === name).length === 1,
      rows.join(', '),
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
    for (const scripts of [true, false]) {
      try {
        await journey(browser, origin, scripts);
      } catch (error) {
        failures.push(`scripts ${scripts ? 'on' : 'off'}: ${whatWentWrong(error)}`);
      }
    }
  } catch (error) {
    failures.push(`starting: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`Team-kept browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Team-kept browser test passed: ${checked.length} checks in a real browser.`);
