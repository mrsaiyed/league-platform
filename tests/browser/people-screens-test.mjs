// Step 2.50: Admin → People, in a real browser at phone width (390), on the web app's
// made-up stand-in (APP_ENV=test). Nothing leaves this computer; every person is made up.
// Builds the app first unless given --no-build; --dev runs `next dev` instead.
//
// The made-up owner signs in as the other browser tests do (the stand-in's session cookie),
// starts at the admin's home and from there only taps, with scripts on as on a phone:
// - a misspelt name put right where the public sees it (the 2.106 audit, H11): "Jon Smiht"
//   is added by hand with a name only and on no team, found by a search, put on the
//   Falcons, and his name on the Falcons' roster leads to his record, where it becomes
//   "Jon Smith", "Saved" beside it; the public Falcons page then says Smith, never Smiht;
// - a child's first name on a youth team's public roster put right the same way;
// - a refused save keeps what was typed and marks the box, beside it in words; a save
//   that someone else's save overtook is refused, keeps what was typed and works again;
// - with scripts off, adding someone wrong is refused the same way;
// - nothing of a person (a name, an email, a date of birth) is ever in an address.
// Then, role by role, what the server SENDS (the page's HTML, which holds the page's data
// too): a registrar adds a child with an email and a date of birth in the draft league;
// that record's page holds them for the owner, an admin and the registrar only; the list
// holds names only, for them; every other made-up person (a scheduler, an editor, a
// scorekeeper, a club admin, a coach, another league's admin, someone with no role, a
// visitor) is refused both, and the refusal holds nothing of the person (R-16, T-76).
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

const dev = process.argv.includes('--dev');
let built = true;
if (!dev && !process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

const screen = { width: 390, height: 844 };
/** The made-up people's session cookies (apps/web/src/server/stand-in-cast.ts). */
const tokens = {
  owner: 'local-owner-token',
  admin: 'local-admin-token',
  registrar: 'local-registrar-token',
  scheduler: 'local-scheduler-token',
  programScheduler: 'local-program-scheduler-token',
  editor: 'local-editor-token',
  scorekeeper: 'local-scorekeeper-token',
  clubAdmin: 'local-club-admin-token',
  coach: 'local-coach-token',
  stranger: 'local-stranger-token',
  otherAdmin: 'local-other-admin-token',
};
const child = {
  first: 'Noa',
  last: 'Quellbrook',
  email: 'noa.guardian@example.test',
  born: '2015-03-09',
};

if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const port = new URL(origin).port;
  const server = startNext(dev ? ['dev', '--port', port] : ['start', '--port', port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
  });
  let browser;
  let at = 'starting';
  try {
    await waitFor(`${origin}/`, server);
    browser = await launch();
    const signedIn = async (token, scripts = true) => {
      const context = await browser.newContext({ javaScriptEnabled: scripts, viewport: screen });
      await context.addCookies([{ name: 'srl_session', value: token, url: origin }]);
      const page = await context.newPage();
      page.setDefaultTimeout(dev ? 120_000 : 60_000);
      return { context, page };
    };
    const { page } = await signedIn(tokens.owner);
    const visitor = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
    const publicPage = await visitor.newPage();
    publicPage.setDefaultTimeout(dev ? 120_000 : 60_000);
    const publicText = async (path) => {
      await publicPage.goto(`${origin}${path}`);
      return publicPage.locator('main').innerText();
    };
    /** Every address the owner's browser was at, to prove none held a person. */
    const addresses = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) addresses.push(frame.url());
    });
    const accessible = async (label, on = page) => {
      const problems = await accessibilityProblems(on);
      note(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
      const wide = await on.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      );
      note(`no sideways scrolling at phone width: ${label}`, wide);
    };
    const main = () => page.locator('main');
    const toPeople = async () => {
      await openStaffMenu(page);
      await Promise.all([
        page.waitForURL(/\/admin\/people$/),
        page.locator('nav').getByRole('link', { name: 'People', exact: true }).first().click(),
      ]);
    };
    const toTeam = async (name) => {
      await openStaffMenu(page);
      await Promise.all([
        page.waitForURL(/\/admin\/teams$/),
        page.locator('nav').getByRole('link', { name: 'Teams', exact: true }).first().click(),
      ]);
      await Promise.all([
        page.waitForURL(/\/admin\/teams\/[0-9a-f-]{36}$/),
        main().getByRole('link', { name, exact: true }).click(),
      ]);
    };
    const details = page.locator('#details');

    at = 'the owner opens People from the admin';
    await page.goto(`${origin}/north-valley`);
    await page.goto(`${origin}/north-valley/admin`);
    await toPeople();
    note(
      'People is a screen, titled, with its main action at the top',
      (await page.getByRole('heading', { level: 1, name: 'People' }).count()) === 1 &&
        (await page.locator('header').getByRole('link', { name: 'Add a person' }).count()) === 1,
    );
    note(
      'a person on no team is listed (Leo Fischer, a free agent)',
      (await main().getByRole('link', { name: 'Leo Fischer', exact: true }).count()) === 1,
    );
    await accessible('the People list');

    at = 'the owner adds Jon Smiht by hand, with a name only';
    await page.getByRole('link', { name: 'Add a person' }).first().click();
    const add = page.locator('#add-person');
    await add.getByLabel('First name').fill('Jon');
    await add.getByLabel('Last name').fill('Smiht');
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
      add.getByRole('button', { name: 'Add to the league' }).click(),
    ]);
    await page.getByText('Added to the league: Jon Smiht.').waitFor();
    note(
      'his record opens, saying he was added and is on no team yet',
      (await page.getByRole('heading', { level: 1, name: 'Jon Smiht' }).count()) === 1 &&
        (await page.getByText('They are on no team yet', { exact: false }).count()) === 1,
    );
    const jonAddress = page.url().split('#')[0];
    await accessible('a person just added');

    at = 'the owner finds him by a search';
    await toPeople();
    await page.getByLabel('Search by name').fill('smi');
    await Promise.all([
      page.waitForURL(/q=smi/),
      page.getByRole('button', { name: 'Search', exact: true }).click(),
    ]);
    const found = await main().locator('.staff-rows a').allInnerTexts();
    note('a search by part of a name finds him', found.includes('Jon Smiht'), found.join(', '));
    note(
      'and only people whose name matches',
      found.every((name) => /smi/i.test(name)),
      found.join(', '),
    );
    await page.getByLabel('Search by name').fill('jon@example.test');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const noEmail = page.getByText('An email address is not searched here', { exact: false });
    await noEmail.waitFor();
    note(
      'an email address typed in the search gets its sentence under the box, and the browser is on the clean address',
      (await noEmail.isVisible()) &&
        !page.url().includes('example.test') &&
        !page.url().includes('q='),
      page.url(),
    );
    await page.getByLabel('Search by name').fill('o’neill');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForURL(/q=o/);
    note(
      'a curly apostrophe is searched as a plain one',
      page.url().includes("q=o'neill") || page.url().includes('q=o%27neill'),
      page.url(),
    );

    at = 'the owner puts him on the Falcons';
    await toTeam('Falcons');
    // The form that puts someone already in the league on the roster, found by what it is:
    // the one form with a "Person" list (the new-player form comes first, step 2.194).
    const adding = page.locator('form').filter({ has: page.getByLabel('Person') });
    await adding.getByLabel('Person').selectOption({ label: 'Jon Smiht' });
    await Promise.all([
      page.waitForURL(/done=added/),
      adding.getByRole('button', { name: 'Add to the roster' }).click(),
    ]);
    note(
      'the public Falcons page shows the misspelt name',
      (await publicText('/north-valley/teams/falcons')).includes('Jon Smiht'),
    );

    at = "the owner taps his name on the Falcons' roster and puts it right";
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}$/),
      main().getByRole('link', { name: 'Jon Smiht', exact: true }).click(),
    ]);
    note(
      "the roster line's name leads to his record",
      page.url() === jonAddress,
      `${page.url()} is not ${jonAddress}`,
    );
    // A box emptied by mistake is refused in words beside it, with what was typed kept.
    await details.getByLabel('First name').fill('');
    await details.getByLabel('Last name').fill('Smith');
    await details.getByRole('button', { name: 'Save details' }).click();
    const wrongFirst = details.locator('[data-wrong="firstName"]');
    await wrongFirst.waitFor();
    note(
      'an empty first name is refused beside its box',
      (await wrongFirst.innerText()) === 'Type a first name, up to 100 letters.' &&
        (await details.getByLabel('First name').getAttribute('aria-invalid')) === 'true',
    );
    note(
      'and the last name typed is kept',
      (await details.getByLabel('Last name').inputValue()) === 'Smith',
    );
    note(
      'the refusal is also said beside the button, where the person tapped',
      (await details.locator('[data-check-marked]').isVisible()) &&
        (await details.locator('[data-check-marked]').innerText()).startsWith('Not saved.'),
    );
    note(
      'and no old "Saved" is left above the refusal',
      (await details.getByText('Saved:', { exact: false }).count()) === 0,
    );
    await accessible('a save refused beside its box');
    await details.getByLabel('First name').fill('Jon');
    await details.getByRole('button', { name: 'Save details' }).click();
    const saved = details.getByText('Saved: Jon Smith.');
    await saved.waitFor();
    note('"Saved" is said beside his details, naming him as he is now', await saved.isVisible());
    note(
      'the page is his, by his right name',
      (await page.getByRole('heading', { level: 1, name: 'Jon Smith' }).count()) === 1,
    );
    const falcons = await publicText('/north-valley/teams/falcons');
    note(
      'the public Falcons page says Jon Smith, and never Smiht',
      falcons.includes('Jon Smith') && !falcons.includes('Smiht'),
    );
    await page.reload();
    note('a reload says nothing old', (await page.getByText('Saved: Jon Smith.').count()) === 0);

    at = 'two people save the same person';
    const { page: other } = await signedIn(tokens.owner);
    await other.goto(jonAddress);
    await page.reload();
    // Tab A (opened after B) puts his first and last name differently, marks him a child
    // and gives a guardian's email; tab B, opened before, fixes only his first name.
    const otherDetails = other.locator('#details');
    await otherDetails.getByLabel('First name').fill('Johnny');
    await otherDetails.getByLabel('Last name').fill('Smithson');
    await otherDetails.getByLabel('Child or adult').selectOption('child');
    await otherDetails.getByLabel('Email (optional)').fill('guardian@example.test');
    await otherDetails.getByRole('button', { name: 'Save details' }).click();
    await other.getByText('Saved: Johnny Smithson.').waitFor();
    await details.getByLabel('First name').fill('Jonathan');
    await details.getByRole('button', { name: 'Save details' }).click();
    const stale = details.getByText('Someone else changed this person’s details', {
      exact: false,
    });
    await stale.waitFor();
    note(
      'a save someone else overtook is refused, and what was typed is kept',
      (await details.getByLabel('First name').inputValue()) === 'Jonathan',
    );
    note(
      'and the page shows their version',
      (await page.getByRole('heading', { level: 1, name: 'Johnny Smithson' }).count()) === 1,
    );
    note(
      'beside the box this person changed, what the other saved meanwhile',
      (await details.locator('[data-meanwhile="firstName"]').innerText()).includes('Johnny'),
    );
    note(
      'every box this person did not change shows what is stored now',
      (await details.getByLabel('Last name').inputValue()) === 'Smithson' &&
        (await details.getByLabel('Child or adult').inputValue()) === 'child' &&
        (await details.getByLabel('Email (optional)').inputValue()) === 'guardian@example.test' &&
        (await details.locator('[data-meanwhile]').count()) === 1,
    );
    // Saving again sends only the first name: the other's child choice, last name and
    // email stay (the old fault: the stale boxes put "Smith" and "not a child" back).
    await details.getByRole('button', { name: 'Save details' }).click();
    await details.getByText('Saved: Jonathan Smithson.').waitFor();
    note('saving again then works', true);
    const afterRetry = await publicText('/north-valley/teams/falcons');
    note(
      'after the retry the public page still shows him as a child: first name and initial',
      afterRetry.includes('Jonathan S.') && !afterRetry.includes('Smithson'),
    );
    note(
      "and the other's email is still on his record",
      (await details.getByLabel('Email (optional)').inputValue()) === 'guardian@example.test',
    );

    at = 'his record names his team, and removing says to take him off its roster first';
    const teamsPart = page.locator('[data-person-teams]');
    note(
      'his record says plainly he is on the Falcons, with their admin page and their public page',
      (await teamsPart.innerText()).includes('On Falcons') &&
        (await teamsPart.getByRole('link', { name: 'Its page in Teams' }).count()) === 1 &&
        (await teamsPart.getByRole('link', { name: 'Its public page' }).getAttribute('href')) ===
          '/north-valley/teams/falcons',
    );
    const removePart = page.locator('#remove');
    note(
      'while he is on a roster the remove panel says so, names the team, and has no button',
      (await removePart.locator('[data-on-roster]').innerText()).includes('roster first') &&
        (await removePart.getByRole('link', { name: 'Falcons' }).count()) === 1 &&
        (await removePart.getByRole('button').count()) === 0,
    );

    at = 'one wrong tap on "Remove from the league list" has its way back (A-5)';
    await toPeople();
    const addAda = page.locator('#add-person');
    await addAda.getByLabel('First name').fill('Ada');
    await addAda.getByLabel('Last name').fill('Lovell');
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
      addAda.getByRole('button', { name: 'Add to the league' }).click(),
    ]);
    const adaAddress = page.url().split('#')[0];
    await page.locator('#remove').getByLabel('Yes, I am sure').check();
    await Promise.all([
      page.waitForURL((url) => url.pathname.endsWith('/admin/people')),
      page.locator('#remove').getByRole('button', { name: 'Remove from the league list' }).click(),
    ]);
    const removedNotice = page.locator('[data-removed]');
    await removedNotice.getByRole('button', { name: 'Put them back' }).waitFor();
    note(
      'the removed notice names her and offers "Put them back"',
      (await removedNotice.innerText()).includes('Removed from the league list: Ada Lovell.') &&
        (await removedNotice.getByRole('button', { name: 'Put them back' }).count()) === 1,
      await removedNotice.innerText(),
    );
    note(
      'and she is off the list',
      (await main().getByRole('link', { name: 'Ada Lovell', exact: true }).count()) === 0,
    );
    await Promise.all([
      page.waitForURL((url) => url.href.startsWith(adaAddress)),
      removedNotice.getByRole('button', { name: 'Put them back' }).click(),
    ]);
    await page.getByText('Put back on the league list: Ada Lovell', { exact: false }).waitFor();
    note(
      '"Put them back" brings her back to her record, on no team',
      (await page.getByRole('heading', { level: 1, name: 'Ada Lovell' }).count()) === 1 &&
        (await page.locator('[data-person-teams]').innerText()).includes('On no team'),
    );
    // Past 200 people a team page's picker cannot reach everyone: her record can.
    const addToTeam = page.locator('[data-add-to-team]');
    // The picker starts on "Choose a team", under "Add to a team" (she is on none).
    note(
      'her record\'s picker is labelled "Add to a team" and starts on "Choose a team"',
      (await addToTeam.getByLabel('Add to a team').count()) === 1 &&
        (await addToTeam.locator('select').inputValue()) === '' &&
        (await addToTeam.locator('select option').first().innerText()) === 'Choose a team',
    );
    const teamName = await addToTeam.locator('select option:not([disabled])').first().innerText();
    await addToTeam.locator('select').selectOption({ label: teamName });
    await Promise.all([
      page.waitForURL(/\/admin\/teams\/[^/]+$/),
      addToTeam.getByRole('button', { name: 'Add to a team' }).click(),
    ]);
    note(
      '"Add to a team" on her record puts her on that team’s roster',
      (await main().innerText()).includes('Ada Lovell'),
      teamName,
    );
    await toPeople();
    note(
      'and she is on the list again',
      (await main().getByRole('link', { name: 'Ada Lovell', exact: true }).count()) === 1,
    );

    at = 'people of the same name are told apart, and a second is added only on purpose';
    await page.goto(`${origin}/north-valley/admin/people?q=smithson`);
    note(
      'the search writes each person’s team beside the name',
      (
        await main().locator('.staff-rows li', { hasText: 'Jonathan Smithson' }).innerText()
      ).includes('Falcons'),
    );
    await page.goto(`${origin}/north-valley/admin/people?q=fischer`);
    note(
      'and one on no team says so',
      (await main().locator('.staff-rows li', { hasText: 'Leo Fischer' }).innerText()).includes(
        'No team this season',
      ),
    );
    const addLeo = page.locator('#add-person');
    await addLeo.getByLabel('First name').fill('leo');
    await addLeo.getByLabel('Last name').fill('FISCHER');
    await addLeo.getByRole('button', { name: 'Add to the league' }).click();
    const sameName = addLeo.locator('[data-question="same-name-check"]');
    await sameName.waitFor();
    note(
      'adding a name someone has (in other capitals) asks first, saying where the other is',
      (await sameName.innerText()).includes(
        'There is already a Leo Fischer, on no team. Add another?',
      ),
      await sameName.innerText(),
    );
    // A tick for one name never lets a different one through.
    await sameName.getByLabel('Yes, add another person of this name').check();
    await addLeo.getByLabel('First name').fill('Ada');
    await addLeo.getByLabel('Last name').fill('Lovell');
    await addLeo.getByRole('button', { name: 'Add to the league' }).click();
    await sameName.getByText('There is already a Ada Lovell', { exact: false }).waitFor();
    note('a tick given for one name asks again about another', true);
    await addLeo.getByLabel('First name').fill('Leo');
    await addLeo.getByLabel('Last name').fill('Fischer');
    await addLeo.getByRole('button', { name: 'Add to the league' }).click();
    await sameName.getByText('There is already a Leo Fischer', { exact: false }).waitFor();
    await sameName.getByLabel('Yes, add another person of this name').check();
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
      addLeo.getByRole('button', { name: 'Add to the league' }).click(),
    ]);
    await page.goto(`${origin}/north-valley/admin/people?q=fischer`);
    note(
      'ticked, the second is added, and the list holds two of the name',
      (await main().getByRole('link', { name: 'Leo Fischer', exact: true }).count()) === 2,
    );

    at = 'a 60-letter one-word last name pushes nothing wide at 390';
    const longName = 'Abcdefghij'.repeat(6);
    const addLong = page.locator('#add-person');
    await addLong.getByLabel('First name').fill('Ana');
    await addLong.getByLabel('Last name').fill(longName);
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
      addLong.getByRole('button', { name: 'Add to the league' }).click(),
    ]);
    const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
    note(
      'her record is no wider than the screen',
      (await pageWidth()) <= 390,
      String(await pageWidth()),
    );
    await page.goto(`${origin}/north-valley/admin/people?q=abcdefghij`);
    note('nor is the list that holds her', (await pageWidth()) <= 390, String(await pageWidth()));

    at = 'the small things on People';
    note(
      'People has one filled button',
      (await page.locator('[data-kind="main"]').count()) === 1,
      String(await page.locator('[data-kind="main"]').count()),
    );
    note(
      'the list says how many people',
      /\d+ (person|people)/.test(await main().locator('[data-list-count]').innerText()),
    );
    await page.goto(`${origin}/north-valley/admin/people?page=999`);
    note(
      'a page past the end offers the way back',
      (await main().getByRole('link', { name: 'Back to the first page' }).count()) === 1,
    );
    await page.goto(`${origin}/north-valley/admin/people?q=Wren%20Quill`);
    await main().getByRole('link', { name: 'Add Wren Quill' }).click();
    await page.waitForURL(/add=/);
    note(
      '"Add …" under an empty search carries the typed name into the add form',
      (await page.locator('#add-person').getByLabel('First name').inputValue()) === 'Wren' &&
        (await page.locator('#add-person').getByLabel('Last name').inputValue()) === 'Quill',
    );
    await page.goto(jonAddress);

    at = 'an unlikely date of birth is shown back before it is saved (R-28)';
    const twoYearsAgo = `${new Date().getUTCFullYear() - 2}-01-15`;
    await details.getByLabel('Date of birth (optional)').fill(twoYearsAgo);
    await details.getByRole('button', { name: 'Save details' }).click();
    const ask = details.locator('[data-question="birth-date-check"]');
    await ask.waitFor();
    note(
      'a date making a player very young is said back with the age, and not saved',
      /makes them [12] years? old today/.test(await ask.innerText()) &&
        (await details.getByLabel('Date of birth (optional)').inputValue()) === twoYearsAgo,
      await ask.innerText(),
    );
    note(
      'it is a question, not an error: the date box is not marked invalid, and the tick stands under the sentence',
      (await details.getByLabel('Date of birth (optional)').getAttribute('aria-invalid')) ===
        null &&
        (await ask.getByLabel('Yes, this date of birth is right').count()) === 1 &&
        (await details.locator('[data-wrong]').count()) === 0,
    );
    // A tick given for one unlikely date never lets a different one typed with it through.
    const threeYearsAgo = `${new Date().getUTCFullYear() - 3}-01-15`;
    await ask.getByLabel('Yes, this date of birth is right').check();
    await details.getByLabel('Date of birth (optional)').fill(threeYearsAgo);
    await details.getByRole('button', { name: 'Save details' }).click();
    await ask.getByText('makes them 3 years old', { exact: false }).waitFor();
    note(
      'a tick for one date, with a different date typed, asks again about the new one',
      (await details.getByText('Saved: Jonathan Smithson.').count()) === 0,
    );
    await details.getByLabel('Date of birth (optional)').fill(twoYearsAgo);
    await details.getByRole('button', { name: 'Save details' }).click();
    await ask.getByText(/makes them [12] years? old/).waitFor();
    await details.getByLabel('Yes, this date of birth is right').check();
    await details.getByRole('button', { name: 'Save details' }).click();
    await ask.waitFor({ state: 'detached' });
    note(
      'once ticked as right, it is saved',
      (await details.getByText('Saved: Jonathan Smithson.').count()) === 1 &&
        (await details.getByLabel('Date of birth (optional)').inputValue()) === twoYearsAgo,
    );
    await accessible('an unlikely date of birth asked about');

    at = 'a date that says adult does not untick a child (R-28)';
    await details.getByLabel('Date of birth (optional)').fill('1990-05-05');
    await details.getByLabel('Child or adult').selectOption('child');
    await details.getByRole('button', { name: 'Save details' }).click();
    // "Saved" from the save before is still on screen: wait for what this save brings.
    // The line is there in every state now: wait for the words this save brings.
    const byTick = details.locator('[data-child-note]');
    await byTick.getByText('The date of birth makes them an adult', { exact: false }).waitFor();
    note(
      'the record says beside the tick that they are treated as a child until it is changed',
      (await byTick.count()) === 1 &&
        (await byTick.innerText()).includes('they are treated as a child'),
    );
    await details.getByLabel('Child or adult').selectOption('adult');
    await details.getByRole('button', { name: 'Save details' }).click();
    await details
      .getByText('Treated as an adult: the date of birth and the choice both say so.', {
        exact: false,
      })
      .waitFor();
    note(
      'once they are marked as an adult, the one line says they are treated as an adult because of both, and the name public pages show',
      (await byTick.count()) === 1 &&
        !(await byTick.innerText()).includes('treated as a child') &&
        (await byTick.innerText()).includes('Public pages show: '),
      await byTick.innerText(),
    );
    note(
      'after a save the choice shows what was saved, so the next save sends it again',
      (await details.getByLabel('Child or adult').inputValue()) === 'adult',
    );
    // The other way round: marked as an adult, with a date that makes them ten. The date
    // wins (core's isMinorOn), and the record says so.
    await details
      .getByLabel('Date of birth (optional)')
      .fill(`${new Date().getUTCFullYear() - 10}-01-15`);
    await details.getByRole('button', { name: 'Save details' }).click();
    await byTick.getByText('until their 18th birthday', { exact: false }).waitFor();
    note(
      'marked as an adult with a date that makes them a child: the record says the date wins',
      (await byTick.innerText()).includes('treated as a child until their 18th birthday'),
      await byTick.innerText(),
    );
    note(
      'and the same line names what public pages show of a child, as the public roster does',
      (await byTick.innerText()).includes('Public pages show: Jonathan S.') &&
        (await publicText('/north-valley/teams/falcons')).includes('Jonathan S.'),
      await byTick.innerText(),
    );

    at = "a child's name on a youth team's public roster is put right";
    await page.goto(`${origin}/harbor-city`);
    await page.goto(`${origin}/harbor-city/admin`);
    note(
      'the public Comets page shows Maya before',
      (await publicText('/harbor-city/teams/comets')).includes('Maya'),
    );
    await toTeam('Comets');
    await Promise.all([
      page.waitForURL(/\/admin\/people\/[0-9a-f-]{36}$/),
      main().getByRole('link', { name: 'Maya Cho', exact: true }).click(),
    ]);
    await details.getByLabel('First name').fill('Maia');
    await details.getByRole('button', { name: 'Save details' }).click();
    await details.getByText('Saved: Maia Cho.').waitFor();
    const comets = await publicText('/harbor-city/teams/comets');
    note(
      'the public Comets page shows Maia, and no Maya',
      comets.includes('Maia') && !comets.includes('Maya'),
    );
    await accessible("a child's record, saved");

    at = 'with scripts off, adding someone wrong is refused the same way';
    const { page: plain } = await signedIn(tokens.owner, false);
    await plain.goto(`${origin}/north-valley/admin/people`);
    const plainAdd = plain.locator('#add-person');
    await plainAdd.getByLabel('First name').fill('Ola');
    await plainAdd.getByLabel('Last name').fill('Brandt');
    await plainAdd.getByLabel('Email (optional)').fill('ola.example.test');
    await Promise.all([
      plain.waitForEvent('load'),
      plainAdd.getByRole('button', { name: 'Add to the league' }).click(),
    ]);
    note(
      'refused beside the email box, with scripts off',
      (await plain.locator('#add-person [data-wrong="contactEmail"]').count()) === 1,
    );
    note(
      'the names and the address typed are kept',
      (await plain.locator('#add-person').getByLabel('Last name').inputValue()) === 'Brandt' &&
        (await plain.locator('#add-person').getByLabel('Email (optional)').inputValue()) ===
          'ola.example.test',
    );
    note('nothing was added', !(await plain.locator('main').innerText()).includes('Ola Brandt'));
    note('and nothing typed is in the address', !/Brandt|example/.test(plain.url()), plain.url());

    note(
      'no address the owner was at held a name, an email or a date of birth',
      addresses.every((url) => !/Smiht|Smith|Maia|Maya|example\.test|\d{4}-\d{2}-\d{2}/.test(url)),
      addresses.filter((url) => /Smi|Mai|Maya|example|\d{4}-/.test(url)).join(' '),
    );

    at = 'a registrar adds a child in the draft league';
    const { page: registrar } = await signedIn(tokens.registrar);
    await registrar.goto(`${origin}/quiet-pines/admin/people`);
    const regAdd = registrar.locator('#add-person');
    await regAdd.getByLabel('First name').fill(child.first);
    await regAdd.getByLabel('Last name').fill(child.last);
    await regAdd.getByLabel('Email (optional)').fill(child.email);
    await regAdd.getByLabel('Date of birth (optional)').fill(child.born);
    await regAdd.getByLabel('Child or adult').selectOption('child');
    await Promise.all([
      registrar.waitForURL(/\/admin\/people\/[0-9a-f-]{36}/),
      regAdd.getByRole('button', { name: 'Add to the league' }).click(),
    ]);
    const record = registrar.url().split('#')[0].replace(origin, '');
    note(
      "the registrar sees the child's private details on the record",
      (await registrar.locator('#details').getByLabel('Email (optional)').inputValue()) ===
        child.email &&
        (await registrar
          .locator('#details')
          .getByLabel('Date of birth (optional)')
          .inputValue()) === child.born,
    );
    await accessible("a registrar on a child's record", registrar);

    at = 'what the server sends to each made-up person';
    const sent = async (token, path) => {
      const answer = await fetch(`${origin}${path}`, {
        redirect: 'manual',
        headers: token === null ? {} : { cookie: `srl_session=${token}` },
      });
      return { status: answer.status, html: await answer.text() };
    };
    const holds = (html, ...words) => words.some((word) => html.includes(word));
    for (const who of ['owner', 'admin', 'registrar']) {
      const page = await sent(tokens[who], record);
      note(
        `${who}: the record is sent with the email and the date of birth`,
        page.status === 200 && holds(page.html, child.email) && holds(page.html, child.born),
        `${page.status}`,
      );
      const list = await sent(tokens[who], '/quiet-pines/admin/people');
      note(
        `${who}: the list is sent with the name and no private detail`,
        list.status === 200 &&
          holds(list.html, child.last) &&
          !holds(list.html, child.email, child.born),
        `${list.status}`,
      );
    }
    const refused = [
      'scheduler',
      'programScheduler',
      'editor',
      'scorekeeper',
      'clubAdmin',
      'coach',
      'otherAdmin',
      'stranger',
    ];
    for (const who of [...refused, 'visitor']) {
      const token = who === 'visitor' ? null : tokens[who];
      for (const path of [record, '/quiet-pines/admin/people']) {
        const page = await sent(token, path);
        note(
          `${who}: ${path === record ? 'the record' : 'the list'} is refused and holds nothing of the person`,
          page.status !== 200 &&
            !holds(page.html, child.first, child.last, child.email, child.born),
          `${page.status}`,
        );
      }
    }

    at = "a club admin on a team's page";
    const { page: club } = await signedIn(tokens.clubAdmin);
    await club.goto(`${origin}/quiet-pines/admin/teams`);
    await Promise.all([
      club.waitForURL(/\/admin\/teams\/[0-9a-f-]{36}$/),
      club.locator('main').getByRole('link', { name: 'Lions', exact: true }).click(),
    ]);
    note(
      'a club admin, who does not run People, gets no link to a person from the roster',
      (await club.locator('main a[href*="/admin/people/"]').count()) === 0 &&
        (await club.getByText('Ada Lionel').count()) >= 1,
    );
    await visitor.close();
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`People screens browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`People screens browser test passed: ${checked.length} checks in a real browser.`);
