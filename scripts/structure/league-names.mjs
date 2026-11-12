// T-27: no league is ever named in code. Differences between leagues are data.
// Looks for every league we know by name in identifiers, strings, JSX text and
// SQL, ignoring comments. Seed and fixture folders may name leagues.
import { violation } from './source.mjs';

export const rule = 'T-27';
export const title = 'no league named in code';

/** One pattern for all known names: `al-hadi` → `al[-_\s.]?hadi`, case-insensitive. */
export function leaguePattern(names) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = names.map((name) => name.split('-').map(escape).join('[-_\\s.]?'));
  return new RegExp(parts.join('|'), 'gi');
}

export function check(repo) {
  const { knownLeagueNames, leagueNamesAllowedIn } = repo.config;
  if (!knownLeagueNames.length) return [];
  const pattern = leaguePattern(knownLeagueNames);
  const out = [];
  for (const file of repo.files) {
    if (repo.isLegacy(file.rel)) continue;
    const at = '/' + file.rel;
    if (
      leagueNamesAllowedIn.some((place) => at.includes(place.startsWith('/') ? place : '/' + place))
    )
      continue;
    const text = file.ext === '.json' ? file.text : file.lexed.code;
    for (const match of text.matchAll(pattern)) {
      out.push(
        violation(
          rule,
          file,
          match.index,
          `names the league "${match[0]}". Code must work the same for every league: make the ` +
            `difference a league setting or seed data instead.`,
        ),
      );
    }
  }
  return out;
}
