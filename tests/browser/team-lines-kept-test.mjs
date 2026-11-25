// Step 2.155, part 3: the rest of a team's own page keeps what was typed after a refusal,
// and "Saved" is said beside the thing saved, once, in a real browser at phone width, on
// the web app's made-up stand-in (APP_ENV=test). Nothing leaves this computer. With
// scripts on and with scripts off:
// - a roster line's number and role, given a number that is not one, is refused: the
//   number and the role chosen are kept, the number box is marked and the sentence beside
//   it names it; put right, "Saved: the number and role of …" is said on that line, on the
//   screen, and a reload says nothing old;
// - "Add to the roster" from the league list, given a number that is not one, is refused:
//   the person chosen, the number and the role are kept, the number box is marked and
//   named; put right, the new line says "Saved: … was added to …", and a reload says
//   nothing old;
// - "Who sees this team's numbers", saved after someone else changed the team in another
//   tab, is refused (T-399): the choice is kept as made and "Saved now: …" stands beside
//   it; tapped again, it is saved, said beside the form;
// - with scripts off, "Add to the roster" posted twice by request with the same one-time
//   token (a double tap the browser let through) puts the person on the roster once.
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

/** The value of the option of a select that is not the one chosen now. */
const otherOption = (select) =>
  select.evaluate((box) => [...box.options].find((o) => o.value !== '' && !o.selected)?.value);

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

async function journey(browser, origin, scripts) {
  const how = scripts ? 'scripts on' : 'scripts off';
  const context = await browser.newContext({ javaScriptEnabled: scripts, viewport: phone });
  await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  /** Taps a button; with scripts off, waits for the page it leads to. */
  const send = async (button) => {
    if (scripts) return button.click();
    return Promise.all([page.waitForEvent('load'), button.click()]);
  };
  try {
    await page.goto(`${origin}/north-valley/admin/teams`);
    const links = page.locator('main a[href*="/north-valley/admin/teams/"]');
    // Scripts on takes the first team, scripts off the second, so each starts afresh.
    const teamPage = await links.nth(scripts ? 0 : 1).getAttribute('href');
    await page.goto(`${origin}${teamPage}`);

    // A roster line's number and role, given a number that is not one.
    const line = page.locator('ol.admin-roster > li').first();
    const entry = line.locator('form[data-form=roster-entry]');
    const role = await otherOption(entry.locator('select[name=role]'));
    note(`${how}: a roster line offers another role`, role !== undefined);
    await entry.locator('input[name=jerseyNumber]').fill('x7');
    await entry.locator('select[name=role]').selectOption(role ?? '');
    await send(entry.getByRole('button', { name: 'Save number and role' }));
    const entryProblem = entry.locator('[data-problem]');
    await entryProblem.waitFor({ timeout: 15_000 });
    const entryNumber = entry.locator('input[name=jerseyNumber]');
    note(`${how}: the line's number is kept`, (await entryNumber.inputValue()) === 'x7');
    note(
      `${how}: the line's role is kept`,
      (await entry.locator('select[name=role]').inputValue()) === role,
    );
    note(
      `${how}: the line's number box is marked`,
      (await entryNumber.getAttribute('aria-invalid')) === 'true',
    );
    const entrySaid = (await entryProblem.innerText()).trim();
    note(`${how}: the sentence names the number box`, entrySaid.startsWith('Number: '), entrySaid);
    if (scripts) {
      note(
        `${how}: the line's number box has the focus`,
        await entryNumber.evaluate((box) => document.activeElement === box),
      );
    }
    const found = await accessibilityProblems(page);
    note(`${how}: accessibility of the refused line`, found.length === 0, String(found));
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    note(`${how}: no sideways scrolling`, wide <= phone.width, String(wide));

    // Put right: said on that line, on the screen; a reload says nothing old.
    const number = scripts ? '77' : '78';
    await entryNumber.fill(number);
    await send(entry.getByRole('button', { name: 'Save number and role' }));
    const entrySaved = page.locator('[role=status]', { hasText: 'Saved: the number and role of' });
    await entrySaved.waitFor({ timeout: 15_000 });
    note(`${how}: "Saved" on the line is on the screen`, await onScreen(entrySaved));
    note(
      `${how}: the number is saved`,
      (await page
        .locator('ol.admin-roster > li')
        .first()
        .locator('input[name=jerseyNumber]')
        .inputValue()) === number,
    );
    await page.reload();
    await page.locator('form[data-form=roster-entry]').first().waitFor();
    note(
      `${how}: a reload says nothing old about the line`,
      (await page.locator('main', { hasText: 'Saved: the number and role of' }).count()) === 0,
    );

    // "Add to the roster" from the league list, given a number that is not one.
    const list = page.locator('form[data-form=from-list]');
    const person = await otherOption(list.locator('select[name=personId]'));
    note(`${how}: the league list offers someone`, person !== undefined);
    const listRole = await otherOption(list.locator('select[name=role]'));
    await list.locator('select[name=personId]').selectOption(person ?? '');
    await list.locator('input[name=jerseyNumber]').fill('zz');
    await list.locator('select[name=role]').selectOption(listRole ?? '');
    await send(list.getByRole('button', { name: 'Add to the roster', exact: true }));
    const listProblem = list.locator('[data-problem]');
    await listProblem.waitFor({ timeout: 15_000 });
    note(
      `${how}: the person chosen is kept`,
      (await list.locator('select[name=personId]').inputValue()) === person,
    );
    note(
      `${how}: the number typed is kept`,
      (await list.locator('input[name=jerseyNumber]').inputValue()) === 'zz',
    );
    note(
      `${how}: the role chosen is kept`,
      (await list.locator('select[name=role]').inputValue()) === listRole,
    );
    note(
      `${how}: the list's number box is marked`,
      (await list.locator('input[name=jerseyNumber]').getAttribute('aria-invalid')) === 'true',
    );
    const listSaid = (await listProblem.innerText()).trim();
    note(`${how}: the sentence names the number`, listSaid.startsWith('Jersey number'), listSaid);

    const lines = await page.locator('ol.admin-roster > li').count();
    await list.locator('input[name=jerseyNumber]').fill('');
    await send(list.getByRole('button', { name: 'Add to the roster', exact: true }));
    const added = page.locator('[data-said-on] [role=status]', { hasText: 'was added to' });
    await added.waitFor({ timeout: 15_000 });
    note(`${how}: the new line is on the screen`, await onScreen(added));
    const linesAfter = await page.locator('ol.admin-roster > li').count();
    note(`${how}: one line was added`, linesAfter === lines + 1, `${lines} then ${linesAfter}`);
    await page.reload();
    await page.locator('form[data-form=team-stats]').waitFor();
    note(
      `${how}: a reload says nothing old about the line added`,
      (await page.locator('main', { hasText: 'was added to' }).count()) === 0,
    );

    // Who sees the numbers, after someone else changed the team in another tab (T-399).
    const stats = page.locator('form[data-form=team-stats]');
    const tab = await context.newPage();
    await tab.goto(page.url());
    const tabDetails = tab.locator('form[data-form=team-details]');
    await tabDetails.locator('input[name=shortName]').fill(scripts ? 'meanwhile-a' : 'meanwhile-b');
    await Promise.all([
      scripts ? Promise.resolve() : tab.waitForEvent('load'),
      tabDetails.getByRole('button', { name: 'Save team details' }).click(),
    ]);
    await tab
      .locator('#team-details [role=status]', { hasText: 'Saved: the details of' })
      .waitFor({ timeout: 15_000 });
    await tab.close();
    const choice = await otherOption(stats.locator('select[name=statsVisibility]'));
    await stats.locator('select[name=statsVisibility]').selectOption(choice ?? '');
    await send(stats.getByRole('button', { name: 'Save who sees the numbers' }));
    await stats
      .locator('[data-problem]', { hasText: 'Someone else changed' })
      .waitFor({ timeout: 15_000 });
    note(
      `${how}: the choice of who sees the numbers is kept`,
      (await stats.locator('select[name=statsVisibility]').inputValue()) === choice,
    );
    note(
      `${how}: "Saved now" beside the choice`,
      (await stats.locator('[data-saved-now=statsVisibility]').count()) === 1,
    );
    await send(stats.getByRole('button', { name: 'Save who sees the numbers' }));
    const statsSaved = page.locator('[role=status]', { hasText: 'Saved: who sees the numbers of' });
    await statsSaved.waitFor({ timeout: 15_000 });
    note(
      `${how}: "Saved" beside who sees the numbers is on the screen`,
      await onScreen(statsSaved),
    );
    await page.reload();
    await page.locator('form[data-form=team-stats]').waitFor();
    note(
      `${how}: a reload says nothing old about who sees the numbers`,
      (await page.locator('main', { hasText: 'Saved: who sees the numbers of' }).count()) === 0,
    );

    if (!scripts) {
      const twice = page.locator('form[data-form=from-list]');
      const someone = await otherOption(twice.locator('select[name=personId]'));
      await twice.locator('select[name=personId]').selectOption(someone ?? '');
      const linesNow = await page.locator('ol.admin-roster > li').count();
      const sent = await postTwice(page, origin, twice);
      note(`${how}: "Add to the roster" carries a one-time token`, sent.token !== '');
      note(
        `${how}: both posts of "Add to the roster" answered`,
        sent.statuses.every((status) => status === 303),
        String(sent.statuses),
      );
      await page.reload();
      const linesThen = await page.locator('ol.admin-roster > li').count();
      note(
        `${how}: posted twice, on the roster once`,
        linesThen === linesNow + 1,
        `${linesNow} then ${linesThen}`,
      );
    }
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
  console.error(`Team-lines-kept browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Team-lines-kept browser test passed: ${checked.length} checks in a real browser.`);
