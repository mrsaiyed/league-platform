// T-187: all interface text lives in message files, never inside components. A
// component (.tsx outside tests) that holds words of its own fails:
//   - words between tags, also next to an expression (`<p>Hello {name}</p>`), with any
//     punctuation, and words that look like a web address (`<a>see https://x.org</a>`);
//   - a string inside an expression between tags: `{'Save'}`, `{ok ? 'Yes' : 'No'}`,
//     `{ready && 'Ready'}`, or a template with words (`{`Hello ${name}`}`);
//   - a string in an attribute people read or hear (aria-label, title, alt, placeholder,
//     label, heading, description, text, caption, tooltip, aria-roledescription,
//     aria-valuetext, and `value` on a button), written "..." or '...' or {'...'} or
//     {`...`} or as a ternary.
// Metadata objects in the web app's .ts and .tsx files (title, description, ...) count too.
// Component text comes from `t('key')` instead. Comments, `t(...)` calls, type
// annotations, comparison operators and message keys do not count.
//
// The scan reads JSX with a small hand-written parser (no outside parser, like the rest of
// the structure checks): it walks the file as code, and where `<` opens an element it
// reads that element's attributes and children.
import { isTestFile, violation } from './source.mjs';

export const rule = 'T-187';
export const title = 'no interface text inside components';

const hasWords = /\p{L}/u;
/** A message key such as `page.inbox` (passed to a component that calls t) is not words. */
const messageKey = /^[a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+$/;
const textProps = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'title',
  'alt',
  'placeholder',
  'label',
  'heading',
  'description',
  'text',
  'caption',
  'tooltip',
]);
const keywordsBeforeValue = new Set([
  'return',
  'default',
  'yield',
  'await',
  'case',
  'else',
  'in',
  'of',
  'typeof',
  'void',
  'throw',
  'new',
  'delete',
  'do',
]);
const buttonTypes = new Set(['button', 'submit', 'reset']);

/** Words in a piece of text, ignoring HTML entities (`&nbsp;`) and `${...}` holes. */
function wordsIn(text) {
  return hasWords.test(text.replace(/&#?\w+;/g, ' '));
}
const isWordChar = (c) => c !== undefined && /[\w$]/.test(c);

export function check(repo) {
  const out = [];
  const fix = 'Put the words in the message file (packages/site) and use t(key) here.';
  for (const file of repo.files) {
    if (isTestFile(file.rel) || repo.isLegacy(file.rel)) continue;
    if (file.ext === '.tsx') {
      for (const hit of scanJsx(file.text)) {
        const where = hit.attribute
          ? `in the ${hit.attribute} attribute of a component`
          : 'in a component';
        out.push(
          violation(
            rule,
            file,
            hit.offset,
            `has the interface text "${hit.text}" ${where}. ${fix}`,
          ),
        );
      }
    }
    if ((file.ext === '.ts' || file.ext === '.tsx') && file.rel.startsWith('apps/web/')) {
      for (const hit of scanMetadata(file.text)) {
        out.push(
          violation(
            rule,
            file,
            hit.offset,
            `has the interface text "${hit.text}" in the ${hit.key} of its page metadata. ${fix}`,
          ),
        );
      }
    }
  }
  return out;
}

/** Page metadata (`export const metadata = {...}` / `generateMetadata`) with words of its own. */
export function scanMetadata(text) {
  const hits = [];
  const start = /\b(?:metadata\s*(?::[^=]+)?=|generateMetadata\s*\()/g;
  for (const m of text.matchAll(start)) {
    const open = text.indexOf('{', m.index);
    if (open === -1) continue;
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {
      if (text[end] === '{') depth++;
      else if (text[end] === '}' && --depth === 0) break;
    }
    const body = text.slice(open, end);
    const entry =
      /\b(title|description|siteName|alt|default|template|absolute)\s*:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
    for (const e of body.matchAll(entry)) {
      const value = (e[2] ?? e[3] ?? e[4] ?? '').replace(/\$\{[^}]*\}/g, '');
      if (!wordsIn(value) || messageKey.test(value)) continue;
      hits.push({ offset: open + e.index, key: e[1], text: value });
    }
  }
  return hits;
}

/** Every piece of interface text written inside the JSX of one .tsx file. */
export function scanJsx(src) {
  const hits = [];
  const n = src.length;

  const note = (offset, text, attribute) => hits.push({ offset, text: text.trim(), attribute });

  /** Skips a quoted string from `i` (at the quote); returns the index after it. */
  function skipString(i) {
    const q = src[i];
    let j = i + 1;
    while (j < n && src[j] !== q && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
    return Math.min(n, j + 1);
  }

  /** Reads a template from `i` (at the backtick): its words with `${...}` removed, and the end. */
  function readTemplate(i) {
    let j = i + 1;
    let text = '';
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') {
        j += 2;
      } else if (src[j] === '$' && src[j + 1] === '{') {
        j = scan(j + 2, '}', false, undefined);
        text += ' ';
      } else text += src[j++];
    }
    return { text, end: Math.min(n, j + 1) };
  }

  function skipRegex(i) {
    let j = i + 1;
    let inClass = false;
    while (j < n && src[j] !== '\n') {
      const c = src[j];
      if (c === '\\') j += 2;
      else if (c === '[') ((inClass = true), j++);
      else if (c === ']') ((inClass = false), j++);
      else if (c === '/' && !inClass) {
        j++;
        break;
      } else j++;
    }
    while (/[a-z]/i.test(src[j] ?? '')) j++;
    return j;
  }

  /**
   * Walks code from `i` until the `close` bracket that ends it (or the end of the file
   * when `close` is null). With `flag`, a string that stands where a value is shown
   * (the whole expression, either side of `?:`, after `&&`, `||` or `??`) is reported
   * through `report`. Elements met on the way are read in full, whatever `flag` is.
   * Returns the index after the closing bracket.
   */
  function scan(i, close, flag, report) {
    // Brackets opened inside: group parentheses, call parentheses, data (objects, arrays).
    const frames = [{ kind: 'root', ternary: 0 }];
    let prev = 'start';
    const top = () => frames[frames.length - 1];
    const showsValue = () => {
      const f = top();
      if (!flag || (f.kind !== 'root' && f.kind !== 'group')) return false;
      return prev === 'start' || prev === '?' || prev === '&&' || prev === '||' || prev === '??';
    };
    const valueEnds = () => {
      let k = i;
      while (k < n && /\s/.test(src[k])) k++;
      const c = src[k];
      // A string being compared or used (`'a' === b`, `'a'.length`) is not shown as it is.
      return (
        c === '=' || c === '!' || c === '.' || c === '[' || c === '(' || c === '<' || c === '>'
      );
    };
    while (i < n) {
      const c = src[i];
      const next = src[i + 1];
      if (/\s/.test(c)) {
        i++;
      } else if (c === '/' && next === '/') {
        while (i < n && src[i] !== '\n') i++;
      } else if (c === '/' && next === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end === -1 ? n : end + 2;
      } else if (c === '"' || c === "'") {
        const end = skipString(i);
        const text = src.slice(i + 1, end - 1);
        const shown = showsValue();
        i = end;
        if (shown && !valueEnds() && wordsIn(text) && !messageKey.test(text)) {
          report?.(i - text.length - 2, text);
        }
        prev = 'value';
      } else if (c === '`') {
        const start = i;
        const { text, end } = readTemplate(i);
        const shown = showsValue();
        i = end;
        if (shown && !valueEnds() && wordsIn(text) && !messageKey.test(text)) report?.(start, text);
        prev = 'value';
      } else if (c === '<' && jsxMayStart(prev) && /[A-Za-z>]/.test(next ?? '')) {
        const end = parseElement(i);
        if (end > i) {
          i = end;
          prev = 'value';
        } else {
          i++;
          prev = '<';
        }
      } else if (c === '/') {
        if (prev === 'start' || (prev !== 'value' && prev !== ')' && prev !== ']')) {
          i = skipRegex(i);
          prev = 'value';
        } else {
          i++;
          prev = '/';
        }
      } else if (c === '(' || c === '[' || c === '{') {
        const callish = c === '(' && (prev === 'value' || prev === ')' || prev === ']');
        frames.push({ kind: c === '(' ? (callish ? 'call' : 'group') : 'data', ternary: 0 });
        i++;
        prev = 'start';
      } else if (c === ')' || c === ']' || c === '}') {
        i++;
        if (frames.length === 1) {
          if (close === c) return i;
          prev = c;
          continue;
        }
        frames.pop();
        prev = c === '}' ? 'value' : c;
      } else if (c === '=' && next === '>') {
        i += 2;
        prev = '=>';
      } else if ((c === '&' && next === '&') || (c === '|' && next === '|')) {
        i += 2;
        prev = c + c;
      } else if (c === '?') {
        if (next === '?') {
          i += 2;
          prev = '??';
        } else if (next === '.' && !/\d/.test(src[i + 2] ?? '')) {
          i += 2;
          prev = 'value';
        } else {
          if (next !== ':') top().ternary++;
          i++;
          prev = next === ':' ? 'op' : '?';
        }
      } else if (c === ':') {
        i++;
        if (top().ternary > 0) {
          top().ternary--;
          prev = '?';
        } else prev = ':';
      } else if (isWordChar(c)) {
        const start = i;
        while (i < n && isWordChar(src[i])) i++;
        prev = keywordsBeforeValue.has(src.slice(start, i)) ? 'keyword' : 'value';
      } else {
        i++;
        prev = c === '>' || c === ',' || c === ';' || c === '!' ? c : 'op';
      }
    }
    return n;
  }

  /** Whether a `<` after this token opens an element rather than a generic or comparison. */
  function jsxMayStart(prev) {
    return prev !== 'value' && prev !== ')' && prev !== ']' && prev !== '<' && prev !== '>';
  }

  /** Reads one element at `i` (at `<`), reporting its text; returns the index after it, or `i` if it is not one. */
  function parseElement(i) {
    let j = i + 1;
    let tag = '';
    if (src[j] !== '>') {
      const name = /^[A-Za-z][\w.:-]*/.exec(src.slice(j, j + 80));
      if (!name) return i;
      tag = name[0];
      j += tag.length;
      if (!/[\s/>]/.test(src[j] ?? '')) return i;
    }
    const attrs = [];
    let selfClosed = false;
    // Attributes, up to `>` or `/>`.
    while (j < n) {
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '/' && src[j + 1] === '>') {
        j += 2;
        selfClosed = true;
        break;
      }
      if (src[j] === '>') {
        j++;
        break;
      }
      if (src[j] === '/' && src[j + 1] === '/') {
        while (j < n && src[j] !== '\n') j++;
        continue;
      }
      if (src[j] === '/' && src[j + 1] === '*') {
        const end = src.indexOf('*/', j + 2);
        j = end === -1 ? n : end + 2;
        continue;
      }
      if (src[j] === '{') {
        j = scan(j + 1, '}', false, undefined);
        continue;
      }
      const attr = /^[\w:.-]+/.exec(src.slice(j, j + 80));
      if (!attr) return i;
      const name = attr[0];
      const at = j;
      j += name.length;
      let probe = j;
      while (probe < n && /\s/.test(src[probe])) probe++;
      if (src[probe] !== '=') {
        attrs.push({ name, at, values: [], plain: true });
        continue;
      }
      j = probe + 1;
      while (j < n && /\s/.test(src[j])) j++;
      const entry = { name, at, values: [], plain: false };
      attrs.push(entry);
      if (src[j] === '"' || src[j] === "'") {
        const q = src[j];
        const end = src.indexOf(q, j + 1);
        if (end === -1) return i;
        entry.plain = true;
        entry.values.push({ offset: j + 1, text: src.slice(j + 1, end) });
        j = end + 1;
      } else if (src[j] === '{') {
        const watched = textProps.has(name) || name === 'value';
        j = scan(j + 1, '}', watched, (offset, text) => entry.values.push({ offset, text }));
      } else if (src[j] === '<') {
        const end = parseElement(j);
        if (end === j) return i;
        j = end;
      } else return i;
    }
    // Which attributes carry words people read.
    const inputType = attrs.find((a) => a.name === 'type')?.values[0]?.text;
    const isButton = tag === 'button' || (tag === 'input' && buttonTypes.has(inputType));
    for (const a of attrs) {
      if (!(textProps.has(a.name) || (a.name === 'value' && isButton))) continue;
      for (const v of a.values) {
        if (wordsIn(v.text) && !messageKey.test(v.text.trim())) note(v.offset, v.text, a.name);
      }
    }
    return selfClosed ? j : parseChildren(j);
  }

  /** Children from `i` to the closing tag; returns the index after the closing tag. */
  function parseChildren(i) {
    let j = i;
    let textStart = j;
    const flushText = (end) => {
      const text = src.slice(textStart, end);
      if (wordsIn(text)) note(textStart + text.search(/\S/), text, undefined);
    };
    while (j < n) {
      const c = src[j];
      if (c === '<') {
        if (src[j + 1] === '/') {
          flushText(j);
          const end = src.indexOf('>', j);
          return end === -1 ? n : end + 1;
        }
        if (/[A-Za-z>]/.test(src[j + 1] ?? '')) {
          const end = parseElement(j);
          if (end > j) {
            flushText(j);
            j = end;
            textStart = j;
            continue;
          }
        }
        j++;
      } else if (c === '{') {
        flushText(j);
        j = scan(j + 1, '}', true, (offset, text) => note(offset, text, undefined));
        textStart = j;
      } else j++;
    }
    return n;
  }

  scan(0, null, false, undefined);
  return hits;
}
