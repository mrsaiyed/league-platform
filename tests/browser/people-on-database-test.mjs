// Step 2.50: Admin → People on the made-up DATABASE, in a real browser at phone width (390),
// each person signed in through the screens by the code on the kept emails' page (step
// 2.96). The web app runs on its made-up database (APP_ENV=test,
// LOCAL_DATA=made-up-database): every migration and the two seed leagues in memory, each
// season under way. Nothing leaves this computer; every league and person is made up.
// Builds the app first unless given --no-build. The same screens on the made-up world are
// checked by people-screens-test.mjs.
//
// The adult league's owner, with scripts on as on a phone: People lists the seed's people;
// "Jon Smiht" is added by hand on no team, found by a search, put on the Lakeside Herons
// in Teams, and his name on the roster leads to his record, where it is put right; the
// public Herons page then says Smith, never Smiht. The youth league's owner puts a child's
// first name right, and the public roster shows the new one by first name and initial,
// never the old one nor her surname. Then what the server SENDS of the adult league's
// child's record and of the list to each signed-in person: her birth date to the owner
// and an admin only; the list names only; a scheduler, a program's scheduler, a
// scorekeeper, another league's admin and a visitor refused, holding nothing of her.
import {
  accessibilityProblems,
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

const chosenPassword = 'a made-up chosen password';
const screen = { width: 390, height: 844 };
/** The adult league's child and her private values (packages/database/src/seed/seed-data.ts). */
const child = { first: 'Quinn', last: 'Sample', born: '2012-09-03' };
const youthChild = { first: 'Jordan', fixed: 'Jordyn', last: 'Imaginary', born: '2013-06-02' };

let built = true;
if (!process.argv.includes('--no-build')) {
  await step('building the web app', async () => {
    built = await buildNext();
    if (!built) throw new Error('next build failed or took over 10 minutes');
  });
}

/** The code in the newest kept email to `address`, read on the kept emails' page. */
async function codeOnThePage(page, origin, address) {
  await page.goto(`${origin}/signin/kept-emails`);
  const email = page.locator(`li[data-kept-email="${address}"]`).first();
  await email.waitFor();
  return (await email.locator('code[data-code]').innerText()).trim();
}

/** A browser signed in as `address` through the screens, its code read on the page. */
async function signedIn(browser, origin, address) {
  const context = await browser.newContext({ viewport: screen });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await page.goto(`${origin}/signup`);
  await page.getByLabel('Email').fill(address);
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/signup/code'),
    page.getByRole('button', { name: 'Email me a code' }).click(),
  ]);
  let code = '';
  for (let tries = 0; tries < 10 && !/^\d{6}$/.test(code); tries += 1) {
    code = await codeOnThePage(page, origin, address).catch(() => '');
  }
  await page.goto(`${origin}/signup/code`);
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
  const cookie = (await context.cookies()).find((c) => c.name === 'srl_session')?.value ?? '';
  note(`${address} is signed in`, cookie !== '');
  return { context, page, cookie };
}

const origin = `http://localhost:${await freePort()}`;
const server = built
  ? startNext(['start', '--port', new URL(origin).port], {
      APP_ENV: 'test',
      PUBLIC_BASE_URL: origin,
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

if (browser !== null) {
  const visitor = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
  const publicPage = await visitor.newPage();
  publicPage.setDefaultTimeout(60_000);
  const publicText = async (path) => {
    await publicPage.goto(`${origin}${path}`);
    return publicPage.locator('main').innerText();
  };
  const accessible = async (page, label) => {
    const problems = await accessibilityProblems(page);
    note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
    const wide = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    note(`no sideways scrolling at phone width: ${label}`, wide);
  };
  const toTeam = async (page, name) => {
    await openStaffMenu(page);
    await Promise.all([
      page.waitForURL(/\/admin\/teams$/),
      page.locator('nav').getByRole('link', { name: 'Teams', exact: true }).first().click(),
    ]);
    await Promise.all([
      page.waitForURL(/\/admin\/teams\/[0-9a-f-]{36}$/),
      page.locator('main').getByRole('link', { name, exact: true }).click(),
    ]);
  };
  let owner;
  let childRecord = '';

  await step('the adult league’s owner opens People, read from the database', async () => {
    owner = await signedIn(browser, origin, 'owner@lakeside.example.test');
    const page = owner.page;
    await page.goto(`${origin}/lakeside/admin`);
    await openStaffMenu(page);
    await Promise.all([
      page.waitForURL(/\/admin\/people$/),
      page.locator('nav').getByRole('link', { name: 'People', exact: true }).first().click(),
    ]);
    const names = await page.locator('main .staff-rows a').allInnerTexts();
    note(
      'People lists the seed league’s people',
      ['Morgan Example', 'Quinn Sample', 'Robin Placeholder'].every((name) => names.includes(name)),
      names.join(', '),
    );
    childRecord = new URL(
      (await page
        .locator('main .staff-rows a', { hasText: 'Quinn Sample' })
        .getAttribute('href')) ?? '',
      origin,
    ).pathname;
    await accessible(page, 'People on the database');
  });

  await step('Jon Smiht is added by hand, found, put on the Herons and put right', async () => {
    const page = owner.page;
    const add = page.locator('#add-person');
    await add.getByLabel('First name').fill('Jon');
    await add.getByLabel('Last name').fill('Smiht');
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
      add.getByRole('button', { name: 'Add to the league' }).click(),
    ]);
    await page.getByText('Added to the league: Jon Smiht.').waitFor();
    note('his record opens, saying he was added', true);
    const record = page.url().split('#')[0];

    await page.goto(`${origin}/lakeside/admin/people`);
    await page.getByLabel('Search by name').fill('smiht');
    await Promise.all([
      page.waitForURL(/q=smiht/),
      page.getByRole('button', { name: 'Search', exact: true }).click(),
    ]);
    note(
      'a search finds him',
      JSON.stringify(await page.locator('main .staff-rows a').allInnerTexts()) ===
        JSON.stringify(['Jon Smiht']),
    );

    await toTeam(page, 'Lakeside Herons');
    const adding = page.locator('#add-player');
    await adding.getByLabel('Person').selectOption({ label: 'Jon Smiht' });
    await Promise.all([
      page.waitForURL(/done=added/),
      adding.getByRole('button', { name: 'Add to the roster' }).click(),
    ]);
    note(
      'the public Herons page shows the misspelt name',
      (await publicText('/lakeside/teams/herons')).includes('Jon Smiht'),
    );

    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}$/),
      page.locator('main').getByRole('link', { name: 'Jon Smiht', exact: true }).click(),
    ]);
    note('his roster line leads to his record', page.url() === record, page.url());
    const details = page.locator('#details');
    await details.getByLabel('Last name').fill('Smith');
    await details.getByRole('button', { name: 'Save details' }).click();
    await details.getByText('Saved: Jon Smith.').waitFor();
    const herons = await publicText('/lakeside/teams/herons');
    note(
      'the public Herons page says Jon Smith, and never Smiht',
      herons.includes('Jon Smith') && !herons.includes('Smiht'),
    );
    await accessible(page, 'a record saved on the database');

    // Two tabs: A, opened after this one, marks him a child and gives a guardian's email;
    // this tab, opened before, fixes only his first name, is refused, and saves again.
    const other = await signedIn(browser, origin, 'admin@lakeside.example.test');
    await other.page.goto(record);
    const otherDetails = other.page.locator('#details');
    await otherDetails.getByLabel('Child or adult').selectOption('child');
    await otherDetails.getByLabel('Email (optional)').fill('guardian@example.test');
    await otherDetails.getByRole('button', { name: 'Save details' }).click();
    await otherDetails.getByText('Saved: Jon Smith.').waitFor();
    await details.getByLabel('First name').fill('Jonathan');
    await details.getByRole('button', { name: 'Save details' }).click();
    await details
      .getByText('Someone else changed this person’s details', { exact: false })
      .waitFor();
    note(
      'refused as overtaken: the box this person changed keeps what was typed, the others show what is stored now',
      (await details.getByLabel('First name').inputValue()) === 'Jonathan' &&
        (await details.getByLabel('Child or adult').inputValue()) === 'child' &&
        (await details.getByLabel('Email (optional)').inputValue()) === 'guardian@example.test',
    );
    await details.getByRole('button', { name: 'Save details' }).click();
    await details.getByText('Saved: Jonathan Smith.').waitFor();
    const afterRetry = await publicText('/lakeside/teams/herons');
    note(
      'after the retry the public Herons page still shows him as a child: first name and initial',
      afterRetry.includes('Jonathan S.') && !afterRetry.includes('Jonathan Smith'),
    );
    await page.reload();
    note(
      "and the other admin's email is still on his record in the database",
      (await details.getByLabel('Email (optional)').inputValue()) === 'guardian@example.test',
    );
    await other.context.close();
  });

  await step("the youth league's owner puts a child's first name right", async () => {
    const youth = await signedIn(browser, origin, 'owner@maple.example.test');
    const page = youth.page;
    await page.goto(`${origin}/maple-street/admin/people?q=${youthChild.last.toLowerCase()}`);
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}$/),
      page.locator('main .staff-rows a', { hasText: youthChild.last }).click(),
    ]);
    const details = page.locator('#details');
    note(
      'her record shows her birth date to the owner',
      (await details.getByLabel('Date of birth (optional)').inputValue()) === youthChild.born,
    );
    await details.getByLabel('First name').fill(youthChild.fixed);
    await details.getByRole('button', { name: 'Save details' }).click();
    await details.getByText(`Saved: ${youthChild.fixed} ${youthChild.last}.`).waitFor();
    // One page at a time: the tab cannot load two at once.
    let rosters = '';
    for (const team of ['comets', 'rockets', 'hawks', 'bears']) {
      rosters += `${await publicText(`/maple-street/teams/${team}`)}\n`;
    }
    note(
      'a public roster shows her new first name with her initial only',
      rosters.includes(`${youthChild.fixed} I.`),
    );
    note(
      'and never her old first name or her surname',
      !rosters.includes(youthChild.first) && !rosters.includes(youthChild.last),
    );
    await youth.context.close();
  });

  await step('Ada Lovell is removed by one tap and put back from the notice (A-5)', async () => {
    const page = owner.page;
    await page.goto(`${origin}/lakeside/admin/people`);
    const add = page.locator('#add-person');
    await add.getByLabel('First name').fill('Ada');
    await add.getByLabel('Last name').fill('Lovell');
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
      add.getByRole('button', { name: 'Add to the league' }).click(),
    ]);
    const record = page.url().split('#')[0];
    await page.locator('#remove').getByLabel('Yes, I am sure').check();
    await Promise.all([
      page.waitForURL((url) => url.pathname.endsWith('/admin/people')),
      page.locator('#remove').getByRole('button', { name: 'Remove from the league list' }).click(),
    ]);
    const removed = page.locator('[data-removed]');
    note(
      'the removed notice names her and offers "Put them back"',
      (await removed.innerText()).includes('Removed from the league list: Ada Lovell.'),
    );
    await Promise.all([
      page.waitForURL((url) => url.href.startsWith(record)),
      removed.getByRole('button', { name: 'Put them back' }).click(),
    ]);
    await page.getByText('Put back on the league list: Ada Lovell', { exact: false }).waitFor();
    note(
      'she is back on her record, on no team, from the database',
      (await page.locator('[data-person-teams]').innerText()).includes('On no team'),
    );
  });

  await step(
    'what the server sends of the child’s record and the list, to each person',
    async () => {
      const sent = async (cookie, path) => {
        const answer = await fetch(`${origin}${path}`, {
          redirect: 'manual',
          headers: cookie === null ? {} : { cookie: `srl_session=${cookie}` },
        });
        return { status: answer.status, html: await answer.text() };
      };
      const admin = await signedIn(browser, origin, 'admin@lakeside.example.test');
      for (const [who, cookie] of [
        ['owner', owner.cookie],
        ['admin', admin.cookie],
      ]) {
        const record = await sent(cookie, childRecord);
        note(
          `${who}: the child's record is sent with her birth date`,
          record.status === 200 && record.html.includes(child.born),
          String(record.status),
        );
        const list = await sent(cookie, '/lakeside/admin/people');
        note(
          `${who}: the list is sent with her name and no private value`,
          list.status === 200 &&
            list.html.includes(child.last) &&
            !list.html.includes(child.born) &&
            !list.html.includes('morgan@lakeside.example.test'),
          String(list.status),
        );
      }
      await admin.context.close();
      const refused = [
        ['a scheduler', 'scheduler@lakeside.example.test'],
        ['a program’s scheduler', 'camp-scheduler@lakeside.example.test'],
        ['a scorekeeper', 'scorer@lakeside.example.test'],
        ['another league’s admin', 'admin@maple.example.test'],
      ];
      for (const [who, address] of [...refused, ['a visitor', null]]) {
        const person = address === null ? null : await signedIn(browser, origin, address);
        for (const path of [childRecord, '/lakeside/admin/people']) {
          const page = await sent(person?.cookie ?? null, path);
          note(
            `${who}: ${path === childRecord ? 'the record' : 'the list'} is refused and holds nothing of her`,
            page.status !== 200 &&
              ![child.first, child.last, child.born].some((value) => page.html.includes(value)),
            String(page.status),
          );
        }
        await person?.context.close();
      }
    },
  );

  await owner?.context.close();
  await visitor.close();
}
await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`People on the database browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(
  `People on the database browser test passed: ${checked.length} checks in a real browser.`,
);
