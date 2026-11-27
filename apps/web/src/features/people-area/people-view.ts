// What the People screens draw (step 2.50), worked out from the people commands' own
// answers, so a page holds nothing more than it shows. A contact email, a birth date and
// whether a person is a child come only from a record the query read with them, which it
// does only for a role holding `people.read_sensitive` (R-16, T-76): for anyone else
// there is nothing to copy, so neither the screen nor the page's data has them.
import {
  getPerson,
  listPeople,
  type CommandContext,
  type CommandDeps,
  type PeopleTx,
  type PersonRecord,
} from '@srleagues/core';
import { rosterName, showAsOf } from '../teams-area/index.ts';

/** How many people one page of the list shows. */
export const peoplePageSize = 50;

type Query = Readonly<Record<string, string | string[] | undefined>>;
const only = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** What the list's address asks for: a name to search for, and which page of 50. */
export type PeopleAsk = {
  /** The name searched for, as typed; undefined when nothing is searched. */
  readonly search: string | undefined;
  /**
   * The search held an email address, which is not searched (a person's contact details
   * never go in an address): the box is emptied and the page says so.
   */
  readonly emailRefused: boolean;
  /** The page, from 1. */
  readonly page: number;
  /**
   * Only people ticked as children who are 18 or over by birth date (`?ticked=grown`, step
   * 2.146): the database works it out, so no date reaches the page.
   */
  readonly tickedButGrown: boolean;
};

export function peopleAskOf(query: Query): PeopleAsk {
  const typed = (only(query['q']) ?? '').trim().slice(0, 100);
  const emailRefused = typed.includes('@');
  const page = Number(only(query['page']) ?? '1');
  return {
    search: typed === '' || emailRefused ? undefined : typed,
    emailRefused,
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    tickedButGrown: only(query['ticked']) === 'grown',
  };
}

/**
 * One line of the list: who, and nothing else. The list holds names only, for every role:
 * a person's private details are on their own record, for a role that may see them.
 */
export type PeopleRow = {
  readonly id: string;
  readonly name: string;
  /** "Show as: initials" or "Show as: removed" beside the recorded name (R-33); else absent. */
  readonly showAs?: string;
};

export function peopleRowOf(person: PersonRecord): PeopleRow {
  const showAs = showAsOf({ nameRequest: person.visibility });
  return { id: person.id, name: rosterName(person), ...(showAs === undefined ? {} : { showAs }) };
}

export type PeopleList =
  | { readonly ok: true; readonly rows: readonly PeopleRow[]; readonly more: boolean }
  | { readonly ok: false; readonly code: string };

/** One page of the list, searched by name; one more is read to know whether there is a next. */
export async function readPeopleList(
  context: CommandContext,
  ask: PeopleAsk,
  deps: CommandDeps<PeopleTx>,
): Promise<PeopleList> {
  const read = await listPeople(
    context,
    {
      ...(ask.search === undefined ? {} : { search: ask.search }),
      limit: peoplePageSize + 1,
      offset: (ask.page - 1) * peoplePageSize,
      tickedButGrown: ask.tickedButGrown,
    },
    deps,
  );
  if (!read.ok) return { ok: false, code: read.error.code };
  return {
    ok: true,
    rows: read.value.slice(0, peoplePageSize).map(peopleRowOf),
    more: read.value.length > peoplePageSize,
  };
}

/** Whether a person is recorded as a child, an adult, or neither, as the form's choice says it. */
export type ChildChoice = '' | 'child' | 'adult';

/** The private details, as the form's boxes hold them. */
export type PrivateDetails = {
  readonly contactEmail: string;
  readonly birthDate: string;
  readonly child: ChildChoice;
};

/** One person's record as their page draws it. */
export type PersonView = {
  readonly id: string;
  readonly version: number;
  readonly firstName: string;
  readonly lastName: string;
  /** Their name as the admin's screens write it ("#12" for a player with none, S-34). */
  readonly name: string;
  /** What they or their guardian asked for on public pages: none, initials or removed (R-23). */
  readonly visibility: string;
  /** Present only when the record was read with the private fields (R-16). */
  readonly private?: PrivateDetails;
};

export function personViewOf(person: PersonRecord): PersonView {
  const view = {
    id: person.id,
    version: person.version,
    firstName: person.firstName,
    lastName: person.lastName,
    name: rosterName(person),
    visibility: person.visibility,
  };
  const sensitive = person.sensitive;
  if (sensitive === undefined) return view;
  return {
    ...view,
    private: {
      contactEmail: sensitive.contactEmail ?? '',
      birthDate: sensitive.birthDate ?? '',
      child: sensitive.isMinor === null ? '' : sensitive.isMinor ? 'child' : 'adult',
    },
  };
}

export type PersonRead =
  | { readonly ok: true; readonly person: PersonView }
  | { readonly ok: false; readonly code: string };

export async function readPerson(
  context: CommandContext,
  personId: string,
  deps: CommandDeps<PeopleTx>,
): Promise<PersonRead> {
  const read = await getPerson(context, { personId }, deps);
  return read.ok
    ? { ok: true, person: personViewOf(read.value) }
    : { ok: false, code: read.error.code };
}
