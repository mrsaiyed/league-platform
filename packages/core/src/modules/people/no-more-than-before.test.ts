// Step 2.162 (R-29, corrected; record 065): the names setting is now followed for every
// player, and the parents' confirmation is a setting of its own. This test keeps the
// rule above all of that change: no person is shown MORE than they were before it, and a
// league that saved nothing shows exactly what it showed before. The behaviour before
// step 2.162 is written out here, in the test, from the code it replaced (show-name.ts
// and read-name-policy.ts of step 2.126), so a later change cannot quietly show more.
//
// For every combination of who plays in the league, what the league stored, the
// initials switch, the person's age and their own request, the name shown now (read from
// the stored settings by readNamePolicy and shown by showName, as every public page, live
// message and statistic does) is compared with the name shown before. The only difference
// allowed is an adult shown less because the league STORED first name and last initial,
// or hidden. A "full names" stored before this step was saved with the confirmation, so
// it is compared with full names plus the confirmation now; how such a row reads without
// the new setting (less for children, record 065) is pinned on its own below.
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
 * "full names" could only have been saved with the confirmation. Do not change this
 * function: it is the yardstick.
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
  values: Readonly<Record<string, unknown>>,
  isMinor: boolean | null,
  request: NameRequest,
): Promise<ShownName> {
  const policy = await readNamePolicy({
    settingRows: async (key): Promise<readonly StoredSettingRow[]> =>
      values[key] === undefined
        ? []
        : [{ level: 'league', document: { version: 1, value: values[key] }, version: 1 }],
  });
  return showName(
    { firstName: 'Amina', lastName: 'Yusuf', isMinor, nameRequest: request },
    { audience, policy, viewer: publicViewer('league-1'), statsOf: null },
  );
}

const names = 'privacy.publicNames';
const confirmed = 'privacy.childrenInFullConfirmed';
const initials = 'privacy.playersMayAskForInitials';

/** What a league stored before, as it stands now: an old full names carried its confirmation. */
const asStoredBefore = (stored: Stored, mayAsk: boolean | undefined) => ({
  [names]: stored,
  [confirmed]: stored === 'fullName' ? true : undefined,
  [initials]: mayAsk,
});

/** The one difference step 2.162 may make: an adult shown less where the league stored less. */
function allowedLess(audience: Audience, stored: Stored, isMinor: boolean | null): boolean {
  return !child(isMinor, audience) && (stored === 'firstNameLastInitial' || stored === 'hidden');
}

describe('no one is shown more than before step 2.162 (R-29, record 065)', () => {
  it('compares every combination with the behaviour before, and allows one kind of less', async () => {
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
              const is = await now(audience, asStoredBefore(stored, mayAsk), isMinor, request);
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
    // The change does something: adults are shown less where the league stored less.
    expect(less).toBeGreaterThan(0);
  });

  it('changes nothing at all for a league that saved nothing, in every kind of league', async () => {
    for (const audience of audiences)
      for (const mayAsk of [undefined, false, true])
        for (const isMinor of ages)
          for (const request of nameRequests) {
            expect(
              await now(audience, { [initials]: mayAsk }, isMinor, request),
              `${audience} ask=${String(mayAsk)} minor=${String(isMinor)} ${request}`,
            ).toEqual(before(audience, undefined, isMinor, request));
          }
  });

  it('changes nothing for any child, whatever the league stored', async () => {
    for (const audience of audiences)
      for (const stored of storedValues)
        for (const isMinor of ages)
          for (const request of nameRequests) {
            if (!child(isMinor, audience)) continue;
            expect(
              await now(audience, asStoredBefore(stored, undefined), isMinor, request),
              `${audience} ${String(stored)} ${String(isMinor)} ${request}`,
            ).toEqual(before(audience, stored, isMinor, request));
          }
  });

  it('reads a full names stored before this step, with no confirmation saved, as less for children only (record 065)', async () => {
    for (const audience of audiences)
      for (const isMinor of ages)
        for (const request of nameRequests) {
          const was = before(audience, 'fullName', isMinor, request);
          const is = await now(audience, { [names]: 'fullName' }, isMinor, request);
          const label = `${audience} ${String(isMinor)} ${request}`;
          expect(rank(is), label).toBeGreaterThanOrEqual(rank(was));
          if (!child(isMinor, audience)) expect(is, label).toEqual(was);
        }
    expect(await now('youth', { [names]: 'fullName' }, true, 'none')).toEqual({
      shown: true,
      text: 'Amina Y.',
    });
  });
});

describe('the confirmation is a setting of its own (R-14, R-29, record 065)', () => {
  it('shows a child in full only where names are full names AND the confirmation is given', async () => {
    for (const audience of audiences)
      for (const stored of storedValues)
        for (const given of [undefined, false, true])
          for (const isMinor of ages) {
            if (!child(isMinor, audience)) continue;
            const shown = await now(
              audience,
              { [names]: stored, [confirmed]: given },
              isMinor,
              'none',
            );
            const inFull = (stored === undefined || stored === 'fullName') && given === true;
            expect(
              shown.shown && shown.text === 'Amina Yusuf',
              `${audience} ${String(stored)} ${String(given)} ${String(isMinor)}`,
            ).toBe(inFull);
          }
  });

  it('never changes how an adult is shown', async () => {
    for (const audience of audiences)
      for (const stored of storedValues)
        for (const isMinor of [false, null]) {
          if (child(isMinor, audience)) continue;
          expect(
            await now(audience, { [names]: stored, [confirmed]: true }, isMinor, 'none'),
          ).toEqual(await now(audience, { [names]: stored, [confirmed]: false }, isMinor, 'none'));
        }
  });

  it('follows less for adults where the league chose it', async () => {
    expect(await now('adult', { [names]: 'hidden' }, false, 'none')).toEqual({
      shown: false,
      why: 'hidden',
    });
    expect(await now('youth', { [names]: 'firstNameLastInitial' }, false, 'none')).toEqual({
      shown: true,
      text: 'Amina Y.',
    });
    // Recorded initials never show more than the league's "hidden" (R-25, R-29).
    expect(await now('adult', { [names]: 'hidden', [initials]: true }, false, 'initials')).toEqual({
      shown: false,
      why: 'hidden',
    });
  });
});
