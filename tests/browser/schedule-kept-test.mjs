// Step 2.155: the schedule grid's game forms keep what was typed after a refusal, and
// "Saved" is said beside the game, once, in a real browser at phone width, on the web
// app's made-up stand-in (APP_ENV=test). Nothing leaves this computer. With scripts on and
// with scripts off:
// - "Add a game" with one team on both sides is refused: both teams, the time, the place
//   and how it is recorded are still in their boxes, "Away team" is marked and the sentence
//   beside it names it;
// - put right and tapped twice, one game is added, "Saved" names it beside it on the
//   screen without scrolling, never "Someone else changed…", and a reload says nothing old;
// - a game's own form sent after the draft moved on is refused beside that game, with the
//   time as typed still in its box.
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

/** On the screen as it stands, without scrolling. */
const onScreen = async (locator) => {
  const box = await locator.boundingBox();
  return box !== null && box.y >= 0 && box.y + box.height <= phone.height;
};

const schedule = '/north-valley/admin/schedule';

async function journey(browser, origin, scripts) {
  const how = scripts ? 'scripts on' : 'scripts off';
  const context = await browser.newContext({ javaScriptEnabled: scripts, viewport: phone });
  await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  /** Taps a button; with scripts off, waits for the page it leads to. */
  const send = async (button, twice = false) => {
    if (scripts) {
      await (twice ? button.dblclick() : button.click());
      return;
    }
    await Promise.all([page.waitForEvent('load'), twice ? button.dblclick() : button.click()]);
  };
  try {
    await page.goto(`${origin}${schedule}`);
    const round = page.locator('section[data-round]').first();
    const roundId = await round.getAttribute('data-round');
    const add = () => page.locator(`details[data-add-game="${roundId}"]`);
    await add().locator('summary').click();
    const teams = await add()
      .locator('select[name=homeTeamId] option')
      .evaluateAll((options) => options.filter((o) => o.value !== '').map((o) => o.value));
    note(`${how}: the grid offers four teams or more`, teams.length >= 4, String(teams.length));
    const [home, away] = scripts ? [teams[0], teams[1]] : [teams[2], teams[3]];
    const place = await add()
      .locator('select[name=place] option')
      .evaluateAll((options) => options.find((o) => o.value !== '')?.value ?? '');
    const time = scripts ? '18:30' : '19:45';
    await add().locator('select[name=homeTeamId]').selectOption(home);
    await add().locator('select[name=awayTeamId]').selectOption(home);
    await add().locator('input[name=time]').fill(time);
    await add().locator('select[name=place]').selectOption(place);
    await add().locator('select[name=recording]').selectOption('box-score');
    await send(add().locator('button[type=submit]'));

    const problem = add().locator('[data-notice=problem]');
    await problem.waitFor({ timeout: 15_000 });
    const box = (name) => add().locator(`[name=${name}]`);
    note(`${how}: the form is open again`, await add().evaluate((d) => d.open));
    note(`${how}: the home team is kept`, (await box('homeTeamId').inputValue()) === home);
    note(`${how}: the away team is kept`, (await box('awayTeamId').inputValue()) === home);
    note(`${how}: the time is kept`, (await box('time').inputValue()) === time);
    note(`${how}: the place is kept`, (await box('place').inputValue()) === place);
    note(
      `${how}: how it is recorded is kept`,
      (await box('recording').inputValue()) === 'box-score',
    );
    note(
      `${how}: "Away team" is marked, and only it`,
      (await box('awayTeamId').getAttribute('aria-invalid')) === 'true' &&
        (await add().locator('[aria-invalid=true]').count()) === 1,
    );
    const said = (await problem.innerText()).trim();
    note(`${how}: the sentence beside it names it`, said.startsWith('Away team: '), said);
    note(
      `${how}: the sentence is right after the away team's box`,
      await box('awayTeamId').evaluate(
        (el) => el.closest('label')?.nextElementSibling?.getAttribute('data-notice') === 'problem',
      ),
    );

    // A second page whose form for a game is drawn now, before the draft moves on.
    const stale = await context.newPage();
    stale.setDefaultTimeout(60_000);
    await stale.goto(`${origin}${schedule}`);
    const gameLine = stale
      .locator('li[data-game]')
      .filter({ has: stale.locator('summary', { hasText: 'Edit this game' }) })
      .first();
    const gameId = await gameLine.getAttribute('data-game');
    await gameLine.locator('summary', { hasText: 'Edit this game' }).click();
    const staleTime = scripts ? '07:15' : '07:45';
    await gameLine.locator('form').first().locator('input[name=time]').fill(staleTime);

    // Put right and tapped twice: one game, "Saved" beside it.
    const games = () => page.locator(`section[data-round="${roundId}"] li[data-game]`).count();
    const before = await games();
    await box('awayTeamId').selectOption(away);
    await send(add().locator('button[type=submit]'), true);
    const savedHere = page.locator('#saved', { hasText: 'Saved to the draft' });
    await savedHere.waitFor({ timeout: 15_000 });
    const awayName = await page
      .locator(
        `details[data-add-game="${roundId}"] select[name=awayTeamId] option[value="${away}"]`,
      )
      .innerText();
    note(`${how}: "Saved" names the game`, (await savedHere.innerText()).includes(awayName.trim()));
    note(
      `${how}: "Saved" is beside the game`,
      await savedHere.evaluate((el) => el.closest('li[data-game]') !== null),
    );
    note(`${how}: "Saved" is on the screen without scrolling`, await onScreen(savedHere));
    const words = await page.locator('main').innerText();
    note(`${how}: nobody else is said to have changed anything`, !/someone else/i.test(words));
    const after = await games();
    note(`${how}: one game was added`, after === before + 1, `${before} then ${after}`);
    await page.reload();
    await page.locator('section[data-round]').first().waitFor();
    note(
      `${how}: a reload says nothing old`,
      (await page.locator('#saved').count()) === 0 &&
        (await page.locator('main', { hasText: 'Saved to the draft' }).count()) === 0,
    );

    // The game's form from before: refused beside that game, the time still as typed.
    const staleButton = gameLine.locator('form').first().getByRole('button', { name: 'Save' });
    if (scripts) await staleButton.click();
    else await Promise.all([stale.waitForEvent('load'), staleButton.click()]);
    const line = stale.locator(`li[data-game="${gameId}"]`);
    const refused = line.locator('[data-notice=problem]');
    await refused.waitFor({ timeout: 15_000 });
    note(
      `${how}: the stale save is refused beside the game`,
      (await refused.innerText()).trim() !== '',
    );
    note(
      `${how}: the time typed is still in its box`,
      (await line.locator('form').first().locator('input[name=time]').inputValue()) === staleTime,
    );
    const problems = await accessibilityProblems(stale);
    note(`${how}: accessibility of the refused game`, problems.length === 0, problems.join('; '));
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
  console.error(`Schedule-kept browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Schedule-kept browser test passed: ${checked.length} checks in a real browser.`);
