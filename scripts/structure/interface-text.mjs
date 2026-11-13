// T-187: all interface text lives in message files, never inside components. A
// component (.tsx outside tests) that holds words of its own fails: words between
// tags (`<p>Save</p>`), a string expression between tags (`<p>{'Save'}</p>`), or
// words in an attribute people read or hear (aria-label, title, alt, placeholder,
// label). Component text comes from `t('key')` instead. Comments do not count.
import { isTestFile, violation } from './source.mjs';

export const rule = 'T-187';
export const title = 'no interface text inside components';

const hasWords = /\p{L}/u;
/** A message key such as `page.inbox` (passed to a component that calls t) is not words. */
const messageKey = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+$/;

export function check(repo) {
  const out = [];
  const fix = 'Put the words in the message file (packages/site) and use t(key) here.';
  for (const file of repo.files) {
    if (file.ext !== '.tsx' || isTestFile(file.rel) || repo.isLegacy(file.rel)) continue;
    const { code } = file.lexed;

    // Words between a closing `>` and the next `<` of a tag. Not `=>`, not `->`, and the
    // `<` must open a tag (`<a`, `</a`, `<>`), which keeps comparisons and generics out.
    for (const match of code.matchAll(/(?<![=-])>([^<>{}]*)(?=<[A-Za-z/>])/g)) {
      const text = match[1];
      if (!hasWords.test(text) || /[;()]/.test(text)) continue;
      out.push(
        violation(
          rule,
          file,
          match.index + 1,
          `has the interface text "${text.trim()}" in a component. ${fix}`,
        ),
      );
    }

    // A string written as an expression between tags: {'Save'}.
    for (const match of code.matchAll(/>\s*\{\s*(['"`])((?:(?!\1).)*)\1\s*\}\s*(?=<)/gs)) {
      if (!hasWords.test(match[2])) continue;
      out.push(
        violation(
          rule,
          file,
          match.index,
          `has the interface text "${match[2]}" in a component. ${fix}`,
        ),
      );
    }

    // Attributes read aloud or shown on hover, with a string of their own.
    const attribute =
      /\s(aria-label|aria-description|title|alt|placeholder|label)\s*=\s*(?:"([^"]*)"|\{\s*'([^']*)'\s*\})/g;
    for (const match of code.matchAll(attribute)) {
      const text = match[2] ?? match[3] ?? '';
      if (!hasWords.test(text) || messageKey.test(text)) continue;
      out.push(
        violation(
          rule,
          file,
          match.index,
          `has the interface text "${text}" in the ${match[1]} attribute of a component. ${fix}`,
        ),
      );
    }
  }
  return out;
}
