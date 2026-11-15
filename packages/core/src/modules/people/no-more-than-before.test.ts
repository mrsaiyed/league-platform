// Step 2.162 (R-29, record 065): the names setting is now followed for every player.
// This test keeps the rule above all of that change: no person is shown MORE than they
// were before it. The behaviour before step 2.162 is written out here, in the test, from
// the code it replaced (show-name.ts and read-name-policy.ts of step 2.126), so a later
// change cannot quietly show more: for every combination of who plays in the league,
// what the league has stored, the person's age and their own request, the name shown now
// (read from the stored settings by readNamePolicy and shown by showName, as every public
// page, live message and statistic does) is compared with the name shown before. The only
// differences allowed are "less", and only of an adult: where the admin chose first name
// and last initial or hidden, or where a youth or mixed league that has chosen nothing
// starts on first name and last initial (R-29). A child is shown exactly as before.
//
// R-28 (a birth date decides who is a child) is not built yet (step 2.146): the age here
// is the record's "minor" tick, true, false or not known. When R-28 is built, a birth
// date on either side of 18 joins the ages below.
import { describe, expect, it } from 'vitest';
import { audiences, type Audience, type StoredSettingRow } from '../leagues/index.ts';
import { nameRequests, type NameRequest } from './rules/name-policy.ts';
import { showName, type ShownName } from './rules/show-name.ts';
import { publicViewer } from './rules/viewer.ts';
import { readNamePolicy } from './queries/read-name-policy.ts';

/** What a league may have stored for "Names on public pages": nothing, or one of its values. */
const storedValues = [undefined, 'fullName', 'firstNameLastInitial', 'hidden'] as const;
type Stored = (typeof storedValues)[number];
const ages: readonly (boolean | null)[] = [true, false, null];

/** How much a result shows, from the most to the least. */
function rank(shown: ShownName): number {
  if (!shown.shown) return 3;
  if (shown.text === 'Amina Yusuf') return 0;
  if (shown.text === 'Amina Y.') return 1;
  if (shown.text === 'A. Y.') return 2;
  throw new Error(`unexpected name ${shown.text}`);
}

const child = (isMinor: boolean | null, audience: Audience) =>
  isMinor === true || (isMinor === null && audience !== 'adult');

/**
 * BEFORE step 2.162, pinned. The setting acted on children only (and on people of
 * unknown age outside an adult league), with first name and last initial as the start
 * in every league; adults were shown in full, or as the initials they asked for. A stored
 * "full names" could only have been saved confirmed. Do not change this function: it is
 * the yardstick.
 */
function before(
  audience: Audience,
  stored: Stored,
  isMinor: boolean | null,
  request: NameRequest,
): ShownName {
  if (request === 'removed') return { shown: false, why: 'removed' };
  if (!child(isMinor, audience)) {
    return { shown: true, text: request === 'initials' ? 'A. Y.' : 'Amina Yusuf' };
  }
  if (stored === 'hidden') return { shown: false, why: 'hidden' };
  if (request === 'initials') return { shown: true, text: 'A. Y.' };
  return { shown: true, text: stored === 'fullName' ? 'Amina Yusuf' : 'Amina Y.' };
}

/** NOW: the stored settings read as every public surface reads them, then the one function. */
async function now(
  audience: Audience,
  stored: Stored,
  mayAsk: boolean | undefined,
  isMinor: boolean | null,
  request: NameRequest,
): Promise<ShownName> {
  const values: Record<string, unknown> = {
    'privacy.publicNames': stored,
    'privacy.playersMayAskForInitials': mayAsk,
  };
  const policy = await readNamePolicy(
    {
      settingRows: async (key): Promise<readonly StoredSettingRow[]> =>
        values[key] === undefined
          ? []
          : [{ level: 'league', document: { version: 1, value: values[key] }, version: 1 }],
    },
    audience,
  );
  return showName(
    { firstName: 'Amina', lastName: 'Yusuf', isMinor, nameRequest: request },
    { audience, policy, viewer: publicViewer('league-1'), statsOf: null },
  );
}

/** The differences step 2.162 is allowed to make: an adult shown less, for a reason. */
function allowedLess(audience: Audience, stored: Stored, isMinor: boolean | null): boolean {
  if (child(isMinor, audience)) return false;
  // The admin chose less, and it is now followed for everyone (R-29).
  if (stored === 'firstNameLastInitial' || stored === 'hidden') return true;
  // A youth or mixed league that chose nothing starts on first name and last initial,
  // for everyone (R-29, record 065).
  return stored === undefined && audience !== 'adult';
}

describe('no one is shown more than before step 2.162 (R-29, record 065)', () => {
  it('compares every combination with the behaviour before, and allows only less', async () => {
    const more: string[] = [];
    const unexplained: string[] = [];
    let count = 0;
    let less = 0;
    for (const audience of audiences)
      for (const stored of storedValues)
        for (const mayAsk of [undefined, false, true])
          for (const isMinor of ages)
            for (const request of nameRequests) {
              count += 1;
              const was = before(audience, stored, isMinor, request);
              const is = await now(audience, stored, mayAsk, isMinor, request);
              const label =
                `${audience} stored=${String(stored)} ask=${String(mayAsk)} ` +
                `minor=${String(isMinor)} ${request}: was ${JSON.stringify(was)}, ` +
                `is ${JSON.stringify(is)}`;
              if (rank(is) < rank(was)) more.push(label);
              if (JSON.stringify(is) !== JSON.stringify(was)) {
                less += 1;
                if (!allowedLess(audience, stored, isMinor)) unexplained.push(label);
              }
            }
    expect(more).toEqual([]);
    expect(unexplained).toEqual([]);
    expect(count).toBe(3 * 4 * 3 * 3 * 3);
    // The change does something: adults are now shown less where the setting says so.
    expect(less).toBeGreaterThan(0);
  });

  it('changes nothing in an adult league that has chosen nothing, nor for any child', async () => {
    for (const audience of audiences)
      for (const stored of storedValues)
        for (const isMinor of ages)
          for (const request of nameRequests) {
            const everyone = audience === 'adult' && stored === undefined;
            if (!everyone && !child(isMinor, audience)) continue;
            expect(
              await now(audience, stored, undefined, isMinor, request),
              `${audience} ${String(stored)} ${String(isMinor)} ${request}`,
            ).toEqual(before(audience, stored, isMinor, request));
          }
  });

  it('follows less for adults exactly where it is allowed to', async () => {
    // An adult in an adult league whose admin chose hidden, then first name and last initial.
    expect(await now('adult', 'hidden', undefined, false, 'none')).toEqual({
      shown: false,
      why: 'hidden',
    });
    expect(await now('adult', 'firstNameLastInitial', undefined, null, 'none')).toEqual({
      shown: true,
      text: 'Amina Y.',
    });
    // Recorded initials never show more than the league's "hidden" (R-25, R-29).
    expect(await now('adult', 'hidden', true, false, 'initials')).toEqual({
      shown: false,
      why: 'hidden',
    });
  });
});

describe('a league that changes who plays in it (record 065)', () => {
  const ofAll = async (audience: Audience, stored: Stored) =>
    Promise.all(ages.map((isMinor) => now(audience, stored, undefined, isMinor, 'none')));
  const texts = (shown: readonly ShownName[]) => shown.map((s) => (s.shown ? s.text : null));

  it('starts again from its new audience when it has chosen nothing', async () => {
    // Ages: a child, an adult, not known.
    expect(texts(await ofAll('adult', undefined))).toEqual([
      'Amina Y.',
      'Amina Yusuf',
      'Amina Yusuf',
    ]);
    // The adult league becomes mixed or youth: no child, and no one of unknown age, in full.
    for (const audience of ['mixed', 'youth'] as const) {
      expect(texts(await ofAll(audience, undefined)), audience).toEqual([
        'Amina Y.',
        'Amina Y.',
        'Amina Y.',
      ]);
    }
  });

  it('keeps a confirmed choice of full names, and never shows a child in full without one', async () => {
    // A stored "full names" was saved confirmed (leagues.set_setting), so it holds.
    for (const audience of audiences) {
      expect(texts(await ofAll(audience, 'fullName')), audience).toEqual([
        'Amina Yusuf',
        'Amina Yusuf',
        'Amina Yusuf',
      ]);
    }
    // An adult league's own start (full names, nothing stored) was never confirmed: a
    // child in it is never shown in full, before or after it changes who plays.
    for (const audience of audiences) {
      const [aChild] = await ofAll(audience, undefined);
      expect(aChild, audience).toEqual({ shown: true, text: 'Amina Y.' });
    }
  });
});
