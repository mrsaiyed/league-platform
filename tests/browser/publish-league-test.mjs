// Step 2.240: the owner publishes a draft league in a real browser, against the web app on
// its made-up stand-in (APP_ENV=test). Nothing leaves this computer; every league and
// person is made up. Builds the app first unless given --no-build (npm run
// test:web:browser builds it once in web-exit-test.mjs, then runs this with --no-build).
// Scripts are switched off for the owner: the Publish button asks once as a page of its
// own, and its form works as a plain form.
//
// A signed-out visitor is told the draft league (quiet-pines) is not found. Its owner sees
// the draft notice point to League settings, where the league is said to be a draft and
// the "Must fix" list is drawn. Each item not met is put right (the names choice under
// Privacy, when the league asks for it). A scheduler and a scorekeeper of the draft league
// see no Publish button, and the owner's publish form, posted by hand with their sign-in,
// leaves the league a draft; posted by hand signed out, it is told "not found" (the draft is
// hidden, U-9) and changes nothing. The owner then presses Publish, is asked once, and
// publishes. The screen then says the league is published, draws no Publish button, and
// the draft notice is gone; the visitor reads the league's home with a 200 answer.
import {
  accessibilityProblems,
  answered,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
  saysNothingOf,
  settingAnswer,
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
const league = 'quiet-pines';

if (built) {
  server = startNext(['start', '--port', new URL(origin).port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  await step('starting the server and the browser', async () => {
    await waitFor(`${origin}/`, server);
    browser = await launch();
  });
}

if (browser) {
  const ownerContext = await browser.newContext({ javaScriptEnabled: false });
  await ownerContext.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const owner = await ownerContext.newPage();
  owner.setDefaultTimeout(60_000);
  const visitor = await (await browser.newContext()).newPage();
  visitor.setDefaultTimeout(60_000);
  const settings = `${origin}/${league}/admin/settings`;
  const panel = owner.locator('section#publish');

  await step('a visitor before publishing', async () => {
    const answer = await visitor.goto(`${origin}/${league}`);
    note('before: a signed-out visitor is told the draft is not found', answer?.status() === 404);
  });

  await step('the owner reads the draft', async () => {
    await owner.goto(`${origin}/${league}/admin`);
    const link = owner.locator('.staff-status a', { hasText: 'Publish it in League settings' });
    note('the draft notice on a staff page points to League settings', (await link.count()) > 0);
    await owner.goto(settings);
    const says = await panel.innerText();
    note('the screen says the league is a draft', says.includes('This league is a draft.'));
    note('it says visitors are told "not found"', says.includes('not found'));
    note('it lists what must be fixed', says.includes('Must fix before publishing'));
    const problems = await accessibilityProblems(owner);
    note(
      'the draft settings screen has no accessibility problems',
      problems.length === 0,
      problems.join('; '),
    );
  });

  await step('putting each item right', async () => {
    const privacy = panel.locator('li[data-check="privacyChosen"][data-met="no"]');
    if ((await privacy.count()) > 0) {
      const names = 'section[data-setting="privacy.publicNames"]';
      await owner.locator(`${names} input[type=radio][value="fullName"]`).check();
      const answer = await settingAnswer(
        owner,
        names,
        owner.locator(`${names} button[type=submit]`).first(),
      );
      note('names on public pages is saved', answer.saved, answer.text);
    }
    await owner.goto(settings);
    note(
      'every item is met once put right',
      (await panel.locator('li[data-met="no"]').count()) === 0,
      await panel.innerText(),
    );
  });

  // The owner's own publish form, as the asking state draws it, is posted by hand with
  // another person's sign-in (or none): only the command's own check stands in the way.
  await step('a scheduler, a scorekeeper and a signed-out visitor cannot publish', async () => {
    await owner.goto(`${settings}?publish=ask`);
    const fields = await panel
      .locator('form input')
      .evaluateAll((inputs) => inputs.map((input) => [input.name, input.value]));
    note(
      'the owner is asked, with the publish form',
      fields.some(([name]) => name === 'version'),
    );
    const handPost = (token) => {
      const body = new FormData();
      for (const [name, value] of fields) if (name !== '') body.append(name, value);
      const cookie = token === null ? {} : { cookie: `srl_session=${token}` };
      return fetch(settings, {
        method: 'POST',
        body,
        headers: { origin, ...cookie },
        redirect: 'manual',
      });
    };
    const stillDraft = async (label) => {
      const answer = await fetch(`${origin}/${league}`);
      note(`${label}: the league is still a draft, a visitor gets 404`, answer.status === 404);
    };
    for (const who of ['scheduler', 'scorekeeper']) {
      const token = `local-${who}-token`;
      const context = await browser.newContext({ javaScriptEnabled: false });
      await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
      const page = await context.newPage();
      await page.goto(`${settings}?publish=ask`);
      const part = page.locator('section#publish');
      const buttons =
        (await part.getByRole('link', { name: 'Publish' }).count()) +
        (await part.getByRole('button', { name: 'Publish' }).count());
      note(`the ${who} sees no Publish button`, buttons === 0);
      await context.close();
      const answer = await handPost(token);
      note(`the ${who}'s hand-post: not a server failure`, answer.status < 500, `${answer.status}`);
      await stillDraft(`after the ${who}'s hand-post`);
    }
    const signedOut = await handPost(null);
    // A draft is hidden from anyone signed out (U-9), so the post is told "not found" like a
    // visitor's reading, rather than sent to sign in: that would say the league is there.
    const to = signedOut.headers.get('location') ?? '';
    note(
      'a signed-out hand-post is told not found, as the draft is hidden',
      signedOut.status === 404 && to === '',
      `${signedOut.status} ${to}`,
    );
    await stillDraft('after the signed-out hand-post');
    await owner.goto(settings);
  });

  await step('publishing', async () => {
    // An answer is the server's one-time notice (step 2.155 part 6): a typed address says
    // nothing, so it cannot make the page say a draft is published.
    for (const typed of ['?done=published', '?problem=leagues.set_league_status.not-allowed']) {
      await owner.goto(`${settings}${typed}`);
      note(
        `a typed ${typed} says nothing`,
        (await saysNothingOf(owner, 'The league is published.')) &&
          (await owner.locator('main .ui-notice[data-kind=error]').count()) === 0,
        await owner.locator('main').innerText(),
      );
    }
    await owner.goto(settings);
    note(
      'the typed addresses published nothing',
      (await panel.getAttribute('data-status')) === 'draft',
    );
    await Promise.all([
      owner.waitForURL(/publish=ask/),
      panel.getByRole('link', { name: 'Publish' }).click(),
    ]);
    note(
      'Publish asks once, and says it cannot be made a draft again',
      (await panel.innerText()).includes(
        'Publish this league? Anyone will then be able to see its public pages, and you cannot turn it back into a draft afterwards.',
      ),
    );
    await Promise.all([
      owner.waitForEvent('load'),
      panel.getByRole('button', { name: 'Publish' }).click(),
    ]);
    note('the answer is not in the address', new URL(owner.url()).search === '', owner.url());
    await answered(owner, 'The league is published.');
    const said = await owner.locator('[role=status], [role=alert]').first().innerText();
    note('the screen says it is published', said.includes('The league is published.'), said);
    const after = await panel.innerText();
    note('the screen says the league is live', after.includes('This league is published.'));
    note(
      'no Publish button is drawn',
      (await panel.getByRole('link', { name: 'Publish' }).count()) === 0 &&
        (await panel.getByRole('button', { name: 'Publish' }).count()) === 0,
    );
    note('the draft notice is gone', (await owner.locator('.staff-status').count()) === 0);
    await owner.reload();
    note('a reload says nothing old', await saysNothingOf(owner, 'The league is published.'));
    await owner.goBack();
    note(
      'Back says nothing old',
      /publish=ask/.test(owner.url()) && (await saysNothingOf(owner, 'The league is published.')),
      owner.url(),
    );
  });

  await step('a visitor after publishing', async () => {
    const answer = await visitor.goto(`${origin}/${league}`);
    note('after: the visitor reads the league home with 200', answer?.status() === 200);
  });

  // With scripts on the page is drawn again where it was after a button (step 2.155 part 6):
  // a refusal said at the top, after a button far down the page, brings itself into view.
  await step('with scripts on, a refusal comes into view', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(`${settings}?archive=ask`);
    const form = page.locator('section#publish form[data-form=archive]');
    // As if someone else had changed the league since this page was drawn.
    await form.locator('input[name=version]').evaluate((input) => {
      input.value = String(Number(input.value) - 1);
    });
    await form.getByRole('button', { name: 'Archive' }).click();
    const refusal = page.locator('main > .ui-notice[data-kind=error][role=alert]');
    await refusal.waitFor({ timeout: 10_000 });
    const box = await refusal.evaluate((line) => {
      const { top, bottom } = line.getBoundingClientRect();
      return { top, bottom, height: window.innerHeight };
    });
    note(
      'the refusal is on the screen without scrolling',
      box.top >= 0 && box.bottom <= box.height,
      JSON.stringify(box),
    );
    note(
      'nothing was archived',
      (await page.locator('section#publish').getAttribute('data-status')) === 'live',
    );
    await context.close();
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Publish the league browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Publish the league browser check passed: ${checked.length} checks in a real browser.`);
