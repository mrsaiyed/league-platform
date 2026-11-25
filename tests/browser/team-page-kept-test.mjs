// Step 2.155: a team's own page keeps what was typed after a refusal, and "Saved" is said
// beside the thing saved, once, in a real browser at phone width, on the web app's made-up
// stand-in (APP_ENV=test). Nothing leaves this computer. With scripts on and with scripts
// off:
// - "Team details" given another team's name is refused: the name, short name and color
//   are still as typed, the name box is marked (and has the focus with scripts on) and the
//   sentence beside it names it; put right and tapped twice, "Saved: the details of …" is
//   on the screen beside the form, and a reload says nothing old;
// - "Someone not in the list yet" given a number that is not one is refused: both names
//   are kept, the number box is marked and named; put right and tapped twice, one player
//   is added, said on their new line on the screen, and a reload says nothing old;
// - "Team details" saved after someone else renamed the team in another tab is refused
//   (T-399): the sentence says someone else changed it, the name is kept as typed and
//   "Saved now: <their name>" stands beside the name box (and beside no box that is the
//   same); tapped again, it is saved;
// - with scripts off, "Add team" and "Someone not in the list yet" posted twice by request
//   with the same one-time token (a double tap the browser let through) make one team and
//   one player.
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
const color = '#2e86c1';

/** On the screen as it stands, without scrolling. */
const onScreen = async (locator) => {
  const box = await locator.boundingBox();
  return box !== null && box.y >= 0 && box.y + box.height <= phone.height;
};

/** Sends a form as drawn, twice, by request: the same one-time token both times. */
async function postTwice(page, origin, form) {
  const fields = await form.evaluate((element) =>
    Object.fromEntries([...new FormData(element).entries()].map(([k, v]) => [k, String(v)])),
  );
  const statuses = [];
  for (let i = 0; i < 2; i += 1) {
    const response = await page.request.post(page.url(), {
      multipart: fields,
      headers: { origin },
      maxRedirects: 0,
    });
    statuses.push(response.status());
  }
  return { statuses, token: fields['requestToken'] ?? '' };
}

/** A double tap the browser let through makes one player and one team (scripts off). */
async function postedTwice(page, origin, how, linesNow) {
  const player = page.locator('form[data-form=new-player]');
  await player.locator('input[name=firstName]').fill('Twice');
  await player.locator('input[name=lastName]').fill('Posted');
  const sent = await postTwice(page, origin, player);
  note(`${how}: the new player's form carries a one-time token`, sent.token !== '');
  note(
    `${how}: both posts of the new player answered`,
    sent.statuses.every((s) => s === 303),
    String(sent.statuses),
  );
  await page.reload();
  const lines = await page.locator('ol.admin-roster > li').count();
  const named = await page.locator('ol.admin-roster > li', { hasText: 'Twice Posted' }).count();
  note(
    `${how}: posted twice, one player`,
    lines === linesNow + 1 && named === 1,
    `${linesNow} then ${lines}, ${named} named`,
  );

  await page.goto(`${origin}/north-valley/admin/teams`);
  const links = page.locator('main a[href*="/north-valley/admin/teams/"]');
  const teamsBefore = await links.count();
  const create = page.locator('form[data-form=create-team]');
  await create.locator('input[name=name]').fill('Posted Twice');
  const made = await postTwice(page, origin, create);
  note(`${how}: "Add team" carries a one-time token`, made.token !== '');
  note(
    `${how}: both posts of "Add team" answered`,
    made.statuses.every((s) => s === 303),
    String(made.statuses),
  );
  await page.reload();
  const teamsAfter = await links.count();
  const twice = await page.locator('main a', { hasText: 'Posted Twice' }).count();
  note(
    `${how}: posted twice, one team`,
    teamsAfter === teamsBefore + 1 && twice === 1,
    `${teamsBefore} then ${teamsAfter}, ${twice} named`,
  );
}

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
    await page.goto(`${origin}/north-valley/admin/teams`);
    const links = page.locator('main a[href*="/north-valley/admin/teams/"]');
    const names = await links.allInnerTexts();
    note(`${how}: the league has two teams or more`, names.length >= 2, String(names.length));
    // Scripts on takes the first team, scripts off the second, so each starts afresh.
    const mine = scripts ? 0 : 1;
    const other = names[mine === 0 ? 1 : 0].trim();
    const teamPage = await links.nth(mine).getAttribute('href');
    await page.goto(`${origin}${teamPage}`);

    // Team details, given another team's name.
    const details = page.locator('form[data-form=team-details]');
    const short = scripts ? 'renamed-one' : 'renamed-two';
    await details.locator('input[name=name]').fill(other);
    await details.locator('input[name=shortName]').fill(short);
    await details.locator('input[name=useOwnColors]').uncheck();
    await details.locator('input[name=color]').fill(color);
    await send(details.getByRole('button', { name: 'Save team details' }));
    const problem = details.locator('[data-problem]');
    await problem.first().waitFor({ timeout: 15_000 });
    const nameBox = details.locator('input[name=name]');
    note(`${how}: the name is kept as typed`, (await nameBox.inputValue()) === other);
    note(
      `${how}: the short name is kept`,
      (await details.locator('input[name=shortName]').inputValue()) === short,
    );
    note(
      `${how}: the color is kept`,
      (await details.locator('input[name=color]').inputValue()) === color,
    );
    note(`${how}: the name box is marked`, (await nameBox.getAttribute('aria-invalid')) === 'true');
    note(
      `${how}: only the name is marked`,
      (await details.locator('[aria-invalid=true]').count()) === 1,
    );
    const said = (await problem.first().innerText()).trim();
    note(`${how}: the sentence names the name box`, said.startsWith('Name: '), said);
    note(`${how}: the sentence is on the screen`, await onScreen(problem.first()));
    if (scripts) {
      note(
        `${how}: the marked box has the focus`,
        await nameBox.evaluate((box) => document.activeElement === box),
      );
    }
    const found = await accessibilityProblems(page);
    note(`${how}: accessibility of the refused form`, found.length === 0, String(found));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    note(`${how}: no sideways scrolling`, wide <= phone.width, String(wide));

    // Put right and tapped twice: saved once, said beside the form.
    const newName = scripts ? 'Renamed One' : 'Renamed Two';
    await nameBox.fill(newName);
    await send(details.getByRole('button', { name: 'Save team details' }), true);
    const saved = page.locator('#team-details [role=status]', {
      hasText: `Saved: the details of ${newName}.`,
    });
    await saved.waitFor({ timeout: 15_000 });
    note(`${how}: "Saved" is on the screen without scrolling`, await onScreen(saved));
    const words = await page.locator('main').innerText();
    note(
      `${how}: nobody else is said to have changed anything`,
      !/someone else|changed since/i.test(words),
    );
    note(
      `${how}: the second tap is not refused`,
      (await page.locator('#team-details [data-problem]').count()) === 0,
    );
    await page.reload();
    await page.locator('form[data-form=team-details]').waitFor();
    note(
      `${how}: a reload says nothing old about the details`,
      (await page.locator('main', { hasText: 'Saved: the details of' }).count()) === 0,
    );

    // Someone else renames the team in another tab while this page is open (T-399).
    const stale = page.locator('form[data-form=team-details]');
    const tab = await context.newPage();
    await tab.goto(page.url());
    const theirs = scripts ? 'Meanwhile One' : 'Meanwhile Two';
    const tabDetails = tab.locator('form[data-form=team-details]');
    await tabDetails.locator('input[name=name]').fill(theirs);
    await Promise.all([
      scripts ? Promise.resolve() : tab.waitForEvent('load'),
      tabDetails.getByRole('button', { name: 'Save team details' }).click(),
    ]);
    await tab
      .locator('#team-details [role=status]', { hasText: `Saved: the details of ${theirs}.` })
      .waitFor({ timeout: 15_000 });
    await tab.close();
    const mineInstead = scripts ? 'Mine Instead One' : 'Mine Instead Two';
    await stale.locator('input[name=name]').fill(mineInstead);
    await send(stale.getByRole('button', { name: 'Save team details' }));
    const changedProblem = stale.locator('[data-problem]', { hasText: 'Someone else changed' });
    await changedProblem.waitFor({ timeout: 15_000 });
    note(
      `${how}: a team changed meanwhile keeps the name as typed`,
      (await stale.locator('input[name=name]').inputValue()) === mineInstead,
    );
    const nowName = stale.locator('[data-saved-now=name]');
    note(
      `${how}: beside the name box is what is saved now`,
      (await nowName.count()) === 1 &&
        (await nowName.innerText()).trim() === `Saved now: ${theirs}`,
      (await nowName.count()) === 1 ? await nowName.innerText() : 'none',
    );
    note(
      `${how}: no "Saved now" beside a box that is the same`,
      (await stale.locator('[data-saved-now]').count()) === 1,
      String(await stale.locator('[data-saved-now]').count()),
    );
    await send(stale.getByRole('button', { name: 'Save team details' }));
    await page
      .locator('#team-details [role=status]', { hasText: `Saved: the details of ${mineInstead}.` })
      .waitFor({ timeout: 15_000 });
    note(`${how}: tapped again after seeing both, it is saved`, true);

    // A new player given a number that is not one (the roster takes 0 to 99, or 00).
    const worn = 'ab';
    const lines = () => page.locator('ol.admin-roster > li').count();
    const before = await lines();
    const player = page.locator('form[data-form=new-player]');
    const first = scripts ? 'Rowan' : 'Sasha';
    await player.locator('input[name=firstName]').fill(first);
    await player.locator('input[name=lastName]').fill('Okafor');
    await player.locator('input[name=jerseyNumber]').fill(worn);
    await send(player.getByRole('button', { name: 'Add the person and put them on the roster' }));
    const numberProblem = player.locator('[data-problem]');
    await numberProblem.first().waitFor({ timeout: 15_000 });
    const numberBox = player.locator('input[name=jerseyNumber]');
    note(
      `${how}: the first name is kept`,
      (await player.locator('input[name=firstName]').inputValue()) === first,
    );
    note(
      `${how}: the last name is kept`,
      (await player.locator('input[name=lastName]').inputValue()) === 'Okafor',
    );
    note(`${how}: the number is kept`, (await numberBox.inputValue()) === worn);
    note(
      `${how}: the number box is marked`,
      (await numberBox.getAttribute('aria-invalid')) === 'true',
    );
    const numberSaid = (await numberProblem.first().innerText()).trim();
    note(
      `${how}: the sentence names the number box`,
      numberSaid.startsWith('Jersey number'),
      numberSaid,
    );
    if (scripts) {
      note(
        `${how}: the number box has the focus`,
        await numberBox.evaluate((box) => document.activeElement === box),
      );
    }

    // Put right (no number) and tapped twice: one player, said on their new line.
    await numberBox.fill('');
    await send(
      player.getByRole('button', { name: 'Add the person and put them on the roster' }),
      true,
    );
    const addedLine = page.locator('[data-said-on] [role=status]', {
      hasText: `Saved: ${first} Okafor was added to`,
    });
    await addedLine.waitFor({ timeout: 15_000 });
    note(`${how}: the new line is on the screen without scrolling`, await onScreen(addedLine));
    const after = await lines();
    note(`${how}: one player was added`, after === before + 1, `${before} then ${after}`);
    await page.reload();
    await page.locator('form[data-form=new-player]').waitFor();
    note(
      `${how}: a reload says nothing old about the player`,
      (await page.locator('main', { hasText: 'was added to' }).count()) === 0,
    );
    if (!scripts) await postedTwice(page, origin, how, after);
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
  console.error(`Team-page-kept browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Team-page-kept browser test passed: ${checked.length} checks in a real browser.`);
