// What the Privacy part of League settings says around its settings (step 2.162, R-29,
// record 065): one opening sentence that fits who plays in the league, a line saying what
// is in force now (and since when the parents' confirmation is), and where the
// confirmation is offered. Everything shown comes from the message files (T-187); this
// file only chooses which words, from facts read by the page.
import {
  childrenInFullConfirmed,
  type LeagueSettingRow,
  type NamePolicy,
  type PrivacyFacts,
} from '@srleagues/core';
import type { TextKey } from '../../server/messages.ts';

/** One sentence: a message key and what fills it. */
export type Line = {
  readonly key: TextKey;
  readonly params?: Readonly<Record<string, string | number>>;
  /** A link after the sentence: its address and its words. */
  readonly link?: { readonly href: string; readonly key: TextKey };
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

export const confirmationKey = childrenInFullConfirmed.key;

export type PrivacyInput = {
  readonly facts: PrivacyFacts;
  /** The policy the public pages follow now (readNamePolicy). */
  readonly policy: NamePolicy;
  /** The league's settings rows, for the confirmation's value and when it was saved. */
  readonly rows: readonly LeagueSettingRow[];
  /** The league's time zone, so the date of the confirmation is the league's date. */
  readonly timeZone: string;
  readonly locale: string;
  /** Who gave the parents' confirmation, from the activity log, where it is known. */
  readonly confirmedBy?: string | undefined;
  /** Admin → People's list of walk-ups with no age (`?added=table`, S-136). */
  readonly walkUpsUrl: string;
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
  // Right under "Now", so an owner who sees a coach by initial learns why (R-15).
  if (facts.audience !== 'adult') area.push({ key: 'adminSettings.privacy.unknownAge' });
  // S-136 as amended in step 2.146's fix and closing rounds: walk-ups with no age are shown
  // as children whatever the confirmation says, and keep the site out of search, until an
  // admin marks them, in every league; the list of them is one tap away.
  if (facts.hasWalkUpOfUnknownAge) {
    area.push({
      key: 'adminSettings.privacy.walkUps',
      link: { href: input.walkUpsUrl, key: 'adminSettings.privacy.walkUps.link' },
    });
  }
  // Someone the confirmation would cover: a recorded child. Never a walk-up with no age
  // (S-136, step 2.146's closing round): the line above speaks for them.
  const hasChild = facts.hasRecordedChild;
  // Where adults show in full and children do not (step 2.146): in an adult league with
  // children, that the difference itself tells who is a child, and that "first name and
  // last initial" for everyone avoids it; wherever children are about, that the day a name
  // turns full tells an 18th birthday.
  const splitByAge =
    policy.names === 'full_name' &&
    policy.childrenInFull !== true &&
    (facts.audience !== 'adult' || hasChild);
  if (splitByAge && facts.audience === 'adult') {
    area.push({ key: 'adminSettings.privacy.adultWithChildren' });
  }
  if (splitByAge) area.push({ key: 'adminSettings.privacy.birthdayTells' });
  // True since "Show as" is on the person's record (step 2.146, R-23).
  area.push({ key: 'adminSettings.privacy.onePerson' });
  if (given && policy.names !== 'full_name') {
    area.push({ key: 'adminSettings.privacy.keptNoEffect' });
  }
  if (given && row?.savedAt !== null && row?.savedAt !== undefined) {
    const date = new Intl.DateTimeFormat(input.locale, {
      dateStyle: 'long',
      timeZone: input.timeZone,
    }).format(new Date(row.savedAt));
    area.push(
      input.confirmedBy === undefined
        ? { key: 'adminSettings.privacy.confirmedOn', params: { date } }
        : { key: 'adminSettings.privacy.confirmedOnBy', params: { date, name: input.confirmedBy } },
    );
  }
  // An adult league with nobody it would cover has nothing to confirm, and the
  // confirmation means something only under full names (step 2.146): elsewhere it is not
  // offered, unless one is already stored: then it stays on screen so it can be taken back.
  const adultWithoutChildren = facts.audience === 'adult' && !hasChild;
  const offered = (!adultWithoutChildren && policy.names === 'full_name') || given;
  const before: Line[] =
    facts.audience !== 'adult'
      ? [{ key: 'adminSettings.privacy.confirm.youthOrMixed' }]
      : adultWithoutChildren
        ? [{ key: 'adminSettings.privacy.confirm.adultNoChildren' }]
        : [{ key: 'adminSettings.privacy.confirm.adultWithChildren' }];
  return {
    area: { privacy: area },
    rows: { [confirmationKey]: { before, offered } },
  };
}
