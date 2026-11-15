// What the Privacy part of League settings says around its settings (step 2.162, R-29,
// record 065): one opening sentence that fits who plays in the league, a line saying what
// is in force now (and since when the parents' confirmation is), and where the
// confirmation is offered. Everything shown comes from the message files (T-187); this
// file only chooses which words, from facts read by the page.
import type { LeagueSettingRow, NamePolicy, PrivacyFacts } from '@srleagues/core';
import type { TextKey } from '../../server/messages.ts';

/** One sentence: a message key and what fills it. */
export type Line = {
  readonly key: TextKey;
  readonly params?: Readonly<Record<string, string | number>>;
};

/** What the settings form draws around the settings it draws from their declarations. */
export type SettingNotes = {
  /** Sentences under an area's heading, by area. */
  readonly area?: Readonly<Record<string, readonly Line[]>>;
  /** Per setting: sentences before its form, and whether its form is offered at all. */
  readonly rows?: Readonly<
    Record<string, { readonly before?: readonly Line[]; readonly offered?: boolean }>
  >;
};

export const confirmationKey = 'privacy.childrenInFullConfirmed';

export type PrivacyInput = {
  readonly facts: PrivacyFacts;
  /** The policy the public pages follow now (readNamePolicy). */
  readonly policy: NamePolicy;
  /** The league's settings rows, for the confirmation's value and when it was saved. */
  readonly rows: readonly LeagueSettingRow[];
  /** The league's time zone, so the date of the confirmation is the league's date. */
  readonly timeZone: string;
  readonly locale: string;
};

function nowLine(policy: NamePolicy): Line {
  if (policy.names === 'hidden') return { key: 'adminSettings.privacy.now.hidden' };
  if (policy.names === 'first_name_last_initial')
    return { key: 'adminSettings.privacy.now.initial' };
  return {
    key: policy.childrenInFull
      ? 'adminSettings.privacy.now.fullConfirmed'
      : 'adminSettings.privacy.now.full',
  };
}

export function privacyNotes(input: PrivacyInput): SettingNotes {
  const { facts, policy } = input;
  const row = input.rows.find((r) => r.key === confirmationKey);
  const given = row?.value === true;
  const area: Line[] = [{ key: `adminSettings.privacy.intro.${facts.audience}` }, nowLine(policy)];
  if (given && policy.names !== 'full_name') {
    area.push({ key: 'adminSettings.privacy.keptNoEffect' });
  }
  if (given && row?.savedAt !== null && row?.savedAt !== undefined) {
    const date = new Intl.DateTimeFormat(input.locale, {
      dateStyle: 'long',
      timeZone: input.timeZone,
    }).format(new Date(row.savedAt));
    area.push({ key: 'adminSettings.privacy.confirmedOn', params: { date } });
  }
  // An adult league with nobody recorded as a child has nothing to confirm, unless a
  // confirmation is already stored: then it stays on screen so it can be taken back.
  const adultWithoutChildren = facts.audience === 'adult' && !facts.hasRecordedChild;
  const before: Line[] =
    facts.audience !== 'adult'
      ? [{ key: 'adminSettings.privacy.confirm.youthOrMixed' }]
      : adultWithoutChildren
        ? [{ key: 'adminSettings.privacy.confirm.adultNoChildren' }]
        : [{ key: 'adminSettings.privacy.confirm.adultWithChildren' }];
  return {
    area: { privacy: area },
    rows: { [confirmationKey]: { before, offered: !adultWithoutChildren || given } },
  };
}
