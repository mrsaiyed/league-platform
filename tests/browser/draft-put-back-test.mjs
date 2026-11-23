// Step 2.185: a removed game stays in the draft with "Put it back", and the draft's count
// is what publishing would change. In a real browser at phone width (390), on the web
// app's made-up stand-in (APP_ENV=test); nothing leaves this computer and every team and
// game is made up. Builds the app first unless given --no-build; --dev runs `next dev`.
//
// The walk of 2026-11-16 (findings M-3 and M-4) found "Put it back" lasting one screen:
// after any other edit the removed game left no trace in the grid; the top line counted
// the draft's saved edits ("2 changes" after a remove and a put back, while the publish
// box said nothing changes); a reload showed the old "Removed … Put it back" again, and a
// second tap was answered "Someone else changed the schedule draft".
//
// The made-up owner does the whole job twice, once with scripts off (plain forms) and once
// with scripts on, starting at the admin's home and from there only tapping: Schedule; a
// published game removed (it stays, struck through, with its answer and "Put it back");
// two other games moved (it is still there, "Removed in this draft"); put back from there;
// a reload shows no old notice; a tap on "Put it back" from a page drawn before (the
// phone's Back) says the game is already back and adds nothing; a game only ever in the
// draft is added and removed, and is gone after the next edit; the two moves undone, the
// draft is "the same as the published schedule" with "Discard the draft" beside it, which
// is tapped. At every step the top line and the publish box give the same number, and the
// publish box's summary adds up to it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
/** With --pictures, the picture of a removed game played since goes to .local/shots/390. */
const pictures = process.argv.includes('--pictures');
const shotsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.local/shots');
let built = true;
if (!dev && !process.argv.includes('--no-build')) {
  built = await buildNext();
  if (!built) failures.push('next build failed or took over 10 minutes');
}

const screen = { width: 390, height: 844 };

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
    for (const scripts of [false, true]) {
      const way = scripts ? 'scripts on' : 'scripts off';
      const context = await browser.newContext({ javaScriptEnabled: scripts, viewport: screen });
      await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
      const page = await context.newPage();
      page.setDefaultTimeout(dev ? 120_000 : 60_000);
      const check = (label, ok, detail) => note(`${label} (${way})`, ok, detail);
      const accessible = async (label) => {
        const problems = await accessibilityProblems(page);
        check(`accessibility: ${label}`, problems.length === 0, problems.join('; '));
        const wide = await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        );
        check(`no sideways scrolling at phone width: ${label}`, wide);
      };
      /**
       * Taps, and waits until `done` is on the page. With scripts off every tap loads a new
       * page; with scripts on the page may be drawn again in place, its address unchanged.
       */
      const tap = async (locator, done) => {
        if (scripts) await locator.click();
        else await Promise.all([page.waitForEvent('load'), locator.click()]);
        await done.first().waitFor({ state: 'attached' });
      };
      /** On the screen as the page shows it now, without scrolling. */
      const onScreen = async (locator) => {
        const box = await locator.first().boundingBox();
        return box !== null && box.y >= 0 && box.y + Math.min(box.height, 40) <= screen.height;
      };
      const publishBox = page.locator('section', {
        has: page.getByRole('heading', { name: 'Publish', exact: true }),
      });
      /**
       * The number the top line gives, the one the publish box gives and the sum of its
       * summary's numbers: all three must agree ("" where the page gives none).
       */
      const counts = async (label) => {
        const line = page.locator('[data-draft-count]');
        const top = (await line.count()) === 1 ? await line.getAttribute('data-draft-count') : '';
        const lineText = (await line.count()) === 1 ? await line.innerText() : '';
        const boxCount = publishBox.locator('[data-publish-count]');
        const box =
          (await boxCount.count()) === 1 ? await boxCount.getAttribute('data-publish-count') : '0';
        const boxText = (await publishBox.count()) === 1 ? await publishBox.innerText() : '';
        const summary = /add (\d+), move (\d+), remove (\d+), and change how (\d+)/.exec(boxText);
        const rounds =
          /Rounds added: (\d+)\. Rounds removed: (\d+)\. Rounds renamed: (\d+)\. Round dates changed: (\d+)\./.exec(
            boxText,
          );
        const sum =
          summary === null || rounds === null
            ? ''
            : String([...summary.slice(1), ...rounds.slice(1)].reduce((a, n) => a + Number(n), 0));
        // A draft that changes nothing: one calm sentence in the box, no zeros, no red.
        const calm =
          boxText.includes(
            'The draft is the same as the published schedule, so there is nothing to publish.',
          ) &&
          !boxText.includes('Publishing will add') &&
          (await publishBox.locator('[data-kind="error"]').count()) === 0;
        const said =
          top === '0'
            ? lineText.includes('The draft is the same as the published schedule.') && calm
            : top === '1'
              ? lineText.includes('Draft in progress: 1 change not yet published.') &&
                boxText.includes('Publishing makes 1 change.')
              : lineText.includes(`Draft in progress: ${top} changes not yet published.`) &&
                boxText.includes(`Publishing makes ${top} changes.`);
        check(
          `the top line and the publish box give the same number: ${label}`,
          top !== '' && top === box && (top === '0' ? sum === '' : top === sum) && said,
          `top ${top}, box ${box}, summary ${sum}: ${lineText} / ${boxText.slice(0, 240)}`,
        );
        return Number(top);
      };
      const editable = page.locator('li[data-game]', {
        has: page.locator('summary', { hasText: 'Edit this game' }),
      });
      const nameOf = async (li) => ((await li.locator('strong').first().innerText()) ?? '').trim();
      const savedIn = (locator, text) => locator.locator('#saved', { hasText: text });

      at = `${way}: the owner opens the admin and taps Schedule`;
      await page.goto(`${origin}/north-valley/admin`);
      await openStaffMenu(page);
      await tap(
        page.locator('nav').getByRole('link', { name: 'Schedule', exact: true }).first(),
        page.locator('section[data-round]'),
      );
      check(
        'the season starts with no draft',
        (await page.locator('[data-draft-count]').count()) === 0,
      );

      at = `${way}: a published game is removed`;
      const removedGame = editable.first();
      const gameId = await removedGame.getAttribute('data-game');
      if (gameId === null) throw new Error('no game to remove');
      const name = await nameOf(removedGame);
      const lineBefore = (await removedGame.locator('p').first().innerText()).trim();
      await removedGame.locator('summary', { hasText: 'Edit this game' }).click();
      const struck = page.locator(`li[data-removed-game="${gameId}"]`);
      await tap(
        removedGame.getByRole('button', { name: 'Remove game' }),
        savedIn(struck, 'Removed:'),
      );
      const answer = savedIn(struck, 'Removed:');
      check(
        'the removed game stays in its place, struck through, with its answer and "Put it back"',
        (await struck.locator('del').count()) === 2 &&
          (await answer.innerText()).startsWith(`Removed: ${name}, `) &&
          (await answer.getByRole('button', { name: 'Put it back' }).count()) === 1,
        await struck.innerText(),
      );
      check('the answer is where the phone is looking', await onScreen(answer));
      check(
        "the struck game's own name is in view too, not under the bar at the top",
        await onScreen(struck.locator('strong')),
      );
      check(
        '"Put it back" in the answer is the filled button, spoken with the game\'s name',
        (await answer
          .getByRole('button', { name: `Put it back in the draft: ${name}` })
          .count()) === 1 &&
          (await answer.getByRole('button', { name: 'Put it back' }).getAttribute('data-kind')) ===
            'main',
      );
      check(
        'the answer is a removal, told apart from a save',
        (await answer.getAttribute('data-kind')) === 'removed',
      );
      check(
        'the game is no longer one of the grid’s games',
        (await page.locator(`li[data-game="${gameId}"]`).count()) === 0,
      );
      await counts('after the removal');
      await accessible('a published game removed');

      at = `${way}: two other games are moved`;
      const moved = [];
      // Chosen first: a moved game takes its new place in the round's order.
      const toMove = [
        await editable.nth(0).getAttribute('data-game'),
        await editable.nth(1).getAttribute('data-game'),
      ];
      for (const [i, time] of ['21:15', '21:45'].entries()) {
        const id = toMove[i];
        const game = page.locator(`li[data-game="${id}"]`);
        await game.locator('summary', { hasText: 'Edit this game' }).click();
        const field = game.locator('input[name=time]');
        moved.push({ id, was: await field.inputValue() });
        await field.fill(time);
        const li = page.locator(`li[data-game="${id}"]`);
        await tap(game.getByRole('button', { name: 'Save game' }), savedIn(li, 'Saved'));
        const n = await counts(`after move ${i + 1}`);
        check(`move ${i + 1} counts as one more change`, n === i + 2, `${n}`);
        const still = await struck.innerText();
        check(
          `after move ${i + 1} the removed game is still there, struck through, with "Put it back"`,
          (await struck.locator('del').count()) === 2 &&
            still.includes('Removed in this draft.') &&
            (await struck.getByRole('button', { name: 'Put it back' }).count()) === 1,
          still,
        );
      }
      // Quieter than the round's games: an outlined button beside one sentence. Its height is
      // bounded by the shared notice (its padding and a 44-high button); a compact notice is
      // the design lead's piece to add (DESIGN.md section 1).
      const standing = struck.getByRole('button', { name: 'Put it back' });
      const heightOf = async (locator) => (await locator.boundingBox())?.height ?? 0;
      const live = editable.nth(2);
      const [struckHeight, liveHeight] = [await heightOf(struck), await heightOf(live)];
      check(
        'the standing struck row has an outlined "Put it back" beside its sentence, under 1.45 games tall',
        (await standing.getAttribute('data-kind')) === null && struckHeight <= liveHeight * 1.45,
        `struck ${struckHeight}, game ${liveHeight}`,
      );
      await accessible('a removed game after two other edits');

      at = `${way}: the removed game is put back from the grid`;
      const stalePage = await context.newPage();
      await stalePage.goto(page.url().replace(/#.*$/, ''));
      const back = page.locator(`li[data-game="${gameId}"]`);
      await tap(
        struck.getByRole('button', { name: 'Put it back' }),
        savedIn(back, 'Put back in the draft'),
      );
      check(
        'the game is back exactly as it was, said beside it',
        (await back.locator('p').first().innerText()).trim() === lineBefore &&
          (await savedIn(back, `Put back in the draft: ${name}, as it was.`).count()) === 1 &&
          (await struck.count()) === 0,
        await back.innerText(),
      );
      const afterPutBack = await counts('after the put back');
      check('putting it back takes its change away', afterPutBack === 2, `${afterPutBack}`);

      at = `${way}: the page is reloaded`;
      await page.reload();
      await page.locator('[data-draft-count]').waitFor();
      check(
        'a reload shows no old notice',
        (await page.locator('#saved').count()) === 0 &&
          !(await page.locator('main').innerText()).includes('Put back in the draft') &&
          (await page.getByRole('button', { name: 'Put it back' }).count()) === 0,
      );
      await counts('after the reload');

      at = `${way}: removed and put back again from the plain address`;
      // The address now holds no answer: with scripts on the page is drawn again in place
      // (its address unchanged), with scripts off it is loaded again. Both say it once.
      const plain = page.url();
      const again = page.locator(`li[data-game="${gameId}"]`);
      await again.locator('summary', { hasText: 'Edit this game' }).click();
      await tap(again.getByRole('button', { name: 'Remove game' }), savedIn(struck, 'Removed:'));
      check(
        'removed again: said at the struck game, the address holding no answer',
        (await struck.locator('del').count()) === 2 &&
          (scripts ? page.url() === plain : !page.url().includes('done=')),
        page.url(),
      );
      await counts('after removing it again');
      await tap(
        savedIn(struck, 'Removed:').getByRole('button', { name: 'Put it back' }),
        savedIn(back, 'Put back in the draft'),
      );
      check(
        'put back again from its answer, said once',
        (await page.locator('#saved').count()) === 1 &&
          (await page.locator(`li[data-removed-game="${gameId}"]`).count()) === 0,
      );
      await counts('after putting it back again');
      await page.reload();
      await page.locator('[data-draft-count]').waitFor();
      check(
        'a reload after that shows no old notice',
        (await page.locator('#saved').count()) === 0,
      );

      at = `${way}: "Put it back" is tapped on a page drawn before (the phone's Back)`;
      const staleStruck = stalePage.locator(`li[data-removed-game="${gameId}"]`);
      if (scripts) await staleStruck.getByRole('button', { name: 'Put it back' }).click();
      else
        await Promise.all([
          stalePage.waitForEvent('load'),
          staleStruck.getByRole('button', { name: 'Put it back' }).click(),
        ]);
      const already = stalePage.locator('#saved', { hasText: 'is already back' });
      await already.waitFor({ state: 'attached' });
      check(
        'a second "Put it back" says the game is already back, not that someone else changed it',
        (await already.innerText()).startsWith(`${name} is already back in the draft.`) &&
          !(await stalePage.locator('main').innerText()).includes('Someone else'),
        await already.innerText(),
      );
      await stalePage.close();
      await page.reload();
      await page.locator('[data-draft-count]').waitFor();
      const afterSecond = await counts('after a second "Put it back"');
      check('a second "Put it back" adds nothing', afterSecond === 2, `${afterSecond}`);

      at = `${way}: the phone's Back after "Put it back"`;
      await page.goBack();
      await page.locator('main').waitFor();
      const backStruck = page.locator(`li[data-removed-game="${gameId}"]`);
      const backText = await page.locator('main').innerText();
      check(
        'the phone\'s Back shows no old "Removed … Put it back" from the server',
        // A page the browser kept may still show the struck game; tapping it is the case above.
        (await backStruck.count()) === 1 || !backText.includes(`Removed: ${name}`),
        backText.slice(0, 300),
      );
      await page.goto(`${origin}/north-valley/admin/schedule`);

      at = `${way}: a game only ever in the draft is added and removed`;
      const round = page.locator('section[data-round]', { has: editable }).first();
      const roundId = await round.getAttribute('data-round');
      const add = round.locator('details[data-add-game]');
      await add.locator('summary').click();
      await add.locator('select[name=homeTeamId]').selectOption({ index: 1 });
      await add.locator('select[name=awayTeamId]').selectOption({ index: 2 });
      await add.locator('input[name=time]').fill('22:30');
      await tap(add.getByRole('button', { name: 'Add game' }), page.locator('#saved'));
      const added = page.locator(`section[data-round="${roundId}"] li[data-game]`, {
        has: page.locator('#saved'),
      });
      const addedId = await added.getAttribute('data-game');
      const addedName = await nameOf(added);
      await counts('after a game is added');
      await added.locator('summary', { hasText: 'Edit this game' }).click();
      await tap(
        added.getByRole('button', { name: 'Remove game' }),
        page.locator(`section[data-round="${roundId}"] #saved`, { hasText: 'Removed:' }),
      );
      const draftOnly = page.locator(`section[data-round="${roundId}"] #saved`);
      check(
        'a game only in the draft is said removed in its round, with "Put it back"',
        (await draftOnly.innerText()).includes('It was only in the draft') &&
          (await draftOnly.getByRole('button', { name: 'Put it back' }).count()) === 1 &&
          (await page.locator(`li[data-removed-game="${addedId}"]`).count()) === 0,
        await draftOnly.innerText(),
      );
      await counts('after the game only in the draft is removed');

      at = `${way}: the two moves are undone`;
      for (const [i, { id, was }] of moved.entries()) {
        const game = page.locator(`li[data-game="${id}"]`);
        await game.locator('summary', { hasText: 'Edit this game' }).click();
        await game.locator('input[name=time]').fill(was);
        await tap(game.getByRole('button', { name: 'Save game' }), savedIn(game, 'Saved'));
        if (i === 0) {
          check(
            'after the next edit the game only in the draft is gone, as its answer said',
            !(await page.locator('main').innerText()).includes(`Removed: ${addedName}`) &&
              (await page.locator(`[data-put-back="${addedId}"]`).count()) === 0,
          );
        }
      }
      const none = await counts('with every change undone');
      check('a draft that changes nothing counts nothing', none === 0, `${none}`);
      // Opened again, as the person comes back to it: the line is at the top.
      await page.goto(`${origin}/north-valley/admin/schedule`);
      const sameLine = page.locator('[data-draft-count]');
      const discard = sameLine.getByRole('button', { name: 'Discard the draft' });
      check(
        'it reads "The draft is the same as the published schedule." with "Discard the draft" beside it',
        (await sameLine.innerText()).includes('The draft is the same as the published schedule.') &&
          (await discard.count()) === 1 &&
          (await onScreen(discard)),
        await sameLine.innerText(),
      );
      const boxDiscard = publishBox.getByRole('button', { name: 'Discard the draft' });
      check(
        'the publish box says the same in one calm sentence, its "Discard the draft" the same one tap',
        (await publishBox.innerText()).includes('so there is nothing to publish.') &&
          !(await publishBox.innerText()).includes('Publishing will add 0') &&
          (await publishBox.locator('[data-kind="error"]').count()) === 0 &&
          (await publishBox.getByRole('button', { name: 'Publish this schedule' }).count()) === 0 &&
          (await boxDiscard.count()) === 1 &&
          (await publishBox.locator('details.admin-discard').count()) === 0,
      );
      check(
        'nothing offers "Review and publish" when nothing would be published',
        (await page.getByRole('link', { name: 'Review and publish' }).count()) === 0,
      );
      await accessible('a draft the same as the published schedule');

      at = `${way}: the draft that changes nothing is discarded beside the line`;
      await tap(discard, page.locator('[role=status]', { hasText: 'The draft was discarded.' }));
      check(
        'the draft is gone',
        (await page.locator('[data-draft-count]').count()) === 0 &&
          (await page.locator('main').innerText()).includes('There is no draft yet.'),
      );

      // Once, with scripts off: it scores a game of the made-up world for good.
      if (!scripts) {
        at = `${way}: a game removed in the draft is played meanwhile`;
        const target = editable.first();
        const playedId = await target.getAttribute('data-game');
        const played = await nameOf(target);
        const [away, home] = played.split(' at ');
        await target.locator('summary', { hasText: 'Edit this game' }).click();
        const playedRow = page.locator(`li[data-removed-game="${playedId}"]`);
        await tap(target.getByRole('button', { name: 'Remove game' }), playedRow);
        // On the games list, the game is played and its final score saved.
        await page.goto(`${origin}/north-valley/admin/games`);
        const onList = page.locator(`li[id="game-${playedId}"]`);
        await onList.getByText('Enter the final score').click();
        await onList.getByLabel(`Score for ${away}`).fill('40');
        await onList.getByLabel(`Score for ${home}`).fill('44');
        await onList.getByRole('button', { name: 'Save final score' }).click();
        await onList.locator('[data-question]').waitFor();
        await Promise.all([
          page.waitForEvent('load'),
          onList.getByRole('button', { name: 'Yes, make it final' }).click(),
        ]);
        await page.goto(`${origin}/north-valley/admin/schedule`);
        const playedText = await playedRow.innerText();
        check(
          'the struck game says it has been played since, and still offers "Put it back"',
          playedText.includes(
            'Removed in this draft, but it has been played since. Put it back in the draft to publish.',
          ) && (await playedRow.getByRole('button', { name: 'Put it back' }).count()) === 1,
          playedText,
        );
        const line = page.locator('[data-draft-count]');
        check(
          'the top line says it cannot be published, with a way to why, and no "Review and publish"',
          (await line.innerText()).includes('It cannot be published yet.') &&
            (await line.getByRole('link', { name: 'See why' }).count()) === 1 &&
            (await page.getByRole('link', { name: 'Review and publish' }).count()) === 0,
          await line.innerText(),
        );
        const goTo = publishBox.getByRole('link', { name: `Go to ${played}` });
        check(
          'the publish box names the game it is blocked by, with a way to its row',
          (await goTo.count()) === 1 && (await goTo.getAttribute('href')) === `#game-${playedId}`,
          await publishBox.innerText(),
        );
        await accessible('a removed game played since');
        if (pictures) {
          // The row and the publish box as the person meets them, at 390 (step 2.185, B1).
          fs.mkdirSync(path.join(shotsDir, '390'), { recursive: true });
          await playedRow.screenshot({
            path: path.join(shotsDir, '390', 'draft-put-back-played-row.png'),
          });
          await publishBox.screenshot({
            path: path.join(shotsDir, '390', 'draft-put-back-played-box.png'),
          });
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(shotsDir, '390', 'draft-put-back-played-top.png'),
          });
        }
        await tap(
          playedRow.getByRole('button', { name: 'Put it back' }),
          page.locator(`li[data-game="${playedId}"]`),
        );
        const backAgain = page.locator(`li[data-game="${playedId}"]`);
        check(
          'put back, it is the played game it is now: no change to publish, nothing lost',
          (await backAgain.innerText()).includes('started or been decided') &&
            (await counts('after putting back a game played since')) === 0,
          await backAgain.innerText(),
        );
        await tap(
          page.locator('[data-draft-count]').getByRole('button', { name: 'Discard the draft' }),
          page.locator('[role=status]', { hasText: 'The draft was discarded.' }),
        );

        // A game removed in the draft and then postponed, and one then cancelled, in Games
        // (step 2.158): each struck row says so truly, and its button says "in the draft",
        // so it is never read as Games' own way to put a called-off game back.
        for (const [button, yes, words] of [
          [
            'Postpone',
            'Yes, postpone it',
            'Removed in this draft, and postponed since: publishing still removes it. Putting it back in the draft keeps it in the schedule, still waiting in Games for a new date.',
          ],
          [
            'Cancel the game',
            'Yes, cancel it',
            'Removed in this draft, and cancelled since: publishing still removes it. Putting it back in the draft keeps it in the schedule, still cancelled; the game itself is put back from its page in Games.',
          ],
        ]) {
          at = `${way}: a game removed in the draft is called off in Games (${button})`;
          const next = editable.first();
          const calledId = await next.getAttribute('data-game');
          const called = await nameOf(next);
          await next.locator('summary', { hasText: 'Edit this game' }).click();
          const calledRow = page.locator(`li[data-removed-game="${calledId}"]`);
          await tap(next.getByRole('button', { name: 'Remove game' }), calledRow);
          await page.goto(`${origin}/north-valley/admin/games`);
          const listed = page.locator(`li[id="game-${calledId}"]`);
          const panel = listed.locator('details[data-call-off]').last();
          if ((await panel.getAttribute('open')) === null) {
            await panel.locator('> summary').click();
          }
          await listed.getByRole('button', { name: button, exact: true }).click();
          await listed.locator('[data-call-off-ask]').waitFor();
          // The server takes a "Yes" sooner than a person reads the question as a double tap.
          await page.waitForTimeout(1000);
          await Promise.all([
            page.waitForEvent('load'),
            listed.getByRole('button', { name: yes }).click(),
          ]);
          await page.goto(`${origin}/north-valley/admin/schedule`);
          const calledText = await calledRow.innerText();
          const inDraft = calledRow.getByRole('button', {
            name: `Put it back in the draft: ${called}`,
          });
          check(
            `a removed game ${button === 'Postpone' ? 'postponed' : 'cancelled'} since says so truly, its button "Put it back in the draft"`,
            calledText.includes(words) &&
              (await inDraft.count()) === 1 &&
              (await inDraft.innerText()).trim() === 'Put it back in the draft',
            calledText,
          );
          await tap(inDraft, page.locator(`li[data-game="${calledId}"]`));
          check(
            `put back in the draft, it is the ${button === 'Postpone' ? 'postponed' : 'cancelled'} game it is, with Games' own way on`,
            (await page.locator(`li[data-game="${calledId}"] [data-called-off]`).count()) === 1 &&
              (await counts(`after putting back a game called off since (${button})`)) === 0,
          );
          await tap(
            page.locator('[data-draft-count]').getByRole('button', { name: 'Discard the draft' }),
            page.locator('[role=status]', { hasText: 'The draft was discarded.' }),
          );
        }
      }
      await context.close();
    }
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

// A game whose team is in the bin (the Otters, LOCAL_BINNED_TEAM, as team-bin-test makes
// them): removed, it stays struck through, but with no "Put it back", which could only
// give a draft that cannot be published; the row says why, in the Teams area's words.
if (built) {
  const origin = `http://localhost:${await freePort()}`;
  const port = new URL(origin).port;
  const server = startNext(dev ? ['dev', '--port', port] : ['start', '--port', port], {
    APP_ENV: 'test',
    PUBLIC_BASE_URL: origin,
    LOCAL_BINNED_TEAM: 'otters',
  });
  let browser;
  let at = 'starting with the Otters in the bin';
  try {
    await waitFor(`${origin}/`, server);
    browser = await launch();
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: screen });
    await context.addCookies([{ name: 'srl_session', value: 'local-owner-token', url: origin }]);
    const page = await context.newPage();
    page.setDefaultTimeout(dev ? 120_000 : 60_000);
    at = 'a game of the Otters, in the bin, is removed';
    await page.goto(`${origin}/north-valley/admin/schedule`);
    // Its own line names the Otters (the forms' lists of other games name them too).
    const theirs = page
      .locator('li[data-game]', { has: page.locator('summary', { hasText: 'Edit this game' }) })
      .filter({ has: page.locator('p.admin-slot-line strong', { hasText: 'Otters (removed)' }) });
    const gameId = await theirs.first().getAttribute('data-game');
    if (gameId === null) throw new Error('no game of the Otters to remove');
    await theirs.first().locator('summary', { hasText: 'Edit this game' }).click();
    const struck = page.locator(`li[data-removed-game="${gameId}"]`);
    await Promise.all([
      page.waitForEvent('load'),
      theirs.first().getByRole('button', { name: 'Remove game' }).click(),
    ]);
    await struck.waitFor({ state: 'attached' });
    const binnedWords =
      'one of its teams is in the bin, so this game stays removed. The team is kept for 30 days.';
    note(
      'a removed game of a team in the bin says why it stays removed, with no "Put it back"',
      (await struck.innerText()).includes(binnedWords) &&
        (await struck.getByRole('button', { name: /Put it back/ }).count()) === 0,
      await struck.innerText(),
    );
    await page.goto(`${origin}/north-valley/admin/schedule`);
    note(
      'drawn again, the struck row still says why and offers no "Put it back"',
      (await struck.innerText()).includes(binnedWords) &&
        (await struck.getByRole('button', { name: /Put it back/ }).count()) === 0,
      await struck.innerText(),
    );
    await context.close();
  } catch (error) {
    failures.push(`${at}: ${whatWentWrong(error)}`);
  } finally {
    await browser?.close();
    server.child.kill();
  }
}

if (failures.length > 0) {
  console.error(`Draft put-back browser test failed:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Draft put-back browser test passed: ${checked.length} checks in a real browser.`);
