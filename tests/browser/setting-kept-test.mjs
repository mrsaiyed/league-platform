// Step 2.155 part 4: a League settings form of one setting answers where it was tapped, in
// a real browser at phone width, on the web app's made-up stand-in (APP_ENV=test). Nothing
// leaves this computer. With scripts on and with scripts off:
// - a number past the setting's limit (the browser's own check set aside, as an old
//   browser would) is refused: the number is still in its box, the box is marked, and the
//   sentence beside the buttons names the setting;
// - put right and saved, "Saved: <the setting>." stands beside it, once: a reload says
//   nothing old; "Go back to the default" says so beside it, and the pill says the default;
// - saved in a second tab meanwhile, a save in the first is refused with what was typed
//   kept, "Someone else changed the league…" and "Saved now: …" beside the box.
// `--no-build` serves the build already here.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  settingAnswer,
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
const limit = { timeout: 10_000 };

async function journey(browser, origin, scripts) {
  const how = scripts ? 'scripts on' : 'scripts off';
  // A setting of its own for each journey, so the two never meet.
  const key = scripts ? 'statistics.minimumGamesToRank' : 'games.scorekeeperReopenMinutes';
  // The setting's short name (T-419), and each sentence checked whole.
  const named = scripts ? 'Games needed to be ranked' : 'How long a scorekeeper may reopen a game';
  const section = `section[data-setting="${key}"]`;
  const settings = `${origin}/north-valley/admin/settings`;
  const context = await browser.newContext({ javaScriptEnabled: scripts, viewport: phone });
  await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  try {
    await page.goto(settings);
    const form = page.locator(`${section} form`);
    const box = form.locator('input[name=value]');
    // An old browser does not check the limits: the server must.
    await form.evaluate((element) => {
      element.noValidate = true;
    });
    await box.fill('5000');
    await form.getByRole('button', { name: 'Save' }).click(limit);
    const problem = page.locator(`${section} [data-problem="setting"]`);
    await problem.waitFor(limit);
    note(`${how}: the number past the limit is kept`, (await box.inputValue(limit)) === '5000');
    note(`${how}: the box is marked`, (await box.getAttribute('aria-invalid', limit)) === 'true');
    const why = (await problem.innerText(limit)).trim();
    note(
      `${how}: the sentence names the setting and says why`,
      why ===
        `${named}: That value is not allowed for this setting. Check what it accepts and try again.`,
      why,
    );
    note(`${how}: nothing is said as saved`, (await page.locator('[data-said]').count()) === 0);
    if (scripts) {
      note(
        `${how}: the focus is on the marked box`,
        await box.evaluate((element) => element === document.activeElement),
      );
    }
    note(
      `${how}: no accessibility fault in the refused form`,
      (await accessibilityProblems(page)).length === 0,
      (await accessibilityProblems(page)).join('; '),
    );

    // A second refusal in a row, reading as the first: still told from it (its own mark).
    const firstMark = await problem.getAttribute('data-answer', limit);
    await form.evaluate((element) => {
      element.noValidate = true;
    });
    await box.fill('6000');
    const again = await settingAnswer(page, section, form.getByRole('button', { name: 'Save' }));
    note(
      `${how}: a second refusal in a row is its own answer`,
      !again.saved && again.text === why && (await box.inputValue(limit)) === '6000',
      again.text,
    );
    note(
      `${how}: the second refusal carries a mark of its own`,
      !scripts || (await problem.getAttribute('data-answer', limit)) !== firstMark,
    );

    await box.fill('4');
    await form.getByRole('button', { name: 'Save' }).click(limit);
    const said = page.locator(`${section} [data-said="saved"]`);
    await said.waitFor(limit);
    note(
      `${how}: "Saved" names the setting`,
      (await said.innerText(limit)).trim() === `Saved: ${named}.`,
    );
    note(`${how}: said once`, (await page.locator('[data-said]').count()) === 1);
    note(`${how}: the box shows the saved number`, (await box.inputValue(limit)) === '4');
    note(
      `${how}: the refusal is gone`,
      (await page.locator(`${section} [data-problem]`).count()) === 0,
    );
    await page.goto(settings);
    note(
      `${how}: a reload says nothing old`,
      (await page.locator('[data-said]').count()) === 0 &&
        (await page.locator(`${section}`).innerText(limit)).includes('Now: set for this league.'),
    );

    // Saved meanwhile in a second tab: this tab's save keeps what was typed.
    const other = await context.newPage();
    await other.goto(settings);
    await other.locator(`${section} input[name=value]`).fill('7');
    await other.locator(`${section} form`).getByRole('button', { name: 'Save' }).click(limit);
    await other.locator(`${section} [data-said="saved"]`).waitFor(limit);
    await other.close();
    await box.fill('9');
    await form.getByRole('button', { name: 'Save' }).click(limit);
    await problem.waitFor(limit);
    const changed = (await problem.innerText(limit)).trim();
    note(
      `${how}: a change made meanwhile is said as the screen shows it`,
      changed.startsWith('Someone else changed the league since you opened this page'),
      changed,
    );
    note(`${how}: what was typed is kept`, (await box.inputValue(limit)) === '9');
    const now = page.locator(`${section} [data-saved-now="value"]`);
    note(
      `${how}: "Saved now" stands beside the box`,
      (await now.count()) === 1 && (await now.innerText(limit)).includes('7'),
    );

    // Going back to the default, said beside it.
    await form.getByRole('button', { name: 'Go back to the default' }).click(limit);
    await said.waitFor(limit);
    note(
      `${how}: going back to the default is said beside it`,
      (await said.innerText(limit)).trim() === `${named} is back to its default.`,
    );
    note(
      `${how}: the pill says the default`,
      (await page.locator(section).innerText(limit)).includes('Now: the default.'),
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
  console.error(`Setting-kept browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Setting-kept browser test passed: ${checked.length} checks in a real browser.`);
