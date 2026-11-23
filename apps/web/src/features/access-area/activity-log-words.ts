// The activity log's words (step 2.77): each entry's sentence, naming the thing it points
// at as that thing is named now, and the "Who" picker's choices. A person is named as the
// admin's People page names them (rosterName); a game by its two teams and its day in the
// league's time zone. When the thing can no longer be found (it was removed for good) or
// has no name left, the entry says its plain sentence: never an id, never a blank.
import { t, type TextKey } from '../../server/messages.ts';
import { rosterName, hasName } from '../teams-area/roster-name.ts';
import type { PersonLine } from './access-view.ts';
import type { LogLine, LogThingName } from './activity-log-view.ts';

/** The words a thing is named by now, or undefined when it has none to say. */
export function thingNameOf(
  thing: LogThingName,
  times: { readonly locale: string; readonly timeZone: string },
): string | undefined {
  if (thing.kind === 'person') return hasName(thing) ? rosterName(thing) : undefined;
  if (thing.kind === 'game') {
    if (thing.homeName.trim() === '' || thing.awayName.trim() === '') return undefined;
    if (thing.startsAt === null) {
      return t('adminAccess.log.gameNameNoDate', { home: thing.homeName, away: thing.awayName });
    }
    const date = new Intl.DateTimeFormat(times.locale, {
      timeZone: times.timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(thing.startsAt));
    return t('adminAccess.log.gameName', { home: thing.homeName, away: thing.awayName, date });
  }
  return thing.name.trim() === '' ? undefined : thing.name;
}

const isTextKey = (key: string): key is TextKey => {
  try {
    t(key as TextKey);
    return true;
  } catch {
    return false;
  }
};

/**
 * The entry's sentence: the one naming its thing when the thing is found, else the plain
 * one. `role` is already a role's name; a sentence whose values the entry lacks reads as a
 * plain change.
 */
export function logSentenceOf(
  line: LogLine,
  role: string,
  named: ReadonlyMap<string, LogThingName>,
  times: { readonly locale: string; readonly timeZone: string },
): string {
  const values = { ...line.values, role };
  const found = line.thing === undefined ? undefined : named.get(line.thing.id);
  const name =
    found === undefined || found.kind !== thingKindOf(line, found)
      ? undefined
      : thingNameOf(found, times);
  const namedKey = line.summary.replace(/^activity\./, 'activityNamed.');
  try {
    if (name !== undefined && namedKey !== line.summary && isTextKey(namedKey)) {
      return t(namedKey, { ...values, name });
    }
    return t(line.summary as TextKey, values);
  } catch {
    return t('activity.leagues.set_setting');
  }
}

/** The kind the line asked for: a thing of another kind with the same id is not it. */
const thingKindOf = (line: LogLine, found: LogThingName) =>
  line.thing?.kind === found.kind ? found.kind : undefined;

/**
 * The "Who" picker's choices: each person's name (or "No name yet") and the roles they
 * hold, as the Admins page lists them; two that would still read the same are numbered
 * in the order the Admins page shows them, so no two choices read the same.
 */
export function whoChoicesOf(
  people: readonly PersonLine[],
  roleIn: (role: PersonLine['grants'][number]['role'], program: boolean) => string,
): readonly { readonly value: string; readonly label: string }[] {
  const plain = people.map((person) => {
    const roles = person.isOwner
      ? [t('role.owner'), ...person.grants.map((g) => roleIn(g.role, g.program))]
      : person.grants.map((g) => roleIn(g.role, g.program));
    const name = person.isYou
      ? `${person.name ?? t('adminAccess.noName')}, ${t('adminAccess.you')}`
      : (person.name ?? t('adminAccess.noName'));
    return { name, roles: roles.join('; ') };
  });
  const label = (one: { name: string; roles: string }) =>
    one.roles === ''
      ? one.name
      : t('adminAccess.log.whoChoice', { name: one.name, roles: one.roles });
  const counts = new Map<string, number>();
  for (const one of plain) counts.set(label(one), (counts.get(label(one)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return people.map((person, i) => {
    const one = plain[i] ?? { name: '', roles: '' };
    const text = label(one);
    if ((counts.get(text) ?? 0) < 2) return { value: person.accountId, label: text };
    const number = (seen.get(text) ?? 0) + 1;
    seen.set(text, number);
    return {
      value: person.accountId,
      label: t('adminAccess.log.whoChoiceAgain', {
        name: one.name,
        roles: one.roles,
        number: String(number),
      }),
    };
  });
}
