// Step 2.97: League settings → Admins and the invitation's accept page, on the made-up
// database, in a real browser at 390 wide with touch, by taps, with scripts off and on. The
// web app runs on its made-up database (APP_ENV=test, LOCAL_DATA=made-up-database): every
// migration and the two seed leagues in memory, the web app sending its own invitation
// emails there (record 086). Nothing leaves this computer; every league and person is made up.
// Builds the app first unless given --no-build; with --shots it also saves pictures of each
// screen and answer at 390 and 1280 (`.local/shots/<width>/admins-…jpg`).
//
// The done test: the seed league's owner, from the admin's home, opens League settings →
// Admins and invites an address as Scorekeeper; the email is read on the kept emails' page
// (step 2.96); the person opens the link on a phone, creates an account, accepts and lands
// on the league's home with the league's header; the Admins page then lists them by role and
// by the name they gave on the one name screen, never by their email (A-14; "No name yet"
// itself is proved on the stand-in by your-name-test, the one place a person on the page
// can still have no name, see below); re-send, cancel and remove access each work and are in the list of
// latest changes; a scheduler cannot open the page nor post its form; the link answers
// no-store and no-referrer, the accept page it forwards to (whose address holds no secret)
// no-store and same-origin, and no token is in the server's output.
// Beyond the line (the brief check): the same address twice, a cancelled and a replaced link,
// the link opened twice, someone signed in with another address, the open session of a person
// whose access is removed, a refusal with scripts on, the token's cookie gone once accepted,
// and, signed out, a draft league's link answered exactly as one with no league.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  accessibilityProblems,
  answerNameScreen,
  buildNext,
  freePort,
  launch,
  openStaffMenu,
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

const run = Date.now().toString(36);
const seedOwner = 'owner@lakeside.example.test';
const seedScheduler = 'scheduler@lakeside.example.test';
const chosenPassword = 'a made-up chosen password';
const volunteer = `volunteer-${run}@example.test`;
// The name the volunteer gives on the one name screen (step 2.128).
const volunteerName = ['Vic', 'Volunteer'];
const volunteerLine = (page) =>
  page.locator(`li[data-person="${volunteerName.join(' ')}"]`).filter({ hasText: 'Scorekeeper' });
const withdrawn = `withdrawn-${run}@example.test`;
const replaced = `replaced-${run}@example.test`;
const forwarded = `forwarded-${run}@example.test`;
const otherAccount = `other-account-${run}@example.test`;
const takingShots = process.argv.includes('--shots');
const shotsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '.local',
  'shots',
);
/** Every invitation token seen, to look for in the server's output at the end. */
const tokens = new Set();

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

async function accessible(page, label) {
  const problems = await accessibilityProblems(page);
  note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
}

/** A picture of the page at 390 and at 1280, whole, when asked for (--shots). */
async function shot(page, name) {
  if (!takingShots) return;
  const size = page.viewportSize();
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await mkdir(path.join(shotsFolder, String(width)), { recursive: true });
    await page.screenshot({
      path: path.join(shotsFolder, String(width), `${name}.jpg`),
      fullPage: true,
      quality: 80,
    });
  }
  if (size !== null) await page.setViewportSize(size);
}

/** The newest kept email to `address`, as the kept emails' page shows it. */
async function keptEmail(page, origin, address) {
  for (let tries = 0; tries < 10; tries += 1) {
    await page.goto(`${origin}/signin/kept-emails`);
    const email = page.locator(`li[data-kept-email="${address}"]`).first();
    if ((await email.count()) > 0) return email;
  }
  throw new Error(`no kept email to ${address}`);
}

/** The invitation link in the newest kept email to `address`. */
async function linkFor(page, origin, address) {
  const email = await keptEmail(page, origin, address);
  const href = await email
    .locator('a[data-kept-link][href*="/invitation/"]')
    .first()
    .getAttribute('href');
  const token = /\/invitation\/([A-Za-z0-9_-]{43})$/.exec(href ?? '')?.[1];
  if (token === undefined) throw new Error(`no invitation link in the email to ${address}`);
  tokens.add(token);
  return href;
}

/** The 6-digit code in the newest kept email to `address`. */
async function codeFor(page, origin, address) {
  let code = '';
  for (let tries = 0; tries < 10 && !/^\d{6}$/.test(code); tries += 1) {
    const email = await keptEmail(page, origin, address).catch(() => undefined);
    code = email === undefined ? '' : (await email.locator('code[data-code]').innerText()).trim();
  }
  if (!/^\d{6}$/.test(code)) throw new Error(`no code for ${address}`);
  return code;
}

/**
 * Finishes signing up `address` from the sign-up screen the browser is on (its own address
 * may carry where to come back to), reading the code in another tab, as a person would.
 */
async function finishSignUp(page, origin, address, [first, last]) {
  await page.getByLabel('Email').fill(address);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/signup/code'),
    page.getByRole('button', { name: 'Email me a code' }).click(),
  ]);
  const reader = await page.context().newPage();
  const code = await codeFor(reader, origin, address);
  await reader.close();
  await page.getByLabel('Code').fill(code);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/signup/password'),
    page.getByRole('button', { name: 'Continue' }).click(),
  ]);
  await page.getByLabel('Password').fill(chosenPassword);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/signup/password'),
    page.getByRole('button', { name: 'Save and sign in' }).click(),
  ]);
  // The one name screen a new account meets (step 2.128), answered with the person's own name.
  await answerNameScreen(page, first, last);
  return code;
}

/** A browser signed in as `address` (made up by signing up through the screens). */
async function signedIn(browser, origin, address, name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${origin}/signup`);
  await finishSignUp(page, origin, address, name);
  return { context, page };
}

/** Sends a form with no script in the page and waits for the page it is answered with. */
async function submit(page, button) {
  await Promise.all([page.waitForEvent('load'), button.click()]);
}

const admins = (page) => page.locator('main.admin-access');
const invitationLine = (page, address) => page.locator(`li[data-invitation="${address}"]`);

/** Invites `address` as `role` from the Admins page the browser is on. */
async function inviteFromThePage(page, address, role, scripts) {
  const form = page.locator('form[data-invite-form]');
  await form.getByLabel('Their email address').fill(address);
  await form.getByLabel('Role').selectOption({ label: role });
  const send = form.getByRole('button', { name: 'Send the invitation' });
  if (scripts) {
    await send.click();
    await page.getByRole('status').filter({ hasText: 'Invitation sent' }).waitFor();
  } else {
    await submit(page, send);
  }
}

const origin = `http://localhost:${await freePort()}`;
const server = built
  ? startNext(['start', '--port', new URL(origin).port], {
      APP_ENV: 'test',
      PUBLIC_BASE_URL: origin,
      LOG_LEVEL: 'debug',
      LOCAL_DATA: 'made-up-database',
    })
  : null;
let browser = null;
if (server !== null) {
  await step('starting the server on the made-up database and the browser', async () => {
    await waitFor(`${origin}/`, server, [{ address: '/lakeside' }]);
    browser = await launch();
  });
}

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

if (browser !== null) {
  const owner = await signedIn(browser, origin, seedOwner, ['Ola', 'Lakeside'], {
    ...phone,
    javaScriptEnabled: true,
  });
  const session = await owner.context.storageState();
  await owner.context.close();
  // The owner works with no script in the page; a second tab of theirs has scripts on.
  const ownerContext = await browser.newContext({
    ...phone,
    javaScriptEnabled: false,
    storageState: session,
  });
  const page = await ownerContext.newPage();
  page.setDefaultTimeout(60_000);
  const adminsPath = '/lakeside/admin/settings/admins';

  await step('the owner reaches Admins by taps from the admin’s home', async () => {
    await page.goto(`${origin}/lakeside/admin`);
    await openStaffMenu(page);
    await submit(page, page.locator('.staff-nav a', { hasText: 'League settings' }).first());
    await submit(page, page.getByRole('link', { name: 'Admins' }));
    note('Admins opens', new URL(page.url()).pathname === adminsPath, page.url());
    note(
      'it has its title',
      (await page.getByRole('heading', { level: 1, name: 'Admins' }).count()) === 1,
    );
    const listed = await page.locator('li[data-person]').allInnerTexts();
    note(
      'the people with access are listed by name',
      ['Ola Lakeside', 'Adele Admin', 'Sky Scorer'].every((name) =>
        listed.some((l) => l.includes(name)),
      ),
      listed.join(' | '),
    );
    note(
      'no account’s email address is on a person’s line (A-14)',
      !listed.join(' ').includes('@'),
    );
    note(
      'one filled button on the screen',
      (await page.locator('main [data-kind="main"]:visible').count()) === 1,
      String(await page.locator('main [data-kind="main"]:visible').count()),
    );
    note(
      'nothing scrolls sideways at 390',
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    );
    await accessible(page, 'Admins');
  });

  await step('the owner invites an address as Scorekeeper (scripts off)', async () => {
    await inviteFromThePage(page, volunteer, 'Scorekeeper', false);
    note(
      'the browser lands on the invitation',
      new URL(page.url()).hash.startsWith('#invitation-'),
      page.url(),
    );
    note('the address holds nothing typed', !page.url().includes('volunteer'), page.url());
    const line = invitationLine(page, volunteer);
    note(
      'the invitation is listed, as Scorekeeper',
      (await line.count()) === 1 && (await line.innerText()).includes('Scorekeeper'),
    );
    note(
      '"Invitation sent" is said beside it',
      (await line.getByText('Invitation sent').count()) === 1,
    );
    await page.reload();
    note('a reload says nothing old', (await page.getByText('Invitation sent').count()) === 0);
    await shot(page, 'admins-list');
  });

  await step(
    'the same address to the same role again is refused, what was typed kept',
    async () => {
      await inviteFromThePage(page, volunteer, 'Scorekeeper', false);
      const email = page.locator('form[data-invite-form] input[name="email"]');
      note('the email box keeps what was typed', (await email.inputValue()) === volunteer);
      note('the email box is marked', (await email.getAttribute('aria-invalid')) === 'true');
      note(
        'the sentence beside it says why',
        (await page.locator('[data-invite-problem]').innerText()).includes(
          'already has an invitation',
        ),
      );
      note('still one invitation for it', (await invitationLine(page, volunteer).count()) === 1);
      await shot(page, 'admins-invite-refused');
    },
  );

  await step('an invitation cancelled: its link does not work', async () => {
    await page.goto(`${origin}${adminsPath}`);
    await inviteFromThePage(page, withdrawn, 'Editor', false);
    const link = await linkFor(await ownerContext.newPage(), origin, withdrawn);
    await page.goto(`${origin}${adminsPath}`);
    await submit(
      page,
      invitationLine(page, withdrawn).getByRole('button', { name: 'Cancel invitation' }),
    );
    note('it is gone from the list', (await invitationLine(page, withdrawn).count()) === 0);
    note(
      '"Invitation cancelled" is said',
      (await page.getByText('Invitation cancelled').count()) === 1,
    );
    const stranger = await signedIn(
      browser,
      origin,
      `cancelled-reader-${run}@example.test`,
      ['Cass', 'Reader'],
      phone,
    );
    await stranger.page.goto(link);
    note(
      'the cancelled link says it does not work',
      (await stranger.page.locator('[data-invitation-state="not-usable"]').count()) === 1,
    );
    await stranger.context.close();
  });

  let replacedFirst = '';
  await step('an invitation sent again: a new link, and the first does not work', async () => {
    await page.goto(`${origin}${adminsPath}`);
    await inviteFromThePage(page, replaced, 'Scheduler', false);
    const reader = await ownerContext.newPage();
    replacedFirst = await linkFor(reader, origin, replaced);
    await page.goto(`${origin}${adminsPath}`);
    await submit(page, invitationLine(page, replaced).getByRole('button', { name: 'Send again' }));
    note(
      '"Sent again" is said beside it',
      (await invitationLine(page, replaced).getByText('Sent again').count()) === 1,
    );
    const second = await linkFor(reader, origin, replaced);
    note('the new email has a new link', second !== replacedFirst);
    await reader.close();
  });

  // The volunteer, on a phone with scripts on, has no account yet.
  const volunteerContext = await browser.newContext({ ...phone, javaScriptEnabled: true });
  const phonePage = await volunteerContext.newPage();
  phonePage.setDefaultTimeout(60_000);
  let link = '';
  await step('the email is read on the kept emails’ page and its link answers safely', async () => {
    link = await linkFor(await ownerContext.newPage(), origin, volunteer);
    note(
      'the link is the league’s invitation address',
      link.startsWith(`${origin}/lakeside/invitation/`),
      link,
    );
    const answer = await fetch(link, { redirect: 'manual' });
    note('the link forwards at once', answer.status === 303, String(answer.status));
    note(
      'to the accept page, with no secret in its address',
      answer.headers.get('location') === `${origin}/lakeside/invitation`,
      String(answer.headers.get('location')),
    );
    note(
      'the link answers no-store',
      (answer.headers.get('cache-control') ?? '').includes('no-store'),
    );
    note('the link answers no-referrer', answer.headers.get('referrer-policy') === 'no-referrer');
    const cookie = answer.headers.get('set-cookie') ?? '';
    note(
      'its token is held in a cookie for the accept page only, out of scripts’ reach',
      /Path=\/lakeside\/invitation/i.test(cookie) &&
        /HttpOnly/i.test(cookie) &&
        /SameSite=Lax/i.test(cookie),
      cookie.replace(/=[A-Za-z0-9_-]{43}/, '=…'),
    );
    const held = await fetch(`${origin}/lakeside/invitation`, { redirect: 'manual' });
    note(
      'the accept page answers no-store',
      (held.headers.get('cache-control') ?? '').includes('no-store'),
      String(held.headers.get('cache-control')),
    );
    note(
      // Its address holds no secret, and its forms must work with scripts off (record 086).
      'the accept page passes nothing to another site',
      held.headers.get('referrer-policy') === 'same-origin',
      String(held.headers.get('referrer-policy')),
    );
    // A wrong token, and an address with no league, answer exactly as a right one does.
    const wrong = await fetch(`${origin}/lakeside/invitation/${'x'.repeat(43)}`, {
      redirect: 'manual',
    });
    const nowhere = await fetch(`${origin}/no-such-league/invitation/${'x'.repeat(43)}`, {
      redirect: 'manual',
    });
    note(
      'a wrong token is answered as a right one',
      wrong.status === 303 && wrong.headers.get('location') === `${origin}/lakeside/invitation`,
    );
    note(
      'an address with no league is answered the same way',
      nowhere.status === 303 &&
        nowhere.headers.get('location') === `${origin}/no-such-league/invitation`,
    );
  });

  await step('the volunteer opens the link, creates an account and comes back', async () => {
    await phonePage.goto(link);
    note(
      'the address bar holds no token',
      new URL(phonePage.url()).pathname === '/lakeside/invitation',
      phonePage.url(),
    );
    note(
      'a visitor is asked to sign in or create an account',
      (await phonePage.locator('[data-invitation-state="visitor"]').count()) === 1,
    );
    note(
      'nothing of the role is said before signing in',
      !(await phonePage.locator('main').innerText()).includes('Scorekeeper'),
    );
    await accessible(phonePage, 'the accept page, for a visitor');
    await shot(phonePage, 'admins-accept-visitor');
    await phonePage.getByRole('link', { name: 'Create an account' }).tap();
    await phonePage.waitForURL((url) => url.pathname === '/signup');
    note(
      'the way back from signing up holds no token',
      !phonePage.url().includes(link.slice(-43)),
      phonePage.url(),
    );
    await finishSignUp(phonePage, origin, volunteer, volunteerName);
    note(
      'it comes straight back to the accept page',
      new URL(phonePage.url()).pathname === '/lakeside/invitation',
      phonePage.url(),
    );
    const main = phonePage.locator('[data-invitation-state="open"]');
    note('the invitation is shown', (await main.count()) === 1);
    note(
      'with the league and the role',
      (await main.innerText()).includes('Lakeside') &&
        (await main.innerText()).includes('Scorekeeper'),
    );
    note('with the account that will get it', (await main.innerText()).includes(volunteer));
    note(
      'not "sent to another address": it was sent to this one',
      (await phonePage.locator('[data-sent-elsewhere]').count()) === 0,
    );
    await accessible(phonePage, 'the accept page, signed in');
    await shot(phonePage, 'admins-accept-open');
  });

  await step('the volunteer accepts and lands on the league’s home, with its header', async () => {
    await Promise.all([
      phonePage.waitForURL((url) => url.pathname === '/lakeside'),
      phonePage.getByRole('button', { name: 'Accept the invitation' }).tap(),
    ]);
    note(
      'on the league’s home',
      new URL(phonePage.url()).pathname === '/lakeside',
      phonePage.url(),
    );
    note(
      'with the league’s own header',
      (await phonePage.locator('header.site-header').count()) === 1,
    );
    const held = (await volunteerContext.cookies()).filter(
      (c) => c.name === 'srl_invitation' && c.value !== '',
    );
    note('the token’s cookie is gone once accepted', held.length === 0, String(held.length));
    const games = await phonePage.goto(`${origin}/lakeside/admin`);
    note(
      'the scorekeeper’s games open for them now',
      games?.status() === 200,
      String(games?.status()),
    );
  });

  await step('the link opened again: "Already accepted", to them only', async () => {
    await phonePage.goto(link);
    note(
      'it says it was accepted already',
      (await phonePage.locator('[data-invitation-state="accepted"]').count()) === 1,
    );
    await shot(phonePage, 'admins-accept-accepted');
    const other = await signedIn(
      browser,
      origin,
      `link-reader-${run}@example.test`,
      ['Lin', 'Reader'],
      phone,
    );
    await other.page.goto(link);
    note(
      'anyone else is told only that it does not work',
      (await other.page.locator('[data-invitation-state="not-usable"]').count()) === 1,
    );
    await accessible(other.page, 'the accept page, a link that does not work');
    await shot(other.page, 'admins-accept-not-usable');
    await other.page.goto(replacedFirst);
    note(
      'a link replaced by a newer email does not work',
      (await other.page.locator('[data-invitation-state="not-usable"]').count()) === 1,
    );
    await other.page.goto(`${origin}/no-such-league/invitation/${'x'.repeat(43)}`);
    note(
      'nor does an address with no league, the same page',
      (await other.page.locator('[data-invitation-state="not-usable"]').count()) === 1,
    );
    await other.context.close();
  });

  await step(
    'someone signed in with another address is told, and can use another account',
    async () => {
      await page.goto(`${origin}${adminsPath}`);
      await inviteFromThePage(page, forwarded, 'Registrar', false);
      const forwardedLink = await linkFor(await ownerContext.newPage(), origin, forwarded);
      const other = await signedIn(browser, origin, otherAccount, ['Otto', 'Other'], {
        ...phone,
        javaScriptEnabled: false,
      });
      await other.page.goto(forwardedLink);
      note(
        'the invitation is shown',
        (await other.page.locator('[data-invitation-state="open"]').count()) === 1,
      );
      note(
        'it says the invitation was sent to another address',
        (await other.page.locator('[data-sent-elsewhere]').count()) === 1,
      );
      note(
        'without naming that address',
        !(await other.page.locator('main').innerText()).includes(forwarded),
      );
      await shot(other.page, 'admins-accept-other-address');
      await submit(other.page, other.page.getByRole('button', { name: 'Use another account' }));
      const at = new URL(other.page.url());
      note(
        '“Use another account” opens sign-in, to come back here',
        at.pathname === '/signin' && at.searchParams.get('next') === '/lakeside/invitation',
        other.page.url(),
      );
      await other.context.close();
    },
  );

  // A-14's "No name yet" no longer has a case on the made-up database: every seeded person
  // has a name in the seed, and an invited person meets the name screen before the accept
  // page lets them accept (identify's name gate, T-445), so nobody is on this page unnamed.
  // The true case, a made-up person on the page who has never answered the screen, and the
  // line taking their name once they answer, is proved on the stand-in by your-name-test.
  await step(
    'the Admins page lists the volunteer as Scorekeeper, by the name they gave',
    async () => {
      await page.goto(`${origin}${adminsPath}`);
      const line = volunteerLine(page);
      note(
        'one line with their name and the role',
        (await line.count()) === 1,
        await page
          .locator('li[data-person]')
          .allInnerTexts()
          .then((t) => t.join(' | ')),
      );
      note(
        'not by their email address (A-14)',
        !(await line.first().innerText()).includes(volunteer) &&
          !(await page.locator('li[data-person]').allInnerTexts()).join(' ').includes('@'),
      );
      note(
        'their invitation is no longer waiting',
        (await invitationLine(page, volunteer).count()) === 0,
      );
      const changes = await page.locator('[data-access-activity] li').allInnerTexts();
      for (const said of [
        'Invited someone as Scorekeeper',
        'Re-sent an invitation as Scheduler',
        'Cancelled an invitation as Editor',
        'Joined as Scorekeeper',
      ]) {
        note(
          `the latest changes say "${said}"`,
          changes.some((c) => c.includes(said)),
          changes.join(' | '),
        );
      }
    },
  );

  await step('a scheduler cannot open the page, nor post its form', async () => {
    // The owner's own page, as it was drawn for them: its form, sent by a scheduler's browser.
    await page.goto(`${origin}${adminsPath}`);
    const ownersPage = await page.content();
    const scheduler = await signedIn(browser, origin, seedScheduler, ['Sam', 'Scheduler'], {
      ...phone,
      javaScriptEnabled: false,
    });
    const opened = await scheduler.page.goto(`${origin}${adminsPath}`);
    note('the scheduler is refused the page', opened?.status() === 403, String(opened?.status()));
    await shot(scheduler.page, 'admins-scheduler-refused');
    await scheduler.page.route(`${origin}${adminsPath}`, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: ownersPage })
        : route.continue(),
    );
    await scheduler.page.goto(`${origin}${adminsPath}`);
    const sneaked = `by-scheduler-${run}@example.test`;
    const form = scheduler.page.locator('form[data-invite-form]');
    await form.getByLabel('Their email address').fill(sneaked);
    await form.getByLabel('Role').selectOption({ label: 'Admin' });
    // Refused before any command runs. Next.js answers a refusal inside a plain form's action
    // with its "not found" page (404) rather than the 403 the page itself answers.
    const [posted] = await Promise.all([
      scheduler.page.waitForResponse((r) => r.request().method() === 'POST'),
      form.getByRole('button', { name: 'Send the invitation' }).click(),
    ]);
    note(
      'the scheduler’s post of the form is refused',
      [403, 404].includes(posted.status()),
      String(posted.status()),
    );
    await scheduler.context.close();
    await page.goto(`${origin}${adminsPath}`);
    note('and nobody was invited by it', (await invitationLine(page, sneaked).count()) === 0);
  });

  await step(
    'removing access asks first, then ends the volunteer’s open session at once',
    async () => {
      await page.goto(`${origin}${adminsPath}`);
      const line = volunteerLine(page).first();
      const remove = line.locator('details.admin-access-remove');
      await remove.locator('summary').tap();
      await shot(page, 'admins-remove-ask');
      // Not ticked: the browser asks for the box, and the server refuses it too.
      note(
        'the box must be ticked first',
        (await remove.locator('input[name="confirm"][required]').count()) === 1,
      );
      await remove.getByLabel('Yes, remove this access').check();
      await submit(page, remove.getByRole('button', { name: 'Remove access' }));
      note('"Access removed" is said', (await page.getByText('Access removed').count()) === 1);
      const denied = await phonePage.goto(`${origin}/lakeside/admin`);
      note(
        'the volunteer’s open session is refused at once',
        denied?.status() === 403,
        String(denied?.status()),
      );
      await page.goto(`${origin}${adminsPath}`);
      const changes = await page.locator('[data-access-activity] li').allInnerTexts();
      note(
        'the latest changes say the access was removed',
        changes.some((c) => c.includes("Removed someone's access as Scorekeeper")),
        changes.join(' | '),
      );
      await accessible(page, 'Admins after the changes');
    },
  );

  await step(
    'with scripts on: a refusal keeps what was typed, and an invitation is sent',
    async () => {
      const scripted = await browser.newContext({
        ...phone,
        javaScriptEnabled: true,
        storageState: session,
      });
      const tab = await scripted.newPage();
      tab.setDefaultTimeout(60_000);
      await tab.goto(`${origin}${adminsPath}`);
      const form = tab.locator('form[data-invite-form]');
      await form.getByLabel('Their email address').fill(forwarded);
      await form.getByLabel('Role').selectOption({ label: 'Registrar' });
      await form.getByRole('button', { name: 'Send the invitation' }).tap();
      await tab.locator('[data-invite-problem]').waitFor();
      note(
        'the refusal is said beside the box',
        (await tab.locator('[data-invite-problem]').innerText()).includes(
          'already has an invitation',
        ),
      );
      note(
        'what was typed is kept',
        (await form.locator('input[name="email"]').inputValue()) === forwarded,
      );
      note('the address holds nothing', new URL(tab.url()).search === '', tab.url());
      await inviteFromThePage(tab, `scripted-${run}@example.test`, 'Editor', true);
      note(
        'the new invitation is listed',
        (await invitationLine(tab, `scripted-${run}@example.test`).count()) === 1,
      );
      await scripted.close();
    },
  );

  // A hidden league's short name cannot be tested from the accept page: signed out, the link
  // at a draft league's address is answered exactly as at one with no league. Only the
  // made-up stand-in has a draft league (quiet-pines), so a second server runs on it.
  await step('signed out, a draft league’s address is answered as one with none', async () => {
    const standInOrigin = `http://localhost:${await freePort()}`;
    const standIn = startNext(['start', '--port', new URL(standInOrigin).port], {
      APP_ENV: 'test',
      PUBLIC_BASE_URL: standInOrigin,
      LOG_LEVEL: 'debug',
    });
    try {
      await waitFor(`${standInOrigin}/`, standIn);
      const answerAt = async (slug) => {
        const context = await browser.newContext(phone);
        const tab = await context.newPage();
        const response = await tab.goto(`${standInOrigin}/${slug}/invitation/${'y'.repeat(43)}`);
        const state = tab.locator('[data-invitation-state]');
        const answer = {
          address: new URL(tab.url()).pathname.split(slug).join('{league}'),
          status: String(response?.status()),
          title: await tab.title(),
          text: await tab.locator('body').innerText(),
          state:
            (await state.count()) === 1 ? await state.getAttribute('data-invitation-state') : '',
          headers: Object.entries(response?.headers() ?? {})
            .filter(([name]) => !['date', 'set-cookie', 'content-length'].includes(name))
            .map(([name, value]) => `${name}: ${value.replace(/nonce-[^'\s]*/g, 'nonce')}`)
            .sort()
            .join('\n'),
        };
        await context.close();
        return answer;
      };
      const draft = await answerAt('quiet-pines');
      const none = await answerAt('no-such-league');
      note(
        'signed out, a draft league’s link asks to sign in',
        draft.state === 'visitor',
        draft.state,
      );
      for (const part of ['address', 'status', 'title', 'text', 'state', 'headers']) {
        note(
          `signed out, a draft league and no league answer the same ${part}`,
          draft[part] === none[part],
          `${JSON.stringify(draft[part]).slice(0, 300)} / ${JSON.stringify(none[part]).slice(0, 300)}`,
        );
      }
      note(
        'and the draft league is not named',
        !draft.text.includes('Quiet Pines'),
        draft.text.slice(0, 200),
      );
    } finally {
      standIn.child.kill();
    }
  });

  await volunteerContext.close();
  await ownerContext.close();
  await browser.close();
}

if (server !== null) {
  server.child.kill();
  const output = server.output();
  note('the server saw invitation links', tokens.size >= 4, String(tokens.size));
  note(
    'no invitation token is in the server’s output',
    [...tokens].every((token) => !output.includes(token)),
  );
  for (const address of [volunteer, withdrawn, replaced, forwarded, otherAccount]) {
    note(
      `no invited address is in the server’s output (${address.length} characters)`,
      !output.includes(address),
    );
  }
}

if (failures.length > 0) {
  console.error(`Admins and invitations browser test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Admins and invitations browser test passed (${checked.length} checks).`);
