// T-21: dependencies point one way. contracts ← sports ← core ← database,
// providers; contracts, ui ← site, emails; the apps wire everything together.
// Also the T2 §2 table: core has no React and no vendor libraries.
import { isCodeFile, isTestFile, libraryIn, violation } from './source.mjs';

export const rule = 'T-21';
export const title = 'imports only in allowed directions';

const short = (dir) => dir.replace(/^(packages|apps)\//, '');

export function check(repo) {
  const { allowedDependencies, allowedLibraries, testLibraries, noJsxWorkspaces } = repo.config;
  const out = [];
  for (const file of repo.files) {
    if (!isCodeFile(file.rel)) continue;
    const from = repo.workspaceOf(file.rel);
    if (!from) continue;
    const allowed = allowedDependencies[from.dir];
    if (!allowed) {
      out.push(
        violation(
          rule,
          file,
          undefined,
          `workspace ${from.dir} has no row in the dependency table. Add it to allowedDependencies ` +
            `in scripts/structure/config.mjs, following T2 §2.`,
        ),
      );
      continue;
    }
    if (noJsxWorkspaces.includes(from.dir) && /\.[jt]sx$/.test(file.rel)) {
      out.push(
        violation(
          rule,
          file,
          undefined,
          `${short(from.dir)} has no React: JSX files belong in ui, site or the apps.`,
        ),
      );
    }
    const libraries = allowedLibraries[from.dir];
    for (const imp of file.lexed.imports) {
      const target = repo.resolve(file, imp.spec);
      if (target.kind === 'file' && (target.outside || !target.workspace)) {
        out.push(
          violation(
            rule,
            file,
            imp.start,
            `'${imp.spec}' points outside the workspaces (${target.rel}). Shared code belongs in a package.`,
          ),
        );
        continue;
      }
      const to = target.workspace;
      if (to) {
        if (to.dir === from.dir) continue;
        const ok =
          from.dir.startsWith('apps/') && to.dir.startsWith('apps/')
            ? false
            : allowed.includes('*') || allowed.includes(to.dir);
        if (!ok) {
          const may = allowed.includes('*')
            ? 'any package, but never another app'
            : allowed.length
              ? allowed.map(short).join(', ')
              : 'no other workspace';
          out.push(
            violation(
              rule,
              file,
              imp.start,
              `${short(from.dir)} may not import ${short(to.dir)} ('${imp.spec}'). ${short(from.dir)} may ` +
                `import: ${may}. If ${short(from.dir)} needs something from ${short(to.dir)}, declare an ` +
                `interface for it where it is needed and let the apps plug it in (T-21).`,
            ),
          );
        }
        continue;
      }
      if (!libraries) continue;
      const test = isTestFile(file.rel);
      if (target.kind === 'builtin') {
        if (test) continue;
        out.push(
          violation(
            rule,
            file,
            imp.start,
            `${short(from.dir)} may not use the Node built-in '${imp.spec}'. Clocks, ids, files and ` +
              `network come in through the module's ports.`,
          ),
        );
      } else if (
        !libraryIn(libraries, target.name) &&
        !(test && libraryIn(testLibraries, target.name))
      ) {
        out.push(
          violation(
            rule,
            file,
            imp.start,
            `${short(from.dir)} may not use the library '${target.name}'. Allowed: ` +
              `${libraries.length ? libraries.join(', ') : 'none'}. Vendor code goes in providers (T2 §2).`,
          ),
        );
      }
    }
  }
  return out;
}
