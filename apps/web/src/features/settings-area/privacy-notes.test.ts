// The words the Privacy part of League settings adds around its settings (step 2.162,
// R-29, record 065), chosen from who plays, what is in force and the confirmation.
import {
  defaultNamePolicy,
  type Audience,
  type LeagueSettingRow,
  type NamePolicy,
} from '@srleagues/core';
import { en } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { confirmationKey, privacyNotes, type SettingNotes } from './privacy-notes.ts';

const confirmationRow = (value: boolean, savedAt: string | null = null): LeagueSettingRow => ({
  key: confirmationKey,
  label: `setting.${confirmationKey}.label`,
  default: false,
  field: { kind: 'toggle' },
  confirm: [true],
  value,
  source: value ? 'league' : 'default',
  version: value ? 1 : null,
  savedAt,
});

const walkUpsUrl = '/league/admin/people?added=table';

function notes(
  audience: Audience,
  options: {
    readonly hasRecordedChild?: boolean;
    readonly hasWalkUpOfUnknownAge?: boolean;
    readonly policy?: Partial<NamePolicy>;
    readonly given?: boolean;
    readonly savedAt?: string;
  } = {},
): SettingNotes {
  return privacyNotes({
    facts: {
      audience,
      hasRecordedChild: options.hasRecordedChild ?? false,
      hasWalkUpOfUnknownAge: options.hasWalkUpOfUnknownAge ?? false,
    },
    policy: { ...defaultNamePolicy, ...options.policy },
    rows: [confirmationRow(options.given ?? false, options.savedAt ?? null)],
    timeZone: 'America/Chicago',
    locale: 'en',
    walkUpsUrl: walkUpsUrl,
  });
}
const keys = (n: SettingNotes) => (n.area?.['privacy'] ?? []).map((line) => line.key);

describe('privacyNotes', () => {
  it('opens with a sentence for who plays and says what is in force now', () => {
    expect(keys(notes('adult'))).toEqual([
      'adminSettings.privacy.intro.adult',
      'adminSettings.privacy.now.full',
      'adminSettings.privacy.onePerson',
    ]);
    // In a youth or mixed league, why someone with no age recorded shows by initial comes
    // right under "Now".
    for (const audience of ['youth', 'mixed'] as const) {
      expect(keys(notes(audience))).toEqual([
        `adminSettings.privacy.intro.${audience}`,
        'adminSettings.privacy.now.full',
        'adminSettings.privacy.unknownAge',
        'adminSettings.privacy.birthdayTells',
        'adminSettings.privacy.onePerson',
      ]);
    }
    const now = (policy: Partial<NamePolicy>) => keys(notes('youth', { policy }))[1];
    expect(now({ names: 'first_name_last_initial' })).toBe('adminSettings.privacy.now.initial');
    expect(now({ names: 'hidden' })).toBe('adminSettings.privacy.now.hidden');
    expect(now({ childrenInFull: true })).toBe('adminSettings.privacy.now.fullConfirmed');
  });

  it("says since when the parents' confirmation is in force, in the league's own date", () => {
    // 03:00 on 16 November in UTC is still 15 November in Chicago.
    const given = notes('youth', {
      given: true,
      policy: { childrenInFull: true },
      savedAt: '2026-11-16T03:00:00.000Z',
    });
    expect(given.area?.['privacy']?.at(-1)).toEqual({
      key: 'adminSettings.privacy.confirmedOn',
      params: { date: 'November 15, 2026' },
    });
  });

  it('says who gave the confirmation where the activity log tells it (2.146)', () => {
    const given = privacyNotes({
      facts: { audience: 'youth', hasRecordedChild: false, hasWalkUpOfUnknownAge: false },
      policy: { ...defaultNamePolicy, childrenInFull: true },
      rows: [confirmationRow(true, '2026-11-16T03:00:00.000Z')],
      timeZone: 'America/Chicago',
      locale: 'en',
      confirmedBy: 'Riley Owner',
      walkUpsUrl,
    });
    expect(given.area?.['privacy']?.at(-1)).toEqual({
      key: 'adminSettings.privacy.confirmedOnBy',
      params: { date: 'November 15, 2026', name: 'Riley Owner' },
    });
  });

  it('says a kept confirmation has no effect while names are not on full names', () => {
    const kept = notes('youth', {
      given: true,
      policy: { names: 'hidden', childrenInFull: true },
      savedAt: '2026-11-15T12:00:00.000Z',
    });
    expect(keys(kept)).toEqual([
      'adminSettings.privacy.intro.youth',
      'adminSettings.privacy.now.hidden',
      'adminSettings.privacy.unknownAge',
      'adminSettings.privacy.onePerson',
      'adminSettings.privacy.keptNoEffect',
      'adminSettings.privacy.confirmedOn',
    ]);
  });

  it('says where the names tell who is a child, and that the record shows less of one person (2.146)', () => {
    // An adult league with children, adults in full: the names tell who is a child.
    expect(keys(notes('adult', { hasRecordedChild: true }))).toEqual([
      'adminSettings.privacy.intro.adult',
      'adminSettings.privacy.now.full',
      'adminSettings.privacy.adultWithChildren',
      'adminSettings.privacy.birthdayTells',
      'adminSettings.privacy.onePerson',
    ]);
    // Everyone alike, by initial or in full with the confirmation: nothing to tell.
    for (const policy of [
      { names: 'first_name_last_initial' as const },
      { childrenInFull: true },
    ]) {
      const said = keys(notes('adult', { hasRecordedChild: true, policy }));
      expect(said).not.toContain('adminSettings.privacy.adultWithChildren');
      expect(said).not.toContain('adminSettings.privacy.birthdayTells');
      expect(said).toContain('adminSettings.privacy.onePerson');
    }
    expect(en['adminSettings.privacy.onePerson']).toContain('Show as');
  });

  it('offers the confirmation in youth and mixed leagues, and in an adult league only with a recorded child', () => {
    const row = (n: SettingNotes) => n.rows?.[confirmationKey];
    for (const audience of ['youth', 'mixed'] as const) {
      expect(row(notes(audience))).toEqual({
        before: [{ key: 'adminSettings.privacy.confirm.youthOrMixed' }],
        offered: true,
      });
    }
    expect(row(notes('adult', { hasRecordedChild: true }))).toEqual({
      before: [{ key: 'adminSettings.privacy.confirm.adultWithChildren' }],
      offered: true,
    });
    expect(row(notes('adult'))).toEqual({
      before: [{ key: 'adminSettings.privacy.confirm.adultNoChildren' }],
      offered: false,
    });
    // A confirmation already stored stays on screen, so it can be taken back.
    expect(row(notes('adult', { given: true }))?.offered).toBe(true);
  });

  // S-136 as amended in step 2.146's fix round (Medium 1 of the review): an adult league
  // whose only children are walk-ups with no age is offered the confirmation, told why, and
  // given the list of them; a league with none hears nothing of it.
  it('offers the confirmation where the only children are walk-ups, and links to them', () => {
    const row = (n: SettingNotes) => n.rows?.[confirmationKey];
    const walkUps = notes('adult', { hasWalkUpOfUnknownAge: true });
    expect(row(walkUps)).toEqual({
      before: [{ key: 'adminSettings.privacy.confirm.adultWithWalkUps' }],
      offered: true,
    });
    expect(walkUps.area?.['privacy']).toContainEqual({
      key: 'adminSettings.privacy.walkUps',
      link: { href: walkUpsUrl, key: 'adminSettings.privacy.walkUps.link' },
    });
    expect(keys(walkUps)).toContain('adminSettings.privacy.adultWithChildren');
    expect(keys(notes('youth', { hasWalkUpOfUnknownAge: true }))).toContain(
      'adminSettings.privacy.walkUps',
    );
    for (const audience of ['adult', 'youth', 'mixed'] as const) {
      expect(keys(notes(audience))).not.toContain('adminSettings.privacy.walkUps');
    }
    // A recorded child too: the words for recorded children.
    expect(row(notes('adult', { hasRecordedChild: true, hasWalkUpOfUnknownAge: true }))).toEqual({
      before: [{ key: 'adminSettings.privacy.confirm.adultWithChildren' }],
      offered: true,
    });
  });

  it('offers the confirmation only while names are on full names, unless one is stored (2.146)', () => {
    const offered = (n: SettingNotes) => n.rows?.[confirmationKey]?.offered;
    for (const names of ['hidden', 'first_name_last_initial'] as const) {
      expect(offered(notes('youth', { policy: { names } }))).toBe(false);
      expect(offered(notes('adult', { hasRecordedChild: true, policy: { names } }))).toBe(false);
      expect(offered(notes('youth', { policy: { names }, given: true }))).toBe(true);
    }
    expect(offered(notes('youth', { policy: { names: 'full_name' } }))).toBe(true);
  });

  it('uses only words the message file has', () => {
    const all = (['adult', 'youth', 'mixed'] as const).flatMap((audience) =>
      [false, true].flatMap((hasRecordedChild) => {
        const n = notes(audience, {
          hasRecordedChild,
          hasWalkUpOfUnknownAge: !hasRecordedChild,
          given: true,
          policy: { names: 'hidden' },
          savedAt: '2026-11-15T12:00:00.000Z',
        });
        return [
          ...(n.area?.['privacy'] ?? []),
          ...(n.rows?.[confirmationKey]?.before ?? []),
        ].flatMap((line) => [line.key, ...(line.link === undefined ? [] : [line.link.key])]);
      }),
    );
    for (const key of all) expect(Object.hasOwn(en, key), key).toBe(true);
  });
});
