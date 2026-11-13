// Automatic pickup for the two-league harness (T-65): every function exported from
// a scanned file must have an isolation case, or be on a reviewed list of
// functions that reach no league data, so a new query cannot skip the harness.
// Coverage is by the function itself, so two functions with one name, or one
// function exported under two names, are each judged on what they are.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Each scanned source file (by path from the root) and what it exports. */
export type ScannedModules = Map<string, Record<string, unknown>>;

/** An exported function: where it is (`file: name`, `file: object.method`) and itself. */
export type ExportedFunction = { where: string; value: unknown };

const isSource = (file: string) => file.endsWith('.ts') && !/\.(test|test-helper)\.ts$/.test(file);

/** Source files under each entry (a file, or a folder searched all the way down). */
function sourceFiles(root: string, entry: string): string[] {
  const full = path.join(root, entry);
  if (!statSync(full).isDirectory()) return [entry];
  return readdirSync(full, { recursive: true, encoding: 'utf8' })
    .map((file) => path.join(entry, file))
    .filter((file) => isSource(file) && statSync(path.join(root, file)).isFile());
}

/** Imports every source file of the entries, keyed by its path from `root`. */
export async function scanModules(root: string, entries: string[]): Promise<ScannedModules> {
  const modules: ScannedModules = new Map();
  for (const file of entries.flatMap((entry) => sourceFiles(root, entry)).sort()) {
    const exports: Record<string, unknown> = await import(
      pathToFileURL(path.join(root, file)).href
    );
    modules.set(file.split(path.sep).join('/'), exports);
  }
  return modules;
}

/** Every exported function, and every function held by an exported plain object. */
export function exportedFunctions(modules: ScannedModules): ExportedFunction[] {
  const found: ExportedFunction[] = [];
  for (const [file, exports] of modules) {
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value === 'function') found.push({ where: `${file}: ${name}`, value });
      else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const [key, inner] of Object.entries(value)) {
          if (typeof inner === 'function')
            found.push({ where: `${file}: ${name}.${key}`, value: inner });
        }
      }
    }
  }
  return found;
}

/** Where each exported function is that `covered` (cases and reviewed reasons) lacks. */
export function uncoveredFunctions(
  functions: readonly ExportedFunction[],
  covered: ReadonlySet<unknown>,
): string[] {
  return functions.filter((f) => !covered.has(f.value)).map((f) => f.where);
}
