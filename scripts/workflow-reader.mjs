// A small, strict reader for GitHub's gate workflow (.github/workflows/ci.yml), so its tests
// read what GitHub runs (each step's `run:` body, its `if:`, its keys) and not just lines of
// text (step 2.191). The repository has no YAML package, and the gate's tests must not need
// one, so this reads exactly the shape that file has and refuses everything else with the
// line it stopped at, rather than guessing:
//   - mappings (`key: value`, `key:` with a deeper block under it), two or more spaces deeper
//     per level, never a tab, never the same key twice;
//   - sequences (`- key: value` with the item's other keys under it, or `- scalar`);
//   - scalars: plain (true, false, null and whole numbers are read as such, the rest as
//     text), '…' and "…" without escapes, one-line flow lists like [1, 2, 3], and the
//     block `|` (kept as written, one newline at the end);
//   - comments on their own line, or after a value following a space.
// No anchors, aliases, tags, `>` blocks, `|-`/`|+`, flow mappings, several documents or
// keys that are not plain words. tests/workflow-reader.test.mjs tests it.

const keyLine = /^([A-Za-z_][A-Za-z0-9_-]*):(?: +(.*))?$/;
const blank = /^ *(#.*)?$/;

export function readWorkflow(source) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  const fail = (why) => {
    throw new Error(`workflow line ${i + 1}: ${why}: ${JSON.stringify(lines[i] ?? '')}`);
  };
  const skip = () => {
    while (i < lines.length && blank.test(lines[i])) i++;
  };
  const indentOf = (line) => {
    const at = /^ */.exec(line)[0].length;
    if (line[at] === '\t') fail('a tab in the indentation');
    return at;
  };

  // A plain, quoted or one-line flow scalar, with any comment after it removed.
  const scalar = (raw) => {
    const single = /^'((?:[^']|'')*)'(?: +#.*)? *$/.exec(raw);
    if (single) return single[1].replace(/''/g, "'");
    const double = /^"([^"\\]*)"(?: +#.*)? *$/.exec(raw);
    if (double) return double[1];
    const flow = /^\[([^[\]{}#'"]*)\](?: +#.*)? *$/.exec(raw);
    if (flow) {
      if (flow[1].trim() === '') return [];
      return flow[1].split(',').map((item) => {
        if (item.trim() === '') fail('an empty item in a flow list');
        return plain(item.trim());
      });
    }
    if (/^[[\]{}>|&*!%@`"',?#]|^- |^-$/.test(raw)) fail('a value this reader does not read');
    return plain(raw.replace(/ +#.*$/, '').trimEnd());
  };
  const plain = (text) => {
    if (/: |:$|\t/.test(text)) fail('a colon and a space inside a plain value');
    if (text === 'true') return true;
    if (text === 'false') return false;
    if (text === '' || text === 'null' || text === '~') return null;
    if (/^-?\d+$/.test(text)) return Number(text);
    return text;
  };

  // The block under `|`: every line at least as deep as its first line, kept as written.
  const literal = (parent) => {
    i++;
    const body = [];
    let depth = -1;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') {
        body.push('');
        i++;
        continue;
      }
      const at = indentOf(line);
      if (depth < 0) {
        if (at <= parent) fail('an empty | block');
        depth = at;
      }
      if (at < depth) break;
      body.push(line.slice(depth));
      i++;
    }
    if (depth < 0) fail('an empty | block');
    while (body.length > 0 && body[body.length - 1] === '') body.pop();
    return `${body.join('\n')}\n`;
  };

  // The value after `key:`, which may be a deeper block on the next lines.
  const value = (raw, indent) => {
    if (raw === '|') return literal(indent);
    if (/^[|>]/.test(raw)) fail('a block style this reader does not read');
    if (raw === '' || /^#/.test(raw)) {
      i++;
      skip();
      if (i < lines.length && indentOf(lines[i]) > indent) return node(indentOf(lines[i]));
      return null;
    }
    const read = scalar(raw);
    i++;
    return read;
  };

  const node = (indent) => {
    skip();
    const text = lines[i].slice(indent);
    return text === '-' || text.startsWith('- ') ? sequence(indent) : mapping(indent);
  };

  const mapping = (indent) => {
    const found = {};
    for (skip(); i < lines.length; skip()) {
      const at = indentOf(lines[i]);
      if (at < indent) break;
      if (at > indent) fail('a line deeper than the one before it');
      const entry = keyLine.exec(lines[i].slice(indent));
      if (!entry) fail('not a `key: value` line');
      const [, key, raw = ''] = entry;
      if (Object.hasOwn(found, key)) fail(`the key ${key} twice`);
      found[key] = value(raw.trimEnd(), indent);
    }
    return found;
  };

  const sequence = (indent) => {
    const found = [];
    for (skip(); i < lines.length; skip()) {
      const at = indentOf(lines[i]);
      if (at < indent) break;
      if (at > indent) fail('a line deeper than the one before it');
      const text = lines[i].slice(indent);
      if (!text.startsWith('- ')) {
        if (text === '-' || keyLine.test(text)) fail('a sequence item that is not `- …`');
        break;
      }
      const rest = text.slice(2);
      if (keyLine.test(rest)) {
        // `- key: value`: the item is a mapping whose keys line up after the dash.
        lines[i] = `${' '.repeat(indent + 2)}${rest}`;
        found.push(mapping(indent + 2));
      } else {
        found.push(scalar(rest));
        i++;
      }
    }
    return found;
  };

  skip();
  if (i >= lines.length) fail('an empty workflow');
  if (indentOf(lines[i]) !== 0) fail('a workflow that does not start at the left edge');
  if (/^---/.test(lines[i])) fail('a document marker');
  const workflow = mapping(0);
  skip();
  if (i < lines.length) fail('a line this reader does not read');
  return workflow;
}
