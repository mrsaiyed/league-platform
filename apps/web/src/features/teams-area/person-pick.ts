// Which part of the league list a team's page shows to pick a person for its roster, and
// the one rule for what "Find" makes of what was typed (step 2.90, T-448): the page, the
// form with scripts on and the form's server action all use it.

type Query = Readonly<Record<string, string | string[] | undefined>>;

/** What the page was asked to show: a name searched for, which page of 200, and whether an
 * email was typed (said in words: a team's page finds people by name only, T-76). */
export type Pick = {
  readonly search: string | undefined;
  readonly page: number;
  readonly byNameOnly: boolean;
};

/** The marker an address carries when an email was typed into "Find": never the email. */
const byNameMarker = { find: 'by-name' } as const;

/** What was typed into "Find", cleaned: trimmed, 100 characters at most, plain apostrophes. */
function cleaned(typed: string): string {
  return typed.trim().slice(0, 100).replace(/[‘’]/g, "'");
}

/**
 * What "Find" puts in the team's address for what was typed: the name, nothing for an empty
 * box, and for an email only a marker, so the page can say why nothing was searched.
 */
export function findQuery(typed: string): Readonly<Record<string, string>> {
  const q = cleaned(typed);
  if (q === '') return {};
  return q.includes('@') ? byNameMarker : { q };
}

/** A whole number from 1 to 10 000, written plainly (`1e1`, `2.0`, `+2` are not). */
const pageShape = /^[1-9][0-9]{0,4}$/;

export function pickOf(query: Query): Pick {
  const typed = typeof query['q'] === 'string' ? cleaned(query['q']) : '';
  const email = typed.includes('@');
  const search = typed === '' || email ? undefined : typed;
  const asked = query['page'];
  const number = typeof asked === 'string' && pageShape.test(asked) ? Number(asked) : 1;
  const page = number <= 10_000 ? number : 1;
  return { search, page, byNameOnly: email || query['find'] === byNameMarker.find };
}

/** The address query that shows `pick` again, at `page` (its own by default). */
export function pickQuery(pick: Pick, page: number = pick.page): Readonly<Record<string, string>> {
  return {
    ...(pick.search === undefined ? {} : { q: pick.search }),
    ...(page === 1 ? {} : { page: String(page) }),
  };
}
