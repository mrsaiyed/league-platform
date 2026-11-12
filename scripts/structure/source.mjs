// Reads a repository into the shape every structure check works on: the files to
// scan, the workspaces they belong to, and for each source file its comments,
// string literals and imports. No outside parser: a small lexer is enough for
// these rules and keeps the checks free of dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import * as defaults from './config.mjs';

export const codeExtensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const scannedExtensions = [...codeExtensions, '.sql', '.json', '.html'];
const builtins = new Set(builtinModules);
const indexFiles = ['index.ts', 'index.tsx', 'index.js', 'index.mjs'];

/** Turns a path into the repository-relative, forward-slash form used everywhere. */
export const toRel = (root, abs) => path.relative(root, abs).split(path.sep).join('/');

/** Tests and their helpers: `*.test.ts`, `*.spec.ts`, `*.test-helper.ts`, or files in a `testing/` folder. */
export const isTestFile = (rel) =>
  /\.(?:test|spec|test-helper)\.[cm]?[jt]sx?$/.test(rel) || /(?:^|\/)testing\//.test(rel);
export const isCodeFile = (rel) => codeExtensions.includes(path.extname(rel));
export const isBuiltin = (spec) => spec.startsWith('node:') || builtins.has(spec.split('/')[0]);

/** The package name of a bare import: `@scope/name/deep` → `@scope/name`, `zod/v4` → `zod`. */
export function packageOf(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Whether a library is in a list whose entries may be `@scope/*` patterns. */
export const libraryIn = (list, name) =>
  list.some((entry) =>
    entry.endsWith('/*') ? name.startsWith(entry.slice(0, -1)) : entry === name,
  );

/** Loads the repository at `root`. `config` overrides any setting in config.mjs. */
export function loadRepo(root, config = {}) {
  const cfg = { ...defaults, ...config };
  const rootPkg = readJson(path.join(root, 'package.json')) ?? {};
  const declared = Array.isArray(rootPkg.workspaces)
    ? rootPkg.workspaces
    : Array.isArray(rootPkg.workspaces?.packages)
      ? rootPkg.workspaces.packages
      : Object.keys(cfg.allowedDependencies);
  const dirs = [...new Set(declared.flatMap((entry) => expandWorkspace(root, entry)))];
  if (!dirs.length) {
    throw new Error(
      `Structure checks found no workspaces under ${root}. Check "workspaces" in its package.json.`,
    );
  }
  const workspaces = dirs.map((dir) => {
    const pkg = readJson(path.join(root, dir, 'package.json')) ?? {};
    const entry = entryOf(root, dir, pkg);
    return { dir, name: pkg.name, exports: pkg.exports, entry, hasIndex: Boolean(entry) };
  });
  const byName = new Map(workspaces.filter((w) => w.name).map((w) => [w.name, w]));

  const files = [];
  for (const dir of [...dirs, ...cfg.extraRoots]) {
    walk(path.join(root, dir), cfg.skippedFolders, (abs) => {
      const rel = toRel(root, abs);
      if (scannedExtensions.includes(path.extname(rel))) files.push(makeFile(abs, rel));
    });
  }
  const byRel = new Map(files.map((f) => [f.rel, f]));

  const workspaceOf = (rel) =>
    workspaces
      .filter((w) => rel === w.dir || rel.startsWith(w.dir + '/'))
      .sort((a, b) => b.dir.length - a.dir.length)[0];

  const fileTarget = (abs) => {
    const rel = toRel(root, resolveFile(abs));
    return { kind: 'file', rel, workspace: workspaceOf(rel), outside: rel.startsWith('..') };
  };

  return {
    root,
    config: cfg,
    files,
    workspaces,
    workspaceOf,
    workspaceByName: (name) => byName.get(name),
    file: (rel) => byRel.get(rel),
    isLegacy: (rel) => cfg.legacyFiles.includes(rel),
    /**
     * Where an import from `file` points: a file (a relative path, or `@/...` for
     * the workspace's own src folder), a workspace package (with `rel`, the file
     * it loads, when known), a Node built-in, or a library.
     */
    resolve(file, spec) {
      if (spec.startsWith('.') || spec.startsWith('/')) {
        return fileTarget(path.resolve(path.dirname(file.abs), spec));
      }
      if (spec.startsWith('@/')) {
        const own = workspaceOf(file.rel);
        if (own) return fileTarget(path.join(root, own.dir, 'src', spec.slice(2)));
      }
      const name = packageOf(spec);
      const workspace = byName.get(name);
      if (workspace) {
        const subpath = spec.slice(name.length);
        const rel = subpath
          ? toRel(root, resolveFile(path.join(root, workspace.dir, subpath)))
          : workspace.entry;
        return { kind: 'workspace', name, workspace, subpath, rel };
      }
      if (isBuiltin(spec)) return { kind: 'builtin', name: spec };
      return { kind: 'library', name };
    },
  };
}

/** The folders a workspaces entry names: one folder, or a pattern with `*` segments. */
function expandWorkspace(root, entry) {
  const clean = entry.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!clean.includes('*')) return fs.existsSync(path.join(root, clean)) ? [clean] : [];
  let found = [''];
  for (const segment of clean.split('/')) {
    if (!segment.includes('*')) {
      found = found.map((dir) => (dir ? dir + '/' + segment : segment));
      continue;
    }
    const re = new RegExp('^' + segment.split('*').map(escapeRegex).join('[^/]*') + '$');
    found = found.flatMap((dir) => {
      let entries = [];
      try {
        entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
      } catch {
        return [];
      }
      return entries
        .filter((e) => e.isDirectory() && re.test(e.name))
        .map((e) => (dir ? dir + '/' + e.name : e.name));
    });
  }
  return found.filter((dir) => fs.existsSync(path.join(root, dir, 'package.json'))).sort();
}

const escapeRegex = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** The file a workspace's package name loads: `exports['.']` when declared, else `main` or index. */
function entryOf(root, dir, pkg) {
  const exists = (rel) => typeof rel === 'string' && fs.existsSync(path.join(root, dir, rel));
  const asRel = (rel) => path.posix.normalize(dir + '/' + rel);
  if (pkg.exports !== undefined && pkg.exports !== null) {
    const { exports } = pkg;
    const conditional =
      typeof exports === 'object' &&
      !Array.isArray(exports) &&
      !Object.keys(exports).some((key) => key.startsWith('.'));
    const dot =
      typeof exports === 'string' || Array.isArray(exports) || conditional ? exports : exports['.'];
    const target = pickTarget(dot);
    return exists(target) ? asRel(target) : undefined;
  }
  if (exists(pkg.main)) return asRel(pkg.main);
  const index = indexFiles.find(exists);
  return index ? asRel(index) : undefined;
}

/** A conditional export resolved the way a bundler or Node would pick it. */
function pickTarget(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(pickTarget).find(Boolean);
  if (value && typeof value === 'object') {
    for (const key of ['import', 'browser', 'node', 'default', 'require', 'types']) {
      const found = pickTarget(value[key]);
      if (found) return found;
    }
  }
  return undefined;
}

function makeFile(abs, rel) {
  const text = fs.readFileSync(abs, 'utf8');
  const ext = path.extname(rel);
  let lexed;
  return {
    abs,
    rel,
    text,
    ext,
    /** Lazily lexed: { code, bare, literals, imports } (see lex). */
    get lexed() {
      if (!lexed) {
        if (ext === '.sql') lexed = lexSql(text);
        else if (ext === '.html') lexed = { code: text, bare: text, literals: [], imports: [] };
        else lexed = lex(text);
      }
      return lexed;
    },
    lineAt: (offset) => text.slice(0, offset).split('\n').length,
  };
}

function walk(dir, skipped, visit) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipped.includes(entry.name)) walk(abs, skipped, visit);
    } else if (entry.isFile()) visit(abs);
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Finds the file an import path names, trying the extensions TypeScript would. */
function resolveFile(abs) {
  const stripped = abs.replace(/\.[cm]?js$/, '');
  const candidates = [
    abs,
    ...codeExtensions.map((ext) => stripped + ext),
    ...indexFiles.map((f) => path.join(abs, f)),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? abs;
}

const regexAfterWords = new Set([
  'return',
  'typeof',
  'instanceof',
  'case',
  'do',
  'else',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'yield',
  'await',
]);
const regexAfterPunct = '(,=:[!&|?{};~+-*%>^';

/**
 * Splits JavaScript or TypeScript source into:
 * - `code`: the source with comments blanked (strings kept), same length and lines;
 * - `bare`: like `code` but string and template text blanked too (expressions kept);
 * - `literals`: every string and template literal with its offset and, for
 *   templates, its raw text including `${...}` and the tag before it;
 * - `imports`: every module specifier with its offset, and `typeOnly` when the
 *   import is erased at build time (`import type`, `{ type A }`, `typeof import()`).
 */
export function lex(src) {
  const code = src.split('');
  const bare = src.split('');
  const literals = [];
  const blank = (arr, from, to) => {
    for (let k = from; k < to; k++) if (arr[k] !== '\n') arr[k] = ' ';
  };
  let i = 0;

  const readString = () => {
    const quote = src[i];
    const start = i++;
    while (i < src.length && src[i] !== quote && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
    const end = Math.min(src.length, src[i] === quote ? i + 1 : i);
    i = end;
    literals.push({ kind: 'string', start, end, value: src.slice(start + 1, end - 1) });
    blank(bare, start + 1, end - 1);
  };

  const readTemplate = () => {
    const start = i;
    const tag = /([A-Za-z_$][\w$]*)\s*$/.exec(src.slice(Math.max(0, start - 40), start))?.[1];
    i++;
    let textFrom = i;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') i += 2;
      else if (src[i] === '$' && src[i + 1] === '{') {
        blank(bare, textFrom, i);
        i += 2;
        readCode(true);
        textFrom = i;
      } else i++;
    }
    blank(bare, textFrom, i);
    i = Math.min(src.length, i + 1);
    literals.push({ kind: 'template', start, end: i, value: src.slice(start + 1, i - 1), tag });
  };

  const readRegex = () => {
    i++;
    let inClass = false;
    while (i < src.length && src[i] !== '\n') {
      const c = src[i];
      if (c === '\\') i += 2;
      else if (c === '[') ((inClass = true), i++);
      else if (c === ']') ((inClass = false), i++);
      else if (c === '/' && !inClass) {
        i++;
        break;
      } else i++;
    }
    while (/[a-z]/i.test(src[i] ?? '')) i++;
  };

  const readCode = (untilBrace) => {
    let depth = 0;
    let prev = '';
    while (i < src.length) {
      const c = src[i];
      const next = src[i + 1];
      if (c === '/' && next === '/') {
        const start = i;
        while (i < src.length && src[i] !== '\n') i++;
        blank(code, start, i);
        blank(bare, start, i);
      } else if (c === '/' && next === '*') {
        const start = i;
        const close = src.indexOf('*/', i + 2);
        i = close === -1 ? src.length : close + 2;
        blank(code, start, i);
        blank(bare, start, i);
      } else if (c === "'" || c === '"') {
        readString();
        prev = 'value';
      } else if (c === '`') {
        readTemplate();
        prev = 'value';
      } else if (c === '/') {
        if (prev === '' || prev === 'keyword' || regexAfterPunct.includes(prev)) {
          readRegex();
          prev = 'value';
        } else {
          i++;
          prev = '/';
        }
      } else if (c === '{') {
        depth++;
        i++;
        prev = '{';
      } else if (c === '}') {
        i++;
        if (untilBrace && depth === 0) return;
        depth--;
        prev = '}';
      } else if (/\s/.test(c)) {
        i++;
      } else if (/[A-Za-z_$0-9]/.test(c)) {
        const start = i;
        while (i < src.length && /[\w$]/.test(src[i])) i++;
        prev = regexAfterWords.has(src.slice(start, i)) ? 'keyword' : 'value';
      } else {
        i++;
        prev = c;
      }
    }
  };

  readCode(false);
  const codeText = code.join('');
  const imports = [];
  for (const lit of literals) {
    if (lit.kind !== 'string') continue;
    const before = codeText.slice(Math.max(0, lit.start - 40), lit.start);
    if (/(?:(?:^|[^\w$.])(?:from|import)|\b(?:import|require)\s*\()\s*$/.test(before)) {
      imports.push({
        spec: lit.value,
        start: lit.start,
        typeOnly: isTypeOnly(codeText, lit.start),
      });
    }
  }
  return { code: codeText, bare: bare.join(''), literals, imports };
}

/** Whether the import whose specifier starts at `at` disappears when types are stripped. */
function isTypeOnly(code, at) {
  if (/\btypeof\s+import\s*\(\s*$/.test(code.slice(Math.max(0, at - 40), at))) return true;
  const head = code.slice(Math.max(0, at - 2000), at);
  const keyword = [...head.matchAll(/(?:^|[^\w$.])(import|export)\b/g)].at(-1);
  if (!keyword) return false;
  const statement = head.slice(keyword.index + keyword[0].length - keyword[1].length);
  if (/^(?:import|export)\s+type\b(?!\s*(?:,|from\b|=))/.test(statement)) return true;
  const named = /^(?:import|export)\s*\{([^}]*)\}\s*from\s*$/.exec(statement);
  if (!named) return false;
  const parts = named[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^type\s+/.test(part));
}

/** SQL files: comments blanked; the whole file is one literal for the text rules. */
function lexSql(src) {
  const code = src
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return { code, bare: code, literals: [], imports: [] };
}

/** Makes a violation at a character `offset` in the file (line 1 when undefined). */
export function violation(rule, file, offset, message) {
  return { rule, file: file.rel, line: offset === undefined ? 1 : file.lineAt(offset), message };
}
