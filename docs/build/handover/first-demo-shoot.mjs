// Pictures of the first Al-Hadi concept demo (static files, fictional data, no network),
// served from the repository's examples folder to this computer only.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = process.argv[2];
const site = path.join(repo, 'examples/alhadi-school');
const { chromium } = createRequire(path.join(repo, 'package.json'))('playwright');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};
const server = http.createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  const file = path.resolve(site, '.' + (name === '/' ? '/index.html' : name));
  if (
    !file.startsWith(site + path.sep) ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.writeHead(200, {
    'content-type': types[path.extname(file)] ?? 'application/octet-stream',
  });
  response.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge' });
try {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    for (const route of ['home', 'schedule', 'standings', 'teams', 'stats', 'admin']) {
      if (width === 390 && !['home', 'standings'].includes(route)) continue;
      await page.goto(`${origin}/#${route}`, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      const file = path.join(here, `${width}-${route}.jpg`);
      await page.screenshot({ path: file, fullPage: true, type: 'jpeg', quality: 80 });
      console.log(path.basename(file));
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
