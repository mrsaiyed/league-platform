// Which part of the league list a team's page shows to pick a person for its roster.
/**
 * What the page was asked to show of the league list (step 2.90, T-448): a name searched
 * for (never an email: a team's page reads names only) and which page of 200.
 */
export function pickOf(query: Readonly<Record<string, string | string[] | undefined>>): {
  readonly search: string | undefined;
  readonly page: number;
} {
  const q = typeof query['q'] === 'string' ? query['q'].trim().slice(0, 100) : '';
  const search = q === '' || q.includes('@') ? undefined : q.replace(/[‘’]/g, "'");
  const asked = typeof query['page'] === 'string' ? Number(query['page']) : 1;
  const page = Number.isInteger(asked) && asked >= 1 && asked <= 10_000 ? asked : 1;
  return { search, page };
}
