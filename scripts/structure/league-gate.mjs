// T-454 (step 2.223): every way into a league goes through the league gate, which answers
// a league hidden from the person (a draft or suspended one, U-9) as one that is not there.
// - A route under `apps/web/src/app/api/v1/leagues/` calls `leagueEndpoint(` in each
//   handler it exports, before it reads the request's body (`jsonBody(`, `request.json(`
//   and the like), so no endpoint reads what was sent for a league it may not open.
// - A `'use server'` file passes the page gate (`loadLeaguePage(`, or the schedule
//   builder's `performScheduleAction(`, which calls it) in each function it exports,
//   itself or through a function of the same file that does, unless the file is listed
//   below with why it reaches no league or must not be gated.
// Comments and strings do not count.
import path from 'node:path';
import { isCodeFile, isTestFile, violation } from './source.mjs';

export const rule = 'T-454';
export const title = 'every league endpoint and server action passes the league gate';

const routes = 'apps/web/src/app/api/v1/leagues/';
const pageGates = ['loadLeaguePage', 'performScheduleAction'];
const bodyReads = /\bjsonBody\(|\brequest\.(?:json|text|formData|arrayBuffer|blob|body)\b/;

/** Server action files that do not take the page gate, and why. */
export const ungatedActions = {
  'apps/web/src/server/sign-in/actions.ts': 'signing in reaches no league',
  'apps/web/src/server/sign-in/local-actions.ts': 'the made-up sign-ins reach no league',
  'apps/web/src/features/access-area/invitation-actions.ts':
    'an invitee must reach a draft league; a visitor at a hidden league is sent where a ' +
    'missing league sends them (turnedBackTo, T-453)',
};

// A top-level definition: a function or a const, exported or not.
const defined = /^(export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+))/gm;

/** Each top-level definition of `bare`: its name, whether exported, where, and its text. */
function definitions(bare) {
  const starts = [...bare.matchAll(defined)];
  return starts.map((m, k) => ({
    name: m[2] ?? m[3],
    exported: m[1] !== undefined,
    at: m.index,
    text: bare.slice(m.index, starts[k + 1]?.index ?? bare.length),
  }));
}

const calls = (text, name) => new RegExp(`\\b${name}\\(`).test(text);

/** The names in this file that pass the page gate: the gates, and whatever calls one. */
function gatedNames(parts) {
  const gated = new Set(pageGates);
  for (let grew = true; grew; ) {
    grew = false;
    for (const part of parts) {
      if (gated.has(part.name)) continue;
      if ([...gated].some((name) => calls(part.text, name))) {
        gated.add(part.name);
        grew = true;
      }
    }
  }
  return gated;
}

const isUseServer = (text) => /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*(['"])use server\1/.test(text);

export function check(repo) {
  const out = [];
  for (const file of repo.files) {
    if (!isCodeFile(file.rel) || isTestFile(file.rel)) continue;
    const { bare } = file.lexed;
    if (file.rel.startsWith(routes) && /\/route\.tsx?$/.test(file.rel)) {
      for (const part of definitions(bare)) {
        if (!part.exported || !/^(?:GET|POST|PUT|PATCH|DELETE)$/.test(part.name)) continue;
        const gate = part.text.search(/\bleagueEndpoint\(/);
        const read = part.text.search(bodyReads);
        if (gate === -1 || (read !== -1 && read < gate)) {
          out.push(
            violation(
              rule,
              file,
              part.at,
              `${part.name} reaches a league without the league gate: call leagueEndpoint( ` +
                'before anything reads the request (league-api-route.ts)',
            ),
          );
        }
      }
    } else if (isUseServer(file.text) && !(file.rel in ungatedActions)) {
      // What the file imports from its own folders counts too (a `runTeamsAction` beside it).
      const byRel = new Map(repo.files.map((f) => [f.rel, f]));
      const helpers = file.lexed.imports
        .filter((i) => i.spec.startsWith('.'))
        .map((i) =>
          byRel.get(path.posix.normalize(path.posix.join(path.posix.dirname(file.rel), i.spec))),
        )
        .filter((f) => f !== undefined && !isUseServer(f.text))
        .flatMap((f) => definitions(f.lexed.bare));
      const parts = definitions(bare);
      const gated = gatedNames([...helpers, ...parts]);
      for (const part of parts) {
        if (!part.exported || gated.has(part.name)) continue;
        out.push(
          violation(
            rule,
            file,
            part.at,
            `the server action ${part.name} does not pass the league gate: call ` +
              'loadLeaguePage( first, or list the file in scripts/structure/league-gate.mjs ' +
              'with why it reaches no league',
          ),
        );
      }
    }
  }
  return out;
}
