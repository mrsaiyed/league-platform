// T-22: a module is used only through its index.ts. Across workspaces that means
// importing a package by its name and nothing deeper; inside core it means one
// module never reaches into another module's files.
import { isCodeFile, violation } from './source.mjs';

export const rule = 'T-22';
export const title = 'modules used only through their index.ts';

export function check(repo) {
  const out = [];
  for (const workspace of repo.workspaces) {
    const exports = workspace.exports;
    if (exports && typeof exports === 'object' && !Array.isArray(exports)) {
      // Keys that start with '.' are subpaths; others ('import', 'types') are conditions of '.'.
      const extra = Object.keys(exports).filter((key) => key.startsWith('.') && key !== '.');
      const file = repo.file(workspace.dir + '/package.json');
      if (extra.length && file) {
        out.push(
          violation(
            rule,
            file,
            undefined,
            `${workspace.name} exports ${extra.join(', ')} beside '.'. A package is used only through ` +
              `its index.ts, so export only '.'.`,
          ),
        );
      }
    }
  }

  for (const file of repo.files) {
    if (!isCodeFile(file.rel) || repo.isLegacy(file.rel)) continue;
    const from = repo.workspaceOf(file.rel);
    if (!from) continue;
    for (const imp of file.lexed.imports) {
      const target = repo.resolve(file, imp.spec);
      if (target.kind === 'workspace') {
        if (target.subpath) {
          out.push(
            violation(
              rule,
              file,
              imp.start,
              `'${imp.spec}' reaches inside ${target.name}. Import '${target.name}' and add what you ` +
                `need to its index.ts.`,
            ),
          );
        } else if (!target.workspace.hasIndex) {
          out.push(
            violation(
              rule,
              file,
              imp.start,
              `'${imp.spec}' has no entry file: ${target.workspace.dir} needs an index.ts (and, if ` +
                `its package.json has "exports", "." pointing at it) that exports what others may use.`,
            ),
          );
        }
        continue;
      }
      if (target.kind !== 'file' || !target.workspace) continue;
      if (target.workspace.dir !== from.dir) {
        const name = target.workspace.name ?? target.workspace.dir;
        out.push(
          violation(
            rule,
            file,
            imp.start,
            `'${imp.spec}' reaches into ${target.workspace.dir} by path. Import '${name}' (its index.ts) instead.`,
          ),
        );
        continue;
      }
      const into = moduleOf(repo, target.rel);
      if (into && into.dir !== moduleOf(repo, file.rel)?.dir && !into.isIndex) {
        out.push(
          violation(
            rule,
            file,
            imp.start,
            `'${imp.spec}' reaches into the ${into.name} module's internal file ${target.rel}. ` +
              `Use only ${into.dir}/index.ts, adding what you need to it.`,
          ),
        );
      }
    }
  }
  return out;
}

/** The module a file belongs to, if it is under one of the module roots. */
function moduleOf(repo, rel) {
  for (const root of repo.config.moduleRoots) {
    if (!rel.startsWith(root + '/')) continue;
    const [name, ...rest] = rel.slice(root.length + 1).split('/');
    if (!rest.length) return undefined;
    return {
      name,
      dir: `${root}/${name}`,
      isIndex: rest.length === 1 && /^index\.[cm]?[jt]sx?$/.test(rest[0]),
    };
  }
  return undefined;
}
