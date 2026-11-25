// Step 2.155 part 4: a Season settings form keeps what was typed when its save is refused,
// in a real browser at phone width, on the web app's made-up stand-in (APP_ENV=test).
// Nothing leaves this computer; every league, team and season is made up. Builds the app
// first unless given --no-build.
//
// Scripts off, the standings of the current season (it has results, so the change is
// asked about first, S-1): what was typed rides with the question, and survives a "No",
// and a refusal after "Yes" because the season was saved meanwhile in a second tab, whose
// sentence says what the screen shows ("Saved now" beside each box that differs); saved
// at last, "Saved" is said once. One post of the name and dates sent twice with its
// one-time token is answered twice as saved, and saved once. Scripts on: an empty name is
// refused twice in a row, each refusal its own answer, the focus on the marked box.
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
const phone = { width: 390, height: 844 };
const limit = { timeout: 10_000 };

let built = true;
if (!process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

/** Posts a form's own fields twice by request, as a double tap that got through. */
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

/** Presses `button` and waits, at most ten seconds, for an answer that was not there before. */
async function partAnswer(page, button) {
  const before = 'data-answered-before';
  await page.evaluate((mark) => {
    for (const old of document.querySelectorAll('[data-problem], [data-notice=saved]')) {
      old.setAttribute(mark, '');
    }
  }, before);
  await button.click(limit);
  const fresh = page
    .locator(`[data-problem="part"]:not([${before}]), [data-notice=saved]:not([${before}])`)
    .first();
  await fresh.waitFor(limit);
  return {
    saved: (await fresh.getAttribute('data-notice', limit)) === 'saved',
    text: (await fresh.innerText(limit)).trim(),
    mark: await fresh.getAttribute('data-answer', limit),
  };
}

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const port = new URL(origin).port;
  const server = startNext(['start', '--port', port], { APP_ENV: 'test', PUBLIC_BASE_URL: origin });
  const editAt = (part) => `${origin}/north-valley/admin/season?season=fall-2026&edit=${part}`;
  let browser;
  let at = 'starting';
  try {
    await waitFor(`${origin}/`, server, [
      {
        address: '/north-valley/admin/season?season=fall-2026&edit=standings',
        cookie: 'srl_session=local-owner-token',
      },
    ]);
    browser = await launch();
    const contextOf = async (scripts) => {
      const context = await browser.newContext({ javaScriptEnabled: scripts, viewport: phone });
      await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
      return context;
    };

    at = 'scripts off: the standings, asked first';
    const off = await contextOf(false);
    const page = await off.newPage();
    page.setDefaultTimeout(60_000);
    const send = (button) => Promise.all([page.waitForEvent('load', limit), button.click(limit)]);
    const save = page.getByRole('button', { name: 'Save the standings rules' });
    const ask = page.locator('[data-rules-ask]');
    const box = (name) => page.locator(`[name=${name}]:not([type=hidden])`);
    const kept = async () =>
      (await box('tiebreaker1').inputValue(limit)) === 'points-scored' &&
      (await box('tiebreaker2').inputValue(limit)) === 'point-difference' &&
      (await box('forfeitWinner').inputValue(limit)) === '30';
    await page.goto(editAt('standings'));
    await box('tiebreaker1').selectOption('points-scored');
    await box('tiebreaker2').selectOption('point-difference');
    await box('tiebreaker3').selectOption('');
    await box('forfeitWinner').fill('30');
    await send(save);
    note('saving asks first', (await ask.count()) === 1);
    note(
      'what was typed rides with both answers of the question',
      (await ask.locator('input[type=hidden][name=forfeitWinner][value="30"]').count()) === 2 &&
        (await ask.locator('input[type=hidden][name=tiebreaker1][value=points-scored]').count()) ===
          2,
    );
    await send(ask.getByRole('button', { name: 'No, change the rules' }));
    note('after "No", every box holds what was typed', await kept());

    at = 'scripts off: asked again, saved meanwhile in a second tab, then "Yes"';
    await send(save);
    note('asked again', (await ask.count()) === 1);
    const other = await off.newPage();
    await other.goto(editAt('name'));
    await other.getByLabel('Season name').fill('Fall 2026 Meanwhile');
    await Promise.all([
      other.waitForEvent('load', limit),
      other.getByRole('button', { name: 'Save the name and dates' }).click(limit),
    ]);
    note(
      'the second tab saved',
      (await other.locator('#season-name [data-notice=saved]').count()) === 1,
    );
    await other.close();
    await send(ask.getByRole('button', { name: 'Yes, save and move them' }));
    const problem = page.locator('[data-problem="part"]');
    const said = (await problem.innerText(limit)).trim();
    note(
      'a refusal after "Yes" says the season changed meanwhile, as the screen shows it',
      said.startsWith('Someone else saved this season since you opened this page') &&
        said.includes('beside each box that differs is what is saved now'),
      said,
    );
    note('after the refusal, every box holds what was typed', await kept());
    const savedNow = page.locator('[data-saved-now]');
    const nowNames = await savedNow.evaluateAll((lines) =>
      lines.map((line) => line.getAttribute('data-saved-now')),
    );
    note(
      '"Saved now" stands beside the boxes typed differently, and no other',
      nowNames.includes('tiebreaker1') &&
        nowNames.includes('forfeitWinner') &&
        nowNames.every((name) =>
          ['tiebreaker1', 'tiebreaker2', 'tiebreaker3', 'forfeitWinner'].includes(name),
        ),
      JSON.stringify(nowNames),
    );
    note(
      'no accessibility fault in the refused form',
      (await accessibilityProblems(page)).length === 0,
      (await accessibilityProblems(page)).join('; '),
    );

    at = 'scripts off: saved at last';
    await send(save);
    await send(ask.getByRole('button', { name: 'Yes, save and move them' }));
    const savedLine = page.locator('#season-standings [data-notice=saved]');
    note(
      '"Saved" is said beside the standings, once',
      (await savedLine.count()) === 1 &&
        (await savedLine.innerText(limit)).includes('Saved: the standings rules.') &&
        (await page.locator('[data-notice=saved]').count()) === 1,
    );
    await page.reload();
    note('a reload says nothing old', (await page.locator('[data-notice=saved]').count()) === 0);

    at = 'scripts off: one post sent twice';
    await page.goto(editAt('name'));
    await page.getByLabel('Season name').fill('Fall 2026 Twice');
    const sent = await postTwice(page, origin, page.locator('form.admin-season-form'));
    note('the name and dates carry a one-time token', sent.token !== '');
    note(
      'both posts of the name and dates are answered as saved',
      sent.statuses.every((status) => status === 303),
      String(sent.statuses),
    );
    await page.goto(`${origin}/north-valley/admin/season?season=fall-2026`);
    note(
      'and the name is saved',
      (await page.locator('#season-name').innerText(limit)).includes('Fall 2026 Twice'),
    );
    await off.close();

    at = 'scripts on: an empty name, refused twice in a row';
    const on = await contextOf(true);
    const live = await on.newPage();
    live.setDefaultTimeout(60_000);
    await live.goto(editAt('name'));
    const name = live.getByLabel('Season name');
    const saveName = live.getByRole('button', { name: 'Save the name and dates' });
    await name.fill(' ');
    const first = await partAnswer(live, saveName);
    note(
      'scripts on: an empty name is refused, the box marked',
      !first.saved && (await name.getAttribute('aria-invalid', limit)) === 'true',
      first.text,
    );
    note(
      'scripts on: the focus is on the marked box',
      await name.evaluate((element) => element === document.activeElement),
    );
    await name.fill(' ');
    const second = await partAnswer(live, saveName);
    note(
      'scripts on: a second refusal in a row is its own answer, with a mark of its own',
      !second.saved && second.text === first.text && second.mark !== first.mark,
      `${first.mark} then ${second.mark}`,
    );
    await name.fill('Fall 2026 Live');
    const done = await partAnswer(live, saveName);
    note(
      'scripts on: "Saved" is said beside the name and dates',
      done.saved && done.text.includes('Saved: the name and dates.'),
      done.text,
    );
    note(
      'scripts on: said once',
      (await live.locator('[data-notice=saved]').count()) === 1 && /#season-name$/.test(live.url()),
      live.url(),
    );
    await on.close();
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`Season kept browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Season kept browser test passed: ${checked.length} checks in a real browser.`);
