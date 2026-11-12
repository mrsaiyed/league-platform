// T-30: settings and secrets are read in one place, and never appear in browser
// code. Browser code is: every file in ui and site, every file in apps/web/public
// (scripts, JSON and HTML alike), every app file that starts with 'use client', and
// everything those load at run time: relative and `@/` imports and workspace
// packages, followed to their source. Type-only imports are erased, so not followed.
// Browser code may not read the environment, import server-only packages, or
// contain anything that looks like a secret. The pure layers (contracts, sports,
// core, ui, site) may not read the environment anywhere (T2 §2). Everywhere else,
// the environment is read only in the config module files named in config.mjs.
import { isCodeFile, violation } from './source.mjs';

export const rule = 'T-30';
export const title = 'no settings or secrets in browser code';

// `bare` has string text blanked, so a message mentioning process.env is not a read.
const envReads = [
  { on: 'bare', re: /\bprocess\s*\.\s*env\b/g },
  { on: 'code', re: /\bprocess\s*\[\s*['"`]env['"`]\s*\]/g },
  { on: 'bare', re: /\{[^{}]*\benv\b[^{}]*\}\s*=\s*process\b/g }, // const { env } = process
  { on: 'bare', re: /\bimport\s*\.\s*meta\s*\.\s*env\b/g },
  { on: 'bare', re: /\b(?:Deno|Bun)\s*\.\s*env\b/g },
];

const secretShapes = [
  { what: 'a Stripe key', re: /\b[sr]k_(?:live|test)_[0-9A-Za-z]{8,}/g },
  { what: 'a Resend key', re: /\bre_[0-9A-Za-z_]{20,}/g },
  { what: 'an AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { what: 'a signed token (JWT)', re: /\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]{4,}/g },
  {
    what: 'a database address with a password',
    re: /\bpostgres(?:ql)?:\/\/[^:/\s'"`]+:[^@\s'"`]+@/g,
  },
  { what: 'a private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { what: 'a service-role key name', re: /service[_-]?role/gi },
];

export function check(repo) {
  const { noSettingsWorkspaces, serverOnlyWorkspaces, settingsReaderFiles } = repo.config;
  const out = [];
  const browser = browserFiles(repo);
  for (const file of repo.files) {
    const workspace = repo.workspaceOf(file.rel);
    const inBrowser = browser.get(file.rel);
    const pure = workspace && noSettingsWorkspaces.includes(workspace.dir) && isCodeFile(file.rel);
    if (!inBrowser && !pure) {
      // Server code: allowed to read settings only in the config module files.
      if (!workspace || !isCodeFile(file.rel) || settingsReaderFiles.includes(file.rel)) continue;
      for (const { on, re } of envReads) {
        for (const match of file.lexed[on].matchAll(re)) {
          out.push(
            violation(
              rule,
              file,
              match.index,
              `reads the environment but is not a config module. Settings are read once, in ` +
                `${settingsReaderFiles.join(' or ')}; call getConfig() instead.`,
            ),
          );
        }
      }
      continue;
    }
    const why = inBrowser
      ? `is browser code (${inBrowser})`
      : `is in ${workspace.dir}, which never reads settings`;

    if (isCodeFile(file.rel)) {
      for (const { on, re } of envReads) {
        for (const match of file.lexed[on].matchAll(re)) {
          out.push(
            violation(
              rule,
              file,
              match.index,
              `reads the environment but ${why}. Settings are read once in the server's config ` +
                `module and passed in; anything the browser needs is sent to it on purpose.`,
            ),
          );
        }
      }
    }
    if (!inBrowser) continue;

    // In code, secrets live in strings; other served files (JSON, HTML) are all text.
    const places = isCodeFile(file.rel)
      ? file.lexed.literals.map((lit) => ({ text: lit.value, at: lit.start + 1 }))
      : [{ text: file.text, at: 0 }];
    for (const { text, at } of places) {
      for (const { what, re } of secretShapes) {
        for (const match of text.matchAll(re)) {
          out.push(
            violation(rule, file, at + match.index, `has what looks like ${what} but ${why}.`),
          );
        }
      }
    }

    for (const imp of file.lexed.imports) {
      if (imp.typeOnly) continue;
      const to = repo.resolve(file, imp.spec).workspace;
      if (to && serverOnlyWorkspaces.includes(to.dir)) {
        out.push(
          violation(
            rule,
            file,
            imp.start,
            `imports ${to.dir} ('${imp.spec}') but ${why}. Server-only code must not reach the ` +
              `browser; call it from a server action or API handler.`,
          ),
        );
      }
    }
  }
  return out;
}

/** Map of browser files → why each one counts as browser code. */
export function browserFiles(repo) {
  const { browserWorkspaces, browserFolders } = repo.config;
  const found = new Map();
  const queue = [];
  const add = (file, why) => {
    if (found.has(file.rel)) return;
    found.set(file.rel, why);
    if (isCodeFile(file.rel)) queue.push(file);
  };
  for (const file of repo.files) {
    const workspace = repo.workspaceOf(file.rel);
    if (browserFolders.some((dir) => file.rel.startsWith(dir))) add(file, 'served as is');
    else if (!isCodeFile(file.rel)) continue;
    else if (workspace && browserWorkspaces.includes(workspace.dir))
      add(file, `in ${workspace.dir}`);
    else if (startsWithUseClient(file)) add(file, "marked 'use client'");
  }
  // Whatever browser code loads at run time ends up in the browser too.
  while (queue.length) {
    const file = queue.shift();
    for (const imp of file.lexed.imports) {
      if (imp.typeOnly) continue;
      const target = repo.resolve(file, imp.spec);
      const next = target.rel && repo.file(target.rel);
      if (next && isCodeFile(next.rel)) add(next, `loaded by browser code ${file.rel}`);
    }
  }
  return found;
}

function startsWithUseClient(file) {
  const first = file.lexed.literals[0];
  if (!first || first.kind !== 'string' || first.value !== 'use client') return false;
  return file.lexed.code.slice(0, first.start).trim() === '';
}
