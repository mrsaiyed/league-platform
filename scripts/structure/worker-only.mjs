// T-226: some steps belong to the worker's jobs and to nothing else. They are not
// commands, so no permission check stands in front of them: what keeps a request
// from reaching them is that only the worker calls them. Outside the worker, the
// module that defines a step and tests, naming one fails. Comments and strings do
// not count.
import { isCodeFile, isTestFile, violation } from './source.mjs';

export const rule = 'T-226';
export const title = 'worker-only steps used only by the worker';

export function check(repo) {
  const out = [];
  for (const { name, allowedIn, why } of repo.config.workerOnlySteps) {
    const pattern = new RegExp(`\\b${name}\\b`, 'g');
    for (const file of repo.files) {
      if (!isCodeFile(file.rel) || isTestFile(file.rel)) continue;
      if (allowedIn.some((place) => file.rel.startsWith(place))) continue;
      for (const match of file.lexed.bare.matchAll(pattern)) {
        out.push(
          violation(
            rule,
            file,
            match.index,
            `uses ${name}, which only the worker may call (${why}). Call it from a job in ` +
              `${allowedIn[0]}.`,
          ),
        );
      }
    }
  }
  return out;
}
