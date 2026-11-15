// NODE-TS: code that Node runs itself, not through a bundler, may use only the
// TypeScript that Node's type stripping removes. Node refuses a whole file for a
// constructor parameter property (`constructor(readonly x: T)`), an enum, a namespace
// with code, `import =` or `export =`, and the web server then dies at start with
// only "… is not supported in strip-only mode", naming no file (step 2.149).
//
// Each entry in config.nodeEntries, and every file it loads (static imports,
// re-exports and dynamic imports of a written name), is put through Node's own
// stripper, so what is refused here is exactly what Node would refuse. Imports are
// read from the stripped code: `import { type A } from './a'` still loads './a'. A
// test file reached this way is refused too: Node would run it in the app.
import { stripTypeScriptTypes } from 'node:module';
import { isCodeFile, isTestFile, lex, violation } from './source.mjs';

export const rule = 'NODE-TS';
export const title = 'code Node runs itself uses only TypeScript Node can strip';

const typeScript = /\.[cm]?ts$/;

// Where in a refused file the construct Node named is, for the line number; found in
// the code with comments and strings blanked. Node itself says only what it refused.
const places = [
  [/parameter property/, /\bconstructor\s*\(/g, parameterProperty],
  [/enum/, /\benum\s+[A-Za-z_$]/g],
  [/namespace|module/, /\b(?:namespace|module)\s+[A-Za-z_$]/g],
  [/import equals/, /\bimport\s+[A-Za-z_$][\w$]*\s*=/g],
  [/export assignment|export =/, /\bexport\s*=/g],
];

function parameterProperty(bare, at) {
  const open = bare.indexOf('(', at);
  let depth = 0;
  for (let i = open; i < bare.length; i++) {
    if (bare[i] === '(') depth++;
    else if (bare[i] === ')' && --depth === 0) {
      const inside = bare.slice(open, i);
      const found = /\b(?:public|private|protected|readonly|override)\s+[A-Za-z_$]/.exec(inside);
      return found ? open + found.index : -1;
    }
  }
  return -1;
}

/** The offset of what Node refused, or 0 when it cannot be pointed at. */
function placeOf(file, message) {
  const { bare } = file.lexed;
  for (const [named, pattern, refine] of places) {
    if (!named.test(message)) continue;
    for (const match of bare.matchAll(pattern)) {
      const at = refine ? refine(bare, match.index) : match.index;
      if (at >= 0) return at;
    }
  }
  return 0;
}

/** Strips `text` as Node does; the error is Node's when it refuses. */
export function stripAsNode(text) {
  const warn = process.emitWarning;
  // stripTypeScriptTypes warns that it is experimental on every first use: not news here.
  process.emitWarning = () => {};
  try {
    return stripTypeScriptTypes(text, { mode: 'strip' });
  } finally {
    process.emitWarning = warn;
  }
}

export function check(repo) {
  const out = [];
  const seen = new Set();
  const queue = repo.config.nodeEntries.map((rel) => ({ rel, from: undefined }));
  while (queue.length > 0) {
    const { rel, from } = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const file = repo.file(rel);
    if (!file || !isCodeFile(rel)) continue;
    if (from && isTestFile(rel)) {
      out.push(
        violation(
          rule,
          from.file,
          from.at,
          `loads the test file ${rel}, so Node would run it in the app. Code Node runs must not import tests or their helpers.`,
        ),
      );
    }
    let code = file.text;
    if (typeScript.test(rel)) {
      try {
        code = stripAsNode(file.text);
      } catch (error) {
        const said = error instanceof Error ? error.message : String(error);
        const chain = from ? ` (loaded by ${from.file.rel})` : '';
        out.push(
          violation(
            rule,
            file,
            placeOf(file, said),
            `Node refuses this file: "${said}". Node runs it itself${chain}, so it may use only TypeScript Node can strip: declare a field and set it in the constructor instead of a parameter property; a union of strings instead of an enum.`,
          ),
        );
        continue;
      }
    }
    for (const imp of lex(code).imports) {
      if (imp.typeOnly) continue;
      const target = repo.resolve(file, imp.spec);
      if ((target.kind === 'file' || target.kind === 'workspace') && target.rel) {
        queue.push({ rel: target.rel, from: { file, at: imp.start } });
      }
    }
  }
  return out;
}
