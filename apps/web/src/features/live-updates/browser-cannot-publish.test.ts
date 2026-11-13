// T-120: only our server can publish. Browser code gets subscribers, which can only
// listen, and cannot load a publisher at all: publishers live in the server-only
// providers package, and the structure check (T-30) fails any browser file that
// imports it. Proven here on a throwaway copy of the repository's layout.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { serverSentEventsSubscriber } from './index.ts';

type Violation = { file: string; rule: string; message: string };
type StructureCheck = { checkStructure: (root: string) => { violations: Violation[] } };

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../..');
const featureDir = 'apps/web/src/features/live-updates';

async function loadCheck(): Promise<StructureCheck> {
  // By address, so the type check does not look for a declaration of the script.
  const address = pathToFileURL(path.join(repoRoot, 'scripts/structure/index.mjs')).href;
  return (await import(address)) as StructureCheck;
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

/** Every workspace as in the repository, these subscribers as they are, and `files`. */
function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'live-publish-check-'));
  roots.push(root);
  const write = (rel: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    workspaces: string[];
  };
  write('package.json', JSON.stringify({ name: 'fixture', workspaces: rootPackage.workspaces }));
  for (const dir of rootPackage.workspaces) {
    const { name } = JSON.parse(
      fs.readFileSync(path.join(repoRoot, dir, 'package.json'), 'utf8'),
    ) as { name: string };
    write(`${dir}/package.json`, JSON.stringify({ name, exports: { '.': './index.ts' } }));
    write(`${dir}/index.ts`, 'export {};\n');
  }
  for (const file of fs.readdirSync(path.join(repoRoot, featureDir))) {
    if (!file.endsWith('.ts') || /\.test(-helper)?\.ts$/.test(file)) continue;
    write(`${featureDir}/${file}`, fs.readFileSync(path.join(repoRoot, featureDir, file), 'utf8'));
  }
  for (const [rel, text] of Object.entries(files)) write(rel, text);
  return root;
}

describe('only our server can publish', () => {
  it('gives the browser subscribers that can only listen', () => {
    const subscriber = serverSentEventsSubscriber({ address: '/api/v1/live' });
    expect(Object.keys(subscriber).sort()).toEqual(['subscribeGame', 'subscribeLeagueScores']);
  });

  it('lets a page load the subscribers, and fails any page that loads a publisher', async () => {
    const { checkStructure } = await loadCheck();
    const root = fixture({
      'apps/web/src/app/watch/page.tsx':
        "'use client';\nimport { serverSentEventsSubscriber } from '../../features/live-updates/index.ts';\n" +
        'export const s = serverSentEventsSubscriber;\n',
      'apps/web/src/app/rogue/page.tsx':
        "'use client';\nimport { createLocalLiveHub } from '@srleagues/providers';\n" +
        'export const h = createLocalLiveHub;\n',
      'apps/web/src/app/rogue/helper.ts':
        "import { supabaseRealtimePublisher } from '@srleagues/providers';\n" +
        'export const p = supabaseRealtimePublisher;\n',
      'apps/web/src/app/rogue/score.tsx':
        "'use client';\nimport { p } from './helper.ts';\nexport const q = p;\n",
      // On the server, publishing is what is meant to happen.
      'apps/web/src/server/publish.ts':
        "import { createLocalLiveHub } from '@srleagues/providers';\nexport const hub = createLocalLiveHub;\n",
    });
    const found = checkStructure(root).violations.map((v) => `${v.file} [${v.rule}]`);
    expect(found.sort()).toEqual([
      'apps/web/src/app/rogue/helper.ts [T-30]',
      'apps/web/src/app/rogue/page.tsx [T-30]',
    ]);
  });
});
