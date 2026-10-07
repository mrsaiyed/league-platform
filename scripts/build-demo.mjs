import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'examples/alhadi-school');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const output = path.join(root, 'dist');
// The output location is fixed; refuse symlinks or paths outside this repository.
if (path.dirname(output) !== root || path.basename(output) !== 'dist') {
  throw new Error('Unsafe output directory');
}
if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink()) {
  throw new Error('Output must not be a symbolic link');
}
fs.mkdirSync(path.join(output, 'demo'), { recursive: true });
const files = [
  'index.html',
  ...Object.values(manifest.modules),
  ...manifest.styles,
  ...manifest.assets,
];
for (const file of files) {
  const from = path.resolve(source, file);
  if (!from.startsWith(source + path.sep)) throw new Error('Manifest path outside example');
  const to = path.join(output, 'demo', file);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

// Native ES modules + an import map provide the same module graph without a bundler.
// The portable version embeds those exact modules and assets as data URLs.
const assetMap = Object.fromEntries(
  manifest.assets.map((file) => [
    file,
    'data:image/png;base64,' + fs.readFileSync(path.join(source, file)).toString('base64'),
  ]),
);
const embedAssets = (text) => {
  for (const [file, value] of Object.entries(assetMap)) {
    text = text.replaceAll('../' + file, value).replaceAll(file, value);
  }
  return text;
};
const imports = Object.fromEntries(
  Object.entries(manifest.modules).map(([name, file]) => [
    '@demo/' + name,
    'data:text/javascript;base64,' +
      Buffer.from(embedAssets(fs.readFileSync(path.join(source, file), 'utf8'))).toString('base64'),
  ]),
);
let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
html = html.replace(/<link\s+rel="stylesheet"\s+href="[^"]+"\s*\/?\s*>/g, '');
html = html.replace(
  '</head>',
  '<style>' +
    embedAssets(
      manifest.styles.map((file) => fs.readFileSync(path.join(source, file), 'utf8')).join('\n'),
    ) +
    '</style></head>',
);
html = html.replace(
  /<script type="importmap">[\s\S]*?<\/script>/,
  '<script type="importmap">' + JSON.stringify({ imports }) + '</script>',
);
html = embedAssets(html);
fs.writeFileSync(path.join(output, 'Al-Hadi League Demo.html'), html);
console.log(
  'Built dist/demo for static hosting and dist/Al-Hadi League Demo.html for offline sharing.',
);
