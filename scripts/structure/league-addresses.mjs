// T-34: every league address is built by one helper, and the league a request is
// for is worked out in one place. Outside those files, an address whose FIRST
// path segment is a league value written in by hand fails: `/${league.slug}/...`,
// `${origin}/${leagueSlug}`, `'/' + league.slug`. Later segments are not league
// addresses (`/api/v1/leagues/${leagueId}`, `leagues/${leagueId}/logos/...`), nor
// are first segments that are not leagues (`/${locale}/...`).
import { isCodeFile, violation } from './source.mjs';

export const rule = 'T-34';
export const title = 'no hand-written league addresses';

/** A value that holds a league: its expression or name mentions league or slug. */
const leagueish = /league|slug/i;
/** A value that is an API base rather than a page origin. */
const apiish = /api/i;
/** `scheme://host/` with no path: what comes next is the first path segment. */
const originOnly = /^[a-z][\w+.-]*:\/\/[^/]*\/?$/i;

// Template: optional `${origin}` or `https://host`, then `/${value}` as the first segment.
const templateFirstSegment = /^(?:\$\{([^}]*)\}|[a-z][\w+.-]*:\/\/[^/$]*)?\/\$\{([^}]*)\}/i;

export function check(repo) {
  const { addressHelperFiles } = repo.config;
  const out = [];
  const fix =
    'Build league addresses with the one address helper (leagueUrl) so moving leagues to their ' +
    'own subdomain or domain later changes one file.';
  for (const file of repo.files) {
    if (!isCodeFile(file.rel) || addressHelperFiles.includes(file.rel)) continue;
    const { literals, bare } = file.lexed;

    for (const lit of literals) {
      if (lit.kind !== 'template') continue;
      const match = templateFirstSegment.exec(lit.value);
      if (!match) continue;
      const [, base, value] = match;
      if (!leagueish.test(value) || (base && apiish.test(base))) continue;
      out.push(
        violation(rule, file, lit.start, `writes the address \`${lit.value}\` by hand. ${fix}`),
      );
    }

    // A string ending the path just before the first segment, joined to a league value.
    for (const match of bare.matchAll(/(['"])[^'"\n]*\1\s*\+\s*([\w$.?[\]]+)/g)) {
      const literal = /^(['"])([^'"\n]*)\1/.exec(file.text.slice(match.index))?.[2];
      if (literal === undefined || !leagueish.test(match[2])) continue;
      if (literal !== '/' && !originOnly.test(literal)) continue;
      if (literal === '/') {
        // What `'/'` is appended to decides whether the next segment is the first one.
        const before = bare.slice(0, match.index);
        const operand = /([\w$.?[\]]+)\s*\+\s*$/.exec(before)?.[1];
        if (operand && apiish.test(operand)) continue;
        const string = /(['"])[^'"\n]*\1\s*\+\s*$/.exec(before);
        if (string) {
          const prior = /^(['"])([^'"\n]*)\1/.exec(file.text.slice(string.index))?.[2] ?? '';
          if (!originOnly.test(prior)) continue;
        }
      }
      out.push(
        violation(rule, file, match.index, `joins a league into an address by hand. ${fix}`),
      );
    }
  }
  return out;
}
