// The real names the repository holds, for the seed's no-real-name checks (step 2.59, T-201):
// the live tracker's own fixtures (apps/live-stats/data) name a real league, school, its
// opponents, venues and their addresses. A check looks for each whole value and for each
// distinctive word in them (four letters or more, not a word every school or address
// uses), as a whole word, ignoring case. It only counts: a check that fails must never
// print a real name.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The keys whose values name something real. */
const namingKeys = ['name', 'school', 'venue', 'address', 'source', 'division', 'slug'];

/** Words of four letters or more that name nothing on their own. */
const generic = new Set(
  `academy academies charter school schools prep preparatory college collegiate high middle
  elementary varsity junior boys girls basketball league district division conference region
  regional state association athletic athletics gym gymnasium center centre road street avenue
  drive lane boulevard parkway highway freeway suite building campus north south east west
  central city county park home away game games season regular team teams final semifinal
  playoff playoffs tournament https http html www`
    .split(/\s+/)
    .filter(Boolean),
);

export type RealNames = { readonly values: readonly string[]; readonly words: readonly string[] };

/** The real names under `repositoryRoot`: whole values and their distinctive words. */
export function realNames(repositoryRoot: string): RealNames {
  const folder = path.join(repositoryRoot, 'apps', 'live-stats', 'data');
  const values = new Set<string>();
  const collect = (value: unknown, key = '') => {
    if (typeof value === 'string') {
      if (namingKeys.includes(key) && value.trim().length > 3)
        values.add(value.trim().toLowerCase());
    } else if (Array.isArray(value)) for (const item of value) collect(item, key);
    else if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(v, k);
    }
  };
  const files = existsSync(folder) ? readdirSync(folder).filter((f) => f.endsWith('.json')) : [];
  for (const file of files) collect(JSON.parse(readFileSync(path.join(folder, file), 'utf8')));
  const words = new Set<string>();
  for (const value of values) {
    for (const word of value.split(/[^\p{L}]+/u)) {
      if (word.length >= 4 && !generic.has(word)) words.add(word);
    }
  }
  return { values: [...values], words: [...words] };
}

/** How many of the real names are in `text`: whole values anywhere, words as whole words. */
export function realNamesIn(text: string, real: RealNames): number {
  const lower = text.toLowerCase();
  const inText = new Set(lower.split(/[^\p{L}]+/u));
  return (
    real.values.filter((value) => lower.includes(value)).length +
    real.words.filter((word) => inText.has(word)).length
  );
}
