// Step 2.125: League settings → Profile, Publish, Archive and Un-archive in a real browser
// ON A PHONE-SIZED SCREEN, against the web app on its made-up stand-in (APP_ENV=test).
// Nothing leaves this computer; every league and person is made up. Builds the app first
// unless given --no-build. Scripts are switched off for the owner: every form works as a
// plain form, and each question is a page of its own.
//
// The owner opens the draft league's staff page and follows the notice's link "Publish it
// in League settings", where Profile is the first part. The league is for under-18s, so
// publishing waits for its privacy choice; once it is made the owner publishes and a
// visitor reads the league. The owner changes the name; the short name (reading the
// 12-month forwarding sentence first; the old address forwards); the contact email (a
// hand-post that empties it is refused); the city, the time zone and the listing. "Who
// plays" toward adults asks for the tick (a hand-post without it is refused); with
// "children in full" confirmed the screen says before saving that bringing children in
// clears it, and after the move back to under-18s (which never asks) it is cleared. A
// scheduler's and a scorekeeper's hand-posts change nothing. Archive asks once; the public
// pages stay viewable (U-9: archived is read-only, still viewable); the archived notice
// links to League settings, where Un-archive brings the league back.
import {
  accessibilityProblems,
  buildNext,
  freePort,
  launch,
  startNext,
  waitFor,
  whatWentWrong,
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
const limit = { timeout: 60_000 };
const phone = { width: 390, height: 844 };
let league = 'quiet-pines';
const renamed = 'still-pines';

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
  const ownerContext = await browser.newContext({ javaScriptEnabled: false, viewport: phone });
  await ownerContext.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
  const owner = await ownerContext.newPage();
  owner.setDefaultTimeout(60_000);
  const settings = () => `${origin}/${league}/admin/settings`;
  const profile = owner.locator('section#settings-profile');
  const panel = owner.locator('section#publish');
  const form = (mark) => owner.locator(`form[data-form="${mark}"]`);
  const said = async () =>
    (await owner.locator('[role=status], [role=alert]').first().innerText(limit)).trim();
  /** Presses `button` and waits, with a limit, for the answer's page. */
  const submit = (button) =>
    Promise.all([owner.waitForURL(/done=|problem=/, limit), button.click(limit)]);
  /**
   * Presses Profile form `mark`'s button and waits, with a limit, for League settings to be
   * drawn again and for "Saved: …" beside that form (step 2.155 part 3); returns its words.
   */
  const saveProfile = async (mark) => {
    await Promise.all([
      owner.waitForResponse(
        (r) => r.request().method() === 'GET' && r.url().startsWith(settings()),
        limit,
      ),
      form(mark).getByRole('button').click(limit),
    ]);
    const line = savedBeside(mark);
    await line.waitFor(limit);
    return (await line.innerText(limit)).trim();
  };
  /** The "Saved" line that stands right after Profile form `mark`. */
  const savedBeside = (mark) => profile.locator(`form[data-form="${mark}"] + [data-said="saved"]`);
  /** The hidden fields of the owner's form `mark` (its action among them), as drawn now. */
  const hiddenOf = async (mark) => {
    // The Archive form is drawn only while it asks (?archive=ask).
    await owner.goto(`${settings()}${mark === 'archive' ? '?archive=ask' : ''}`, limit);
    return form(mark)
      .locator('input[type=hidden]')
      .evaluateAll((inputs) => inputs.map((input) => [input.name, input.value]));
  };
  /** Posts the owner's form `mark` by hand with `token`'s sign-in and `extra` fields. */
  const handPost = async (mark, token, extra) => {
    const body = new FormData();
    const hidden = await hiddenOf(mark);
    note(
      `the owner's ${mark} form is there to copy`,
      hidden.some(([name]) => name.startsWith('$ACTION')),
    );
    for (const [name, value] of hidden) if (name !== '') body.append(name, value);
    for (const [name, value] of Object.entries(extra)) body.set(name, value);
    const answer = await fetch(settings(), {
      method: 'POST',
      body,
      headers: { origin, cookie: `srl_session=${token}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
    });
    return {
      status: answer.status,
      to: answer.headers.get('location') ?? '',
      // A Profile form answers a refusal in the page itself (step 2.155 part 3).
      body: answer.status === 200 ? await answer.text() : '',
    };
  };
  const visitorAnswer = async (path) =>
    (await fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(60_000) }))
      .status;

  await step('the draft notice leads to League settings, Profile first', async () => {
    note(
      'before: a visitor is told the draft is not found',
      (await visitorAnswer(`/${league}`)) === 404,
    );
    await owner.goto(`${origin}/${league}/admin`, limit);
    // On a phone the notice is a pill in the header; tapping it opens the sentence.
    await owner.locator('.staff-bar .staff-status > summary').click(limit);
    // The one link a keyboard reaches is the clipped copy's: with the focus it can be seen.
    await owner.keyboard.press('Tab');
    const focused = await owner.evaluate(() => {
      const at = document.activeElement;
      const box = at?.getBoundingClientRect();
      return {
        text: at?.textContent ?? '',
        width: box?.width ?? 0,
        height: box?.height ?? 0,
        links: document.querySelectorAll('.staff-bar .staff-status a:not([tabindex="-1"])').length,
      };
    });
    note(
      'on a phone the keyboard reaches the notice link once, and its focus can be seen',
      focused.text.includes('Publish it in League settings') &&
        focused.width > 20 &&
        focused.height > 10 &&
        focused.links === 1,
      JSON.stringify(focused),
    );
    // The focused box lies over the strip; leave it before tapping the strip's link.
    await owner.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await Promise.all([
      owner.waitForURL(/\/admin\/settings/, limit),
      owner
        .locator('.staff-status-band a', { hasText: 'Publish it in League settings' })
        .click(limit),
    ]);
    const first = await owner.locator('main section.staff-panel').first().getAttribute('id', limit);
    note('Profile is the first part of League settings', first === 'settings-profile', `${first}`);
    const audience = await form('who-plays').locator('input[type=radio]:checked').inputValue(limit);
    note('the draft league is for under-18s', audience === 'youth', audience);
    const problems = await accessibilityProblems(owner);
    note(
      'the settings screen on a phone has no accessibility problems',
      problems.length === 0,
      problems.join('; '),
    );
    const width = await owner.evaluate(() => document.documentElement.scrollWidth);
    note(
      'the settings screen fits a phone without side-scrolling',
      width <= phone.width,
      `${width}`,
    );
  });

  await step('an under-18s league asks for its privacy choice before publishing', async () => {
    const privacy = panel.locator('li[data-check="privacyChosen"][data-met="no"]');
    note('the privacy choice is listed as not done', (await privacy.count()) === 1);
    note(
      'no Publish button while it is not done',
      (await panel.getByRole('link', { name: 'Publish' }).count()) === 0,
    );
    const names = 'section[data-setting="privacy.publicNames"]';
    await owner.locator(`${names} input[type=radio][value="fullName"]`).check(limit);
    const named = await settingAnswer(
      owner,
      names,
      owner.locator(`${names} button[type=submit]`).first(),
    );
    note('names on public pages is saved, said beside it', named.saved, named.text);
    await owner.goto(settings(), limit);
    note(
      'every item is met once the choice is made',
      (await panel.locator('li[data-met="no"]').count()) === 0,
    );
    await Promise.all([
      owner.waitForURL(/publish=ask/, limit),
      panel.getByRole('link', { name: 'Publish' }).click(limit),
    ]);
    await submit(panel.getByRole('button', { name: 'Publish' }));
    note('the owner published', (await said()).includes('The league is published.'));
    note('after: a visitor reads the league', (await visitorAnswer(`/${league}`)) === 200);
  });

  await step('the name and the short name', async () => {
    await owner.goto(settings(), limit);
    await form('league-name').locator('input[name="name"]').fill('Quiet Pines Spring League');
    const savedName = await saveProfile('league-name');
    note('"Saved" beside the name names it', savedName === "Saved: the league's name.", savedName);
    note(
      'the new name is saved',
      (await form('league-name').locator('input[name="name"]').inputValue(limit)) ===
        'Quiet Pines Spring League',
    );
    const words = await form('short-name').innerText(limit);
    note(
      'the short name says the old address forwards for 12 months',
      words.includes('keeps forwarding to the new one for 12 months'),
      words,
    );
    await form('short-name').locator('input[name="slug"]').fill(renamed);
    const [posted] = await Promise.all([
      owner.waitForResponse((r) => r.request().method() === 'POST', limit),
      owner.waitForURL((url) => url.pathname.startsWith(`/${renamed}/`), limit),
      form('short-name').getByRole('button').click(limit),
    ]);
    // The answer itself names the new address, not the old one that would forward.
    const sentTo = posted.headers()['location'] ?? '';
    note(
      'the rename answers with the new address directly',
      posted.status() === 303 && new URL(sentTo, origin).pathname.startsWith(`/${renamed}/`),
      `${posted.status()} ${sentTo}`,
    );
    const renamedLine = savedBeside('short-name');
    await renamedLine.waitFor(limit);
    note(
      'after renaming, beside the short name the screen says the old address forwards',
      (await renamedLine.innerText(limit)).includes(
        'Saved: the short name. The old address forwards to the new one for 12 months.',
      ),
    );
    await owner.reload(limit);
    note('a reload says nothing old', (await profile.locator('[data-said]').count()) === 0);
    const old = await fetch(`${origin}/${league}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
    });
    const to = old.headers.get('location') ?? '';
    note(
      'the old address forwards to the new one',
      old.status >= 300 && old.status < 400 && to.includes(`/${renamed}`),
      `${old.status} ${to}`,
    );
    league = renamed;
    note(
      'a visitor reads the league at its new address',
      (await visitorAnswer(`/${league}`)) === 200,
    );
  });

  await step('contact email, city, time zone and listing', async () => {
    const emptied = await handPost('league-profile', 'local-owner-token', {
      contactEmail: '',
      city: '',
      timeZone: 'UTC',
    });
    note(
      'a hand-post emptying the contact email is refused beside that box, naming it',
      emptied.status === 200 &&
        emptied.body.includes('data-problem="league-profile"') &&
        emptied.body.includes('Contact email: ') &&
        /<input[^>]*aria-invalid="true"[^>]*name="contactEmail"|<input[^>]*name="contactEmail"[^>]*aria-invalid="true"/.test(
          emptied.body,
        ),
      `${emptied.status} ${emptied.to}`,
    );
    note(
      'the refused form keeps the time zone as typed',
      /<input[^>]*name="timeZone"[^>]*value="UTC"/.test(emptied.body),
    );
    const fields = form('league-profile');
    const before = await fields.locator('input[name="listed"]').isChecked(limit);
    note(
      'the contact email is kept',
      (await fields.locator('input[name="contactEmail"]').inputValue(limit)) !== '',
    );
    await fields.locator('input[name="contactEmail"]').fill('pines-desk@example.test');
    await fields.locator('input[name="city"]').fill('Pine Hollow East');
    await fields.locator('input[name="timeZone"]').fill('America/Chicago');
    await fields.locator('input[name="listed"]').setChecked(!before, limit);
    const savedProfile = await saveProfile('league-profile');
    note(
      '"Saved" beside the profile names what was saved',
      savedProfile.startsWith('Saved: the contact email, city, time zone and listing.'),
      savedProfile,
    );
    await owner.goto(settings(), limit);
    note(
      'the contact email is the new one',
      (await fields.locator('input[name="contactEmail"]').inputValue(limit)) ===
        'pines-desk@example.test',
    );
    note(
      'the city is the new one',
      (await fields.locator('input[name="city"]').inputValue(limit)) === 'Pine Hollow East',
    );
    note(
      'the time zone is the new one',
      (await fields.locator('input[name="timeZone"]').inputValue(limit)) === 'America/Chicago',
    );
    note(
      'the listing changed',
      (await fields.locator('input[name="listed"]').isChecked(limit)) === !before,
    );
    await fields.locator('input[name="listed"]').setChecked(before, limit);
    await saveProfile('league-profile');
    await owner.goto(settings(), limit);
    note(
      'the listing changed back',
      (await fields.locator('input[name="listed"]').isChecked(limit)) === before,
    );
  });

  await step('who plays, toward adults and back', async () => {
    const refused = await handPost('who-plays', 'local-owner-token', { audience: 'adult' });
    note(
      'toward adults without the tick is refused by the server',
      refused.status === 200 &&
        refused.body.includes('data-problem="who-plays"') &&
        refused.body.includes('Tick the confirmation to show more people as adults'),
      `${refused.status} ${refused.to}`,
    );
    const plays = form('who-plays');
    // The same refusal in the page (step 2.155 part 3): the choice is kept, the tick marked.
    await owner.goto(settings(), limit);
    await plays.locator('input[type=radio][value="adult"]').check(limit);
    await plays.getByRole('button').click(limit);
    const problem = plays.locator('[data-problem="who-plays"]');
    await problem.waitFor(limit);
    note(
      'refused in the page: the sentence is beside the tick and names it',
      (await problem.innerText(limit)).includes('Tick the confirmation'),
    );
    note(
      'refused in the page: "for adults" is still chosen and the tick is marked',
      (await plays.locator('input[type=radio]:checked').inputValue(limit)) === 'adult' &&
        (await plays.locator('input[name="confirmed"]').getAttribute('aria-invalid', limit)) ===
          'true',
    );
    await owner.goto(settings(), limit);
    note(
      'still under-18s after the refusal',
      (await plays.locator('input[type=radio]:checked').inputValue(limit)) === 'youth',
    );
    note(
      'from under-18s the screen asks for the tick',
      (await plays.locator('[data-says="confirm-toward-adults"]').count()) === 1,
    );
    await plays.locator('input[type=radio][value="adult"]').check(limit);
    await plays.locator('input[name="confirmed"]').check(limit);
    note('"Saved" beside who plays', (await saveProfile('who-plays')) === 'Saved: who plays.');
    await owner.goto(settings(), limit);
    note(
      'the league is now for adults',
      (await plays.locator('input[type=radio]:checked').inputValue(limit)) === 'adult',
    );
    note(
      'from adults no move asks for the tick',
      (await plays.locator('[data-says="confirm-toward-adults"]').count()) === 0,
    );
    note(
      'with no full names confirmed, nothing says it clears them',
      (await plays.locator('[data-says="clears-full-names"]').count()) === 0,
    );
    const full = owner.locator('section[data-setting="privacy.childrenInFullConfirmed"]');
    await full.locator('input[type=checkbox]').first().check(limit);
    const confirmed = await settingAnswer(
      owner,
      'section[data-setting="privacy.childrenInFullConfirmed"]',
      full.locator('button[type=submit]').first(),
    );
    note('the confirmation is saved, said beside it', confirmed.saved, confirmed.text);
    await owner.goto(settings(), limit);
    note(
      'children in full is confirmed',
      (await full.innerText(limit)).includes('Now: set for this league.'),
    );
    const warning = plays.locator('[data-says="clears-full-names"]');
    note(
      'before saving, the screen says bringing children in clears full names',
      (await warning.count()) === 1 && (await warning.innerText(limit)).includes('back to no'),
    );
    await plays.locator('input[type=radio][value="youth"]').check(limit);
    const back = await saveProfile('who-plays');
    note(
      'the move back is saved without a tick, and says full names were cleared',
      back.includes('back where a youth league starts'),
      back,
    );
    note(
      'the published league stays published, and asks for its privacy choices (S-96)',
      (await panel.getAttribute('data-status', limit)) === 'live' &&
        (await panel
          .locator('[data-says="confirm-privacy"] [data-check="privacyChosen"]')
          .count()) === 1,
    );
    const publicPage = async () =>
      (await fetch(`${origin}/${league}`, { signal: AbortSignal.timeout(60_000) })).text();
    note(
      'the public page now keeps search engines out, as for any league with children (U-18)',
      /<meta name="robots" content="[^"]*noindex/.test(await publicPage()),
    );
    note(
      'the league is for under-18s again',
      (await plays.locator('input[type=radio]:checked').inputValue(limit)) === 'youth',
    );
    await plays.locator('input[type=radio][value="adult"]').check(limit);
    await plays.locator('input[name="confirmed"]').check(limit);
    await saveProfile('who-plays');
    await owner.goto(settings(), limit);
    note(
      'children in full was cleared',
      (await full.innerText(limit)).includes('Now: the default.'),
    );
    note(
      'so nothing says it clears them now',
      (await plays.locator('[data-says="clears-full-names"]').count()) === 0,
    );
  });

  await step('a scheduler and a scorekeeper change nothing', async () => {
    for (const who of ['scheduler', 'scorekeeper']) {
      const token = `local-${who}-token`;
      const posts = [
        ['league-name', { name: `Taken by the ${who}` }],
        ['short-name', { slug: `${who}-pines` }],
        ['league-profile', { contactEmail: `${who}@example.test`, city: who, timeZone: 'UTC' }],
        ['who-plays', { audience: 'youth' }],
        ['archive', {}],
      ];
      for (const [mark, extra] of posts) {
        const answer = await handPost(mark, token, extra);
        // A Profile form's save is a 303 with nothing in the address (step 2.155 part 3).
        note(
          `the ${who}'s ${mark} hand-post is not taken`,
          answer.status < 500 &&
            !answer.to.includes('done=') &&
            (mark === 'archive' || answer.status !== 303),
          `${answer.status} ${answer.to}`,
        );
      }
    }
    await owner.goto(settings(), limit);
    note(
      'the name is unchanged',
      (await form('league-name').locator('input[name="name"]').inputValue(limit)) ===
        'Quiet Pines Spring League',
    );
    note(
      'the short name is unchanged',
      (await form('short-name').locator('input[name="slug"]').inputValue(limit)) === renamed,
    );
    note(
      'who plays is unchanged',
      (await form('who-plays').locator('input[type=radio]:checked').inputValue(limit)) === 'adult',
    );
    note(
      'the league is still published',
      (await panel.getAttribute('data-status', limit)) === 'live',
    );
    const kept = form('league-profile');
    note(
      'the contact email, city and time zone are unchanged',
      !['scheduler@example.test', 'scorekeeper@example.test'].includes(
        await kept.locator('input[name="contactEmail"]').inputValue(limit),
      ) &&
        !['scheduler', 'scorekeeper'].includes(
          await kept.locator('input[name="city"]').inputValue(limit),
        ) &&
        (await kept.locator('input[name="timeZone"]').inputValue(limit)) !== 'UTC',
      `${await kept.locator('input[name="contactEmail"]').inputValue(limit)} / ${await kept.locator('input[name="city"]').inputValue(limit)} / ${await kept.locator('input[name="timeZone"]').inputValue(limit)}`,
    );
  });

  await step('archive and un-archive', async () => {
    await owner.goto(settings(), limit);
    await Promise.all([
      owner.waitForURL(/archive=ask/, limit),
      panel.getByRole('link', { name: 'Archive' }).click(limit),
    ]);
    note('Archive asks once', (await panel.innerText(limit)).includes('Archive this league?'));
    await submit(panel.getByRole('button', { name: 'Archive' }));
    note('the screen says it is archived', (await said()).includes('The league is archived.'));
    note(
      'the profile cannot be changed while archived',
      (await profile.innerText(limit)).includes('cannot be changed now'),
    );
    note('an archived league stays viewable (U-9)', (await visitorAnswer(`/${league}`)) === 200);
    await owner.goto(`${origin}/${league}/admin`, limit);
    // On a phone the notice is a pill in the header; tapping it opens the sentence.
    await owner.locator('.staff-bar .staff-status > summary').click(limit);
    await Promise.all([
      owner.waitForURL(/\/admin\/settings/, limit),
      owner
        .locator('.staff-status-band a', { hasText: 'Un-archive it in League settings' })
        .click(limit),
    ]);
    await submit(panel.getByRole('button', { name: 'Un-archive' }));
    note(
      'the screen says it is published again',
      (await said()).includes('The league is published again.'),
    );
    note('the league is live again', (await panel.getAttribute('data-status', limit)) === 'live');
  });

  await step('a Profile form posted twice with one token is saved once', async () => {
    const profileChanges = async () => {
      await owner.goto(`${origin}/${league}/admin/settings/activity`, limit);
      const texts = await owner.locator('[data-activity-log] > li').allInnerTexts();
      return texts.filter((text) => text.includes("Changed the league's profile")).length;
    };
    const before = await profileChanges();
    await owner.goto(settings(), limit);
    // Every box of the form as drawn, its one-time token among them; then a new city.
    const fields = await form('league-profile').evaluate((element) =>
      Object.fromEntries([...new FormData(element).entries()].map(([k, v]) => [k, String(v)])),
    );
    note('the profile form carries a one-time token', (fields['requestToken'] ?? '') !== '');
    const statuses = [];
    for (let i = 0; i < 2; i += 1) {
      const body = new FormData();
      for (const [name, value] of Object.entries(fields)) body.append(name, value);
      body.set('city', 'Twice Pine Ridge');
      const answer = await fetch(settings(), {
        method: 'POST',
        body,
        headers: { origin, cookie: 'srl_session=local-owner-token' },
        redirect: 'manual',
        signal: AbortSignal.timeout(60_000),
      });
      statuses.push(answer.status);
    }
    note(
      'both posts of the profile form are answered as saved',
      statuses.every((status) => status === 303),
      String(statuses),
    );
    const after = await profileChanges();
    note(
      'posted twice, one change in the activity log',
      after === before + 1,
      `${before} then ${after}`,
    );
  });

  await step('each change is one entry in the activity log', async () => {
    const kinds = {
      profile: "Changed the league's profile",
      whoPlays: 'Changed who plays in the league',
      archive: "Changed the league's state to",
    };
    const counts = async () => {
      await owner.goto(`${origin}/${league}/admin/settings/activity`, limit);
      const texts = await owner.locator('[data-activity-log] > li').allInnerTexts();
      return Object.fromEntries(
        Object.entries(kinds).map(([kind, words]) => [
          kind,
          texts.filter((text) => text.includes(words)).length,
        ]),
      );
    };
    const before = await counts();
    await owner.goto(settings(), limit);
    await form('league-profile').locator('input[name="city"]').fill('Lower Pine Ridge', limit);
    await saveProfile('league-profile');
    await form('who-plays').locator('input[type=radio][value="mixed"]').check(limit);
    await saveProfile('who-plays');
    await owner.goto(`${settings()}?archive=ask`, limit);
    await submit(panel.getByRole('button', { name: 'Archive' }));
    const after = await counts();
    for (const kind of Object.keys(kinds)) {
      note(
        `one ${kind} change is one entry in the activity log`,
        after[kind] === before[kind] + 1,
        `${before[kind]} then ${after[kind]}`,
      );
    }
  });
}

await browser?.close();
server?.child.kill();

if (failures.length > 0) {
  console.error(`League profile browser check failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`League profile browser check passed: ${checked.length} checks in a real browser.`);
