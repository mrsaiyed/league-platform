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
// Privacy, when the league asks for it), the owner presses Publish, is asked once, and
// publishes. The screen then says the league is published, draws no Publish button, and
// the draft notice is gone; the visitor reads the league's home with a 200 answer.
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
      await Promise.all([
        owner.waitForURL(/done=|problem=/),
        owner.locator(`${names} button[type=submit]`).first().click(),
      ]);
    }
    await owner.goto(settings);
    note(
      'every item is met once put right',
      (await panel.locator('li[data-met="no"]').count()) === 0,
      await panel.innerText(),
    );
  });

  await step('publishing', async () => {
    await Promise.all([
      owner.waitForURL(/publish=ask/),
      panel.getByRole('link', { name: 'Publish' }).click(),
    ]);
    note(
      'Publish asks once',
      (await panel.innerText()).includes('Publish this league? Visitors will be able to see it.'),
    );
    await Promise.all([
      owner.waitForURL(/done=|problem=/),
      panel.getByRole('button', { name: 'Publish' }).click(),
    ]);
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
  });

  await step('a visitor after publishing', async () => {
    const answer = await visitor.goto(`${origin}/${league}`);
    note('after: the visitor reads the league home with 200', answer?.status() === 200);
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`Publish the league browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Publish the league browser check passed: ${checked.length} checks in a real browser.`);
