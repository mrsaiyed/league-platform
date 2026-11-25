// T-454 (step 2.223): every way into a league goes through the league gate, which answers
// a league hidden from the person (a draft or suspended one, U-9) as one that is not there.
// - A route under `apps/web/src/app/api/v1/leagues/` exports only handlers it writes itself
//   (GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE: every one is checked) and Next.js's
//   settings (`dynamic` and the like): no re-export, no `export { … }`, `export *` or
//   `export default`, no other name. In each handler the gate's call `leagueEndpoint(` is a
//   statement of the handler's own body (`const endpoint = await leagueEndpoint(…)`, not
//   under an `if`, a loop or an inner function), and before it nothing is awaited but the
//   route's `params` and nothing reads the body (`jsonBody(`, `.json(`, `.formData(`,
//   `.text(`, `.arrayBuffer(`, `.blob(`, `.body`, whatever the request is called).
// - A `'use server'` file passes the page gate (`loadLeaguePage(`, or the schedule
//   builder's `performScheduleAction(`, which calls it) in each function it exports,
//   itself or through a function of the same file, or of a file it imports from its own
//   folders, that does, unless the file is listed below with why it reaches no league or
//   must not be gated. A `'use server'` written inside a function (an action inline in a
//   page or component) is refused anywhere in the app: actions live in their own files,
//   where this rule reads them.
// Comments and strings do not count.
//
// What it still cannot catch (read it as a reviewer would): in a server action it checks
// only that the gate is called somewhere in the action or a helper it calls, not when: an
// action that calls `loadLeaguePage(` only under an `if`, or after it has changed
// something, passes. A route handler that hands the request to a function of its own
// (`const x = parse(request)`) before the gate, without awaiting it, passes: what that
// function reads is not followed. A gate whose answer is not looked at (`if (!endpoint.ok)`)
// passes. A league reached outside these two kinds of file (a page that reads a league
// without `loadLeaguePage`, a route outside `api/v1/leagues`) is not this rule's: the
// pages are proved by `npm run test:web` and `league-gate-hidden.test.ts`.
import path from 'node:path';
import { isCodeFile, isTestFile, violation } from './source.mjs';

export const rule = 'T-454';
export const title = 'every league endpoint and server action passes the league gate';

const routes = 'apps/web/src/app/api/v1/leagues/';
const pageGates = ['loadLeaguePage', 'performScheduleAction'];
// A read of what was sent, by any name: `jsonBody(request)`, `req.json()`, `r.body`.
const bodyReads = /\bjsonBody\(|\.\s*(?:json|text|formData|arrayBuffer|blob)\s*\(|\.\s*body\b/;
const handlerNames = /^(?:GET|HEAD|OPTIONS|POST|PUT|PATCH|DELETE)$/;
// Next.js's route settings, which hold no code.
const routeSettings =
  /^(?:dynamic|dynamicParams|revalidate|fetchCache|runtime|preferredRegion|maxDuration)$/;
// Any other way of exporting: a list or re-export, everything, a default, a let or class.
const otherExports = /^export\s*(?:\{|\*|default\b|let\b|var\b|class\b|enum\b|abstract\b)/gm;

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

/** Where the closing mark of the bracket opened at `at` is, in `text`, or -1. */
function closing(text, at) {
  const open = text[at];
  const close = open === '(' ? ')' : '}';
  for (let i = at, depth = 0; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

/** The body of a function definition (inside its braces), or undefined if it is not one. */
function bodyOf(part) {
  const head = part.text.match(
    /^(?:export\s+)?(?:async\s+)?(?:function\s+\w+\s*|const\s+\w+\s*(?::[^=]*)?=\s*async\s*(?:function\s*)?)\(/,
  );
  if (head === null) return undefined;
  const params = closing(part.text, head[0].length - 1);
  const open = params === -1 ? -1 : part.text.indexOf('{', params);
  const end = open === -1 ? -1 : closing(part.text, open);
  return end === -1 ? undefined : part.text.slice(open + 1, end);
}

/** Why a route handler does not pass the gate first, or undefined when it does. */
function lateGate(part) {
  const body = bodyOf(part);
  if (body === undefined) return 'it is not a function written here';
  const gate = body.search(/\bleagueEndpoint\(/);
  if (gate === -1) return 'it never calls leagueEndpoint(';
  let braces = 0;
  let parens = 0;
  let statement = 0;
  for (let i = 0; i < gate; i += 1) {
    const c = body[i];
    if (c === '{') braces += 1;
    else if (c === '}') braces -= 1;
    else if (c === '(') parens += 1;
    else if (c === ')') parens -= 1;
    if (braces === 0 && parens === 0 && (c === ';' || c === '{' || c === '}')) statement = i + 1;
  }
  const prefix = body.slice(statement, gate);
  const plain = /^\s*(?:(?:const|let)\s+(?:\w+|\{[^{}]*\})\s*=\s*)?await\s+$/;
  if (braces !== 0 || parens !== 0 || !plain.test(prefix)) {
    return 'its call is not a statement of the handler itself (under an if, a loop or another call)';
  }
  const before = body.slice(0, statement);
  if (bodyReads.test(before)) return 'it reads the body before the gate';
  if ([...before.matchAll(/\bawait\b(?!\s+params\b)/g)].length > 0) {
    return 'something other than the route params is awaited before the gate';
  }
  return undefined;
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
      for (const other of bare.matchAll(otherExports)) {
        out.push(
          violation(
            rule,
            file,
            other.index,
            'a league route exports only the handlers it writes itself: no re-export, ' +
              'list, default or other export, so each handler can be read for the gate',
          ),
        );
      }
      for (const part of definitions(bare)) {
        if (!part.exported || routeSettings.test(part.name)) continue;
        if (!handlerNames.test(part.name)) {
          out.push(
            violation(
              rule,
              file,
              part.at,
              `${part.name} is exported by a league route: it exports only its handlers ` +
                'and settings',
            ),
          );
          continue;
        }
        const why = lateGate(part);
        if (why !== undefined) {
          out.push(
            violation(
              rule,
              file,
              part.at,
              `${part.name} reaches a league without the league gate (${why}): call ` +
                'leagueEndpoint( first, before anything reads the request (league-api-route.ts)',
            ),
          );
        }
      }
      continue;
    }
    if (
      !isUseServer(file.text) &&
      file.rel.startsWith('apps/') &&
      /(['"])use server\1/.test(file.lexed.code)
    ) {
      const at = file.lexed.code.search(/(['"])use server\1/);
      out.push(
        violation(
          rule,
          file,
          at,
          "a server action written inside a function ('use server' not at the top of the " +
            'file): put it in a file of its own that begins with it, where T-454 reads it',
        ),
      );
    }
    if (isUseServer(file.text) && !(file.rel in ungatedActions)) {
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
