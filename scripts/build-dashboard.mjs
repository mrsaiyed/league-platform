// Builds docs/build/dashboard.html: a page the founder opens to see where the build is.
// It reads the stage plans, STATUS.md, the build lock, the build order and git, and writes
// one self-contained file. Every build run calls this after it updates STATUS.md.
// The page's styles and script are in scripts/dashboard/ and are inlined here.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const buildDir = path.join(root, 'docs/build');
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout ?? '';
const plain = (text) => text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '');

const status = read(path.join(buildDir, 'STATUS.md'));
const field = (label) =>
  plain(status.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.*)`))?.[1] ?? '');
const section = (title) =>
  status.split(new RegExp(`^## ${title}\\s*$`, 'm'))[1]?.split(/^## /m)[0] ?? '';
const log = [...section('Log').matchAll(/^- (\d{4}-\d\d-\d\d) — (.*)$/gm)].map((m) => ({
  date: m[1],
  text: plain(m[2]),
}));
const needs = [...section('Needs the founder').matchAll(/^- \[( |x)\] (.*)$/gm)].map((m) => ({
  done: m[1] === 'x',
  text: plain(m[2]),
}));
// One line per open lane: "- **1.12 Access** — folder — reserved numbers — what is left".
const lanes = [...section('In progress').matchAll(/^- \*\*(\d+\.\d+)([^*]*)\*\* — (.*)$/gm)].map(
  (m) => ({
    id: m[1],
    label: plain(m[2]).trim(),
    text: plain(m[3]),
  }),
);
const open = new Set(lanes.map((lane) => lane.id));
const nextStep = field('Next step').match(/^(\d+\.\d+)/)?.[1] ?? '';
const currentStage = Number(field('Stage').match(/^(\d+)/)?.[1] ?? 0);

// Which kind of job a step is, worked out from its title. The first rule that fits wins.
// A step line can also say so itself with "Job: <name>" among its notes.
const jobRules = [
  ['inspector', /\breview/i],
  ['groundwork', /workspace|typescript|^records?$|^seed|settings and secrets/i],
  ['pages', /\bscreens?\b/i],
  ['database', /\btables\b|migration/i],
  [
    'security',
    /sign-in|security|\baccess\b|permission|session|two-league|fence|secret|scorekeeper|staff-only|signed-in/i,
  ],
  ['checks', /\btests?\b|\bCI\b|\bchecks?\b|harness/i],
  ['tracker', /track|\blive\b|scoring|clock|\bplays\b|lineup|catch up with main|offline|engine/i],
  ['services', /worker|queue|email|adapter|logging|error|updates service|cache|endpoint/i],
  ['database', /migration|\btables\b|quer|database|transfer|import|reader|export|\bbin\b/i],
  ['pages', /page|shell|web app|design|message|address|grid|display|notice|preview|area\b/i],
];
const jobNames = new Set([...jobRules.map(([name]) => name), 'rules']);
const jobOf = (title, meta) => {
  const named = meta.match(/Job: (\w+)/)?.[1];
  if (named && jobNames.has(named)) return named;
  return jobRules.find(([, pattern]) => pattern.test(title))?.[0] ?? 'rules';
};

const stagePlans = fs
  .readdirSync(buildDir)
  .filter((name) => /^STAGE-\d+\.md$/.test(name))
  .map((name) => {
    const number = Number(name.match(/\d+/)[0]);
    const groups = [];
    const planText = read(path.join(buildDir, name));
    // Older plans keep "what each step needs" in a table instead of on the step's line.
    const tableNeeds = Object.fromEntries(
      [...planText.matchAll(/^\| (\d+\.\d+) [^|]*\|([^|]*)\|/gm)].map((m) => [
        m[1],
        plain(m[2]).trim(),
      ]),
    );
    for (const line of planText.split(/\r?\n/)) {
      const heading = line.match(/^### ([A-Z])\. (.*)$/);
      if (heading) groups.push({ letter: heading[1], name: plain(heading[2]), steps: [] });
      const step = line.match(/^- \[( |x)\] \*\*(\d+\.\d+) (.*?)\.\*\* (.*)$/);
      if (!step || !groups.length) continue;
      const [body, meta = ''] = step[4].split(/ _(?=Spec:|Done test:|Model:|Needs:)/);
      const note = log.find((entry) => entry.text.startsWith(`Step ${step[2]} done`));
      const part = (label) =>
        plain(
          meta.match(
            new RegExp(
              `${label}: (.*?)\\.(?: Spec:| Needs:| Migration:| Folders:| Done test:| Model:| Job:|$)`,
            ),
          )?.[1] ?? '',
        );
      groups.at(-1).steps.push({
        id: step[2],
        name: plain(step[3]),
        text: plain(body),
        job: jobOf(step[3], meta),
        model: plain(meta.match(/Model: ([^_]*)/)?.[1] ?? '').replace(/\.$/, ''),
        spec: part('Spec'),
        test: part('Done test'),
        needs: part('Needs') || tableNeeds[step[2]] || '',
        blocked: /Blocked on founder/i.test(body),
        state:
          step[1] === 'x' || note
            ? 'done'
            : open.has(step[2]) || (!open.size && step[2] === nextStep)
              ? 'now'
              : 'todo',
        note: note ? note.text.replace(/^Step [\d.]+ done:?\s*/, '') : '',
      });
    }
    return { number, groups };
  });

// ---------- which steps could start right now ----------
// A step can start when every step it needs has landed, it is not already in a lane, and it
// is not waiting on the founder. Steps built in parts are judged part by part. This cannot
// see whether a step's decisions are agreed: the lead still checks that (T-211).
const byId = new Map();
for (const plan of stagePlans) {
  for (const group of plan.groups) {
    for (const step of group.steps) {
      step.stage = plan.number;
      byId.set(step.id, step);
    }
  }
}
const idsIn = (text, self) => {
  if (/every other step|everything else/i.test(text)) {
    return [...byId.values()]
      .filter((other) => other.stage === self.stage && other.id !== self.id)
      .map((other) => other.id);
  }
  const found = new Set();
  const rest = text.replace(/(\d+)\.(\d+) to (\d+)\.(\d+)/g, (whole, a, b, c, d) => {
    for (const other of byId.values()) {
      const [stage, number] = other.id.split('.').map(Number);
      if (
        stage === Number(a) &&
        stage === Number(c) &&
        number >= Number(b) &&
        number <= Number(d)
      ) {
        found.add(other.id);
      }
    }
    return '';
  });
  for (const m of rest.matchAll(/\d+\.\d+/g)) if (byId.has(m[0])) found.add(m[0]);
  found.delete(self.id);
  return [...found];
};
const landed = (id) => byId.get(id)?.state === 'done';
const partLanded = (id, n) =>
  log.some((entry) => entry.text.startsWith(`Step ${id} part ${n} done`));
const partsOf = (step) =>
  [...step.needs.matchAll(/part (\d+):([^·]*)/gi)].map((m) => ({ n: Number(m[1]), text: m[2] }));
// A step built in parts is done once the log has every part's landing, ticked in the plan or
// not. (A forgotten tick once hid the step that fourteen others were waiting on.)
for (const step of byId.values()) {
  const parts = partsOf(step);
  if (parts.length && parts.every((p) => partLanded(step.id, p.n))) step.state = 'done';
}
const ready = [];
for (const step of byId.values()) {
  step.needIds = idsIn(step.needs, step);
  if (step.state === 'done' || open.has(step.id) || step.blocked) continue;
  if (/drafts:/i.test(step.needs)) continue;
  const parts = partsOf(step);
  if (parts.length) {
    const next = parts.find((p) => !partLanded(step.id, p.n));
    if (next && idsIn(next.text, step).every(landed)) {
      ready.push({ id: step.id, name: step.name, part: next.n });
    }
  } else if (step.needIds.every(landed)) {
    ready.push({ id: step.id, name: step.name, part: 0 });
  }
}

// How much unfinished work waits on each step, directly or through other steps. The lead
// opens the steps that unblock the most first, so the long chains do not hold the build up.
const waiting = new Map();
for (const step of byId.values()) {
  if (step.state === 'done') continue;
  const seen = new Set();
  const walk = (id) => {
    for (const need of byId.get(id)?.needIds ?? []) {
      if (seen.has(need) || landed(need)) continue;
      seen.add(need);
      walk(need);
    }
  };
  walk(step.id);
  for (const need of seen) waiting.set(need, (waiting.get(need) ?? 0) + 1);
}
const unfinished = [...byId.values()].filter((step) => step.state !== 'done');
const firstStage = Math.min(...unfinished.map((step) => step.stage));
const later = (entry) => (byId.get(entry.id).stage === firstStage ? 0 : 1);
for (const entry of ready) entry.unblocks = waiting.get(entry.id) ?? 0;
ready.sort((a, b) => later(a) - later(b) || b.unblocks - a.unblocks);

const order = read(path.join(root, 'docs/specs/v1/technical/T10-build-order.md'));
const stages = [...order.matchAll(/^### Stage (\d+) — (.*?)(?: · (.*))?$/gm)].map((m) => {
  const number = Number(m[1]);
  const after = order.slice(m.index);
  return {
    number,
    name: plain(m[2]),
    goal: plain(after.match(/^\*\*Goal:\*\* (.*)$/m)?.[1] ?? ''),
    state:
      number < currentStage
        ? 'done'
        : number === currentStage || lanes.some((lane) => lane.id.startsWith(number + '.'))
          ? 'now'
          : 'todo',
  };
});

const commits = git('log', '--format=%h\t%cI\t%s', '-12', 'main..HEAD')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [hash, time, subject] = line.split('\t');
    return { hash, time, subject };
  });

const data = {
  generatedAt: new Date().toISOString(),
  state: field('State'),
  branch: field('Branch'),
  currentStage,
  lock: read(path.join(buildDir, '.lock')).trim(),
  stagePlans,
  stages,
  commits,
  needs,
  lanes,
  laneCount: Number(field('Lanes').match(/\d+/)?.[0] ?? 0),
  ready,
};

const css = read(path.join(here, 'dashboard/page.css'));
const script = read(path.join(here, 'dashboard/page.js'));
const html = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<title>Build progress</title>',
  '<style>',
  css,
  '</style>',
  '</head>',
  '<body>',
  '<main>',
  '  <div class="top">',
  '    <div><h1>Build progress</h1><div class="muted small" id="sub"></div></div>',
  '    <div class="pill" id="pill"><span class="dot"></span><span id="pilltext"></span></div>',
  '  </div>',
  '  <div class="banner" id="preview" hidden>Preview only: this shows what a busy moment looks like, not what is happening now.</div>',
  '',
  '  <div class="card village"><div class="villagein">',
  '    <div id="scene"></div>',
  '    <div class="bubble" id="bubble"></div>',
  '    <div class="toast" id="toast" hidden></div>',
  '  </div></div>',
  '  <p class="muted small legend" id="legend"></p>',
  '  <div id="detail"></div>',
  '',
  '  <h2>How far along</h2>',
  '  <div class="card" id="progress"></div>',
  '',
  '  <div class="two">',
  '    <div><h2>Latest saved work</h2><div class="card"><ul id="commits"></ul></div></div>',
  '    <div><h2>Waiting on you</h2><div class="card"><ul id="needs"></ul></div></div>',
  '  </div>',
  '',
  '  <h2>The whole road</h2>',
  '  <div class="road-cards" id="road"></div>',
  '',
  '  <h2>Every step</h2>',
  '  <details class="card" id="board">',
  '    <summary>Open the full list of steps, stage by stage</summary>',
  '    <div class="tabs" id="tabs"></div>',
  '    <div id="lanes"></div>',
  '  </details>',
  '  <p class="muted small" id="foot"></p>',
  '</main>',
  '<script>',
  'const D = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';',
  script,
  '</script>',
  '</body>',
  '</html>',
  '',
].join('\n');

fs.writeFileSync(path.join(buildDir, 'dashboard.html'), html);
const stepCount = stagePlans.reduce(
  (sum, plan) => sum + plan.groups.reduce((n, group) => n + group.steps.length, 0),
  0,
);
console.log(
  `Wrote docs/build/dashboard.html (${stagePlans.length} stage plans, ${stepCount} steps, ${lanes.length} open lanes).`,
);

// The lead reads this after every landing. It is the guard against sliding back to one
// builder at a time: free lanes plus steps that can start means lanes must be opened now.
const free = Math.max(0, data.laneCount - lanes.length);
// Listed most useful first: the number is how many unfinished steps wait on that one.
const names = ready
  .map(
    (step) =>
      step.id +
      (step.part ? ` part ${step.part}` : '') +
      (step.unblocks ? ` (${step.unblocks} wait on it)` : ''),
  )
  .join(', ');
console.log(`Lanes: ${lanes.length} of ${data.laneCount} open in STATUS.md.`);
if (free && ready.length) {
  console.log(
    `>>> ${free} lane${free === 1 ? ' is' : 's are'} FREE and ${ready.length} step${ready.length === 1 ? '' : 's'} can start now: ${names}.`,
  );
  console.log(
    ">>> Open lanes for them now, before anything else (runbook, section 3). Check each step's decisions are agreed first.",
  );
} else if (ready.length) {
  console.log(`Lanes are full. Waiting for a free lane: ${names}.`);
} else {
  console.log('No step can start until an open lane lands.');
}
