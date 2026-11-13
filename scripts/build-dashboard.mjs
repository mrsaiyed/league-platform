// Builds docs/build/dashboard.html: a page the founder opens to see where the build is.
// It reads the stage plans, STATUS.md, the build lock, the build order and git, and writes
// one self-contained file. Every build run calls this after it updates STATUS.md.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const lanes = [...section('In progress').matchAll(/^- \*\*(\d+\.\d+)\*\* — (.*)$/gm)].map((m) => ({
  id: m[1],
  text: plain(m[2]),
}));
const open = new Set(lanes.map((lane) => lane.id));
const nextStep = field('Next step').match(/^(\d+\.\d+)/)?.[1] ?? '';
const currentStage = Number(field('Stage').match(/^(\d+)/)?.[1] ?? 0);

const stagePlans = fs
  .readdirSync(buildDir)
  .filter((name) => /^STAGE-\d+\.md$/.test(name))
  .map((name) => {
    const number = Number(name.match(/\d+/)[0]);
    const groups = [];
    for (const line of read(path.join(buildDir, name)).split('\n')) {
      const heading = line.match(/^### ([A-Z])\. (.*)$/);
      if (heading) groups.push({ letter: heading[1], name: heading[2], steps: [] });
      const step = line.match(/^- \[( |x)\] \*\*(\d+\.\d+) (.*?)\.\*\* (.*)$/);
      if (!step || !groups.length) continue;
      const [body, meta = ''] = step[4].split(/ _(?=Spec:|Done test:|Model:|Needs:)/);
      const note = log.find((entry) => entry.text.startsWith(`Step ${step[2]} done`));
      groups.at(-1).steps.push({
        id: step[2],
        name: step[3],
        text: plain(body),
        model: plain(meta.match(/Model: ([^_]*)/)?.[1] ?? '').replace(/\.$/, ''),
        spec: plain(meta.match(/Spec: (.*?)\.(?: Done test| Needs| Model|$)/)?.[1] ?? ''),
        test: plain(meta.match(/Done test: (.*?)\.(?: Needs| Model|$)/)?.[1] ?? ''),
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

const order = read(path.join(root, 'docs/specs/v1/technical/T10-build-order.md'));
const stages = [...order.matchAll(/^### Stage (\d+) — (.*?)(?: · (.*))?$/gm)].map((m) => {
  const number = Number(m[1]);
  const after = order.slice(m.index);
  return {
    number,
    name: plain(m[2]),
    size: plain(m[3] ?? ''),
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
  nextStep,
  currentStage,
  lock: read(path.join(buildDir, '.lock')).trim(),
  stagePlans,
  stages,
  commits,
  needs,
  lanes,
  laneLimit: field('Lanes'),
};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Build progress</title>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --ink:#16202b; --soft:#5d6b7a; --line:#dfe4ea; --go:#1f9d6b; --now:#2f6fed; --wait:#c98a12; --dim:#aab4c0; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --card:#18202a; --ink:#e9eef4; --soft:#9aa7b5; --line:#2a3542; --go:#3cc48c; --now:#6c9bff; --wait:#e2b04a; --dim:#55616f; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, "Segoe UI", sans-serif; }
  main { max-width:1040px; margin:0 auto; padding:20px 16px 48px; }
  h1 { font-size:22px; margin:0; } h2 { font-size:15px; margin:28px 0 10px; color:var(--soft); font-weight:600; text-transform:uppercase; letter-spacing:.06em; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px; }
  .top { display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; }
  .pill { display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border-radius:999px; border:1px solid var(--line); background:var(--card); font-weight:600; }
  .dot { width:10px; height:10px; border-radius:50%; background:var(--dim); }
  .pill.go .dot { background:var(--go); animation:pulse 1.4s infinite; } .pill.wait .dot { background:var(--wait); }
  .bar { height:12px; border-radius:999px; background:var(--line); overflow:hidden; margin:10px 0 4px; }
  .bar i { display:block; height:100%; width:0; background:linear-gradient(90deg,var(--go),var(--now)); border-radius:999px; transition:width 1.2s ease; }
  .muted { color:var(--soft); } .small { font-size:13px; }
  .crew { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; position:relative; margin-top:14px; }
  .role { border:1px dashed var(--line); border-radius:12px; padding:10px; text-align:center; }
  .role b { display:block; } .role.on { border-style:solid; border-color:var(--now); box-shadow:0 0 0 3px color-mix(in srgb,var(--now) 18%,transparent); }
  .lane { display:grid; grid-template-columns:170px 1fr; gap:12px; align-items:start; padding:12px 0; border-top:1px solid var(--line); }
  .lane:first-child { border-top:0; } .lane h3 { margin:0; font-size:15px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; }
  .chip { border:1px solid var(--line); background:var(--bg); color:var(--ink); border-radius:10px; padding:7px 10px; font:inherit; cursor:pointer; text-align:left; opacity:0; transform:translateY(6px); animation:rise .45s forwards; }
  .chip small { display:block; color:var(--soft); } .chip:hover, .chip.sel { border-color:var(--now); }
  .chip.done { border-color:color-mix(in srgb,var(--go) 55%,var(--line)); } .chip.done b::before { content:"✓ "; color:var(--go); }
  .chip.now { border-color:var(--now); animation:rise .45s forwards, glow 1.8s 0.5s infinite; } .chip.now b::before { content:"● "; color:var(--now); }
  .chip.todo { color:var(--soft); }
  #detail { margin-top:12px; display:none; } #detail.open { display:block; animation:rise .3s forwards; }
  .road { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; }
  .stage { border-left:4px solid var(--dim); } .stage.done { border-left-color:var(--go); } .stage.now { border-left-color:var(--now); }
  .two { display:grid; grid-template-columns:1fr 1fr; gap:12px; } @media (max-width:760px) { .two, .crew { grid-template-columns:1fr 1fr; } .lane { grid-template-columns:1fr; } }
  ul { margin:0; padding-left:18px; } li { margin:4px 0; } code { font-size:12px; color:var(--soft); }
  @keyframes pulse { 50% { transform:scale(1.6); opacity:.5; } } @keyframes rise { to { opacity:1; transform:none; } }
  @keyframes glow { 50% { box-shadow:0 0 0 5px color-mix(in srgb,var(--now) 22%,transparent); } }
  @media (prefers-reduced-motion: reduce) { * { animation:none !important; transition:none !important; } .chip { opacity:1; transform:none; } }
</style>
</head>
<body>
<main>
  <div class="top">
    <div><h1>Build progress</h1><div class="muted small" id="sub"></div></div>
    <div class="pill" id="pill"><span class="dot"></span><span id="pilltext"></span></div>
  </div>

  <h2>This stage</h2>
  <div class="card">
    <div id="headline"></div>
    <div class="bar"><i id="fill"></i></div>
    <div class="muted small" id="count"></div>
    <div class="crew" id="crew"></div>
  </div>

  <h2>Builders at work</h2>
  <div class="card"><div class="muted small" id="teamnote"></div><ul id="team"></ul></div>

  <h2>Work groups</h2>
  <div class="card" id="lanes"></div>
  <div class="card" id="detail"></div>

  <h2>The whole road</h2>
  <div class="road" id="road"></div>

  <div class="two">
    <div><h2>Latest saved work</h2><div class="card"><ul id="commits"></ul></div></div>
    <div><h2>Waiting on you</h2><div class="card"><ul id="needs"></ul></div></div>
  </div>
  <p class="muted small" id="foot"></p>
</main>
<script>
const D = ${JSON.stringify(data).replace(/</g, '\\u003c')};
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
const clock = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const plan = D.stagePlans.find((p) => p.number === D.currentStage) || { groups: [] };
const steps = plan.groups.flatMap((g) => g.steps);
const done = steps.filter((s) => s.state === 'done').length;
const now = steps.find((s) => s.state === 'now');
const lockAge = D.lock ? (Date.now() - new Date(D.lock)) / 60000 : Infinity;
const working = D.state === 'building' && lockAge < 35;
const quiet = D.state === 'building' && lockAge >= 35 && lockAge < 600;

const pill = D.state === 'stage-review' ? ['wait', 'Stage finished: waiting for your check']
  : D.state === 'waiting-for-founder' ? ['wait', 'Waiting on you']
  : working ? ['go', 'A run is working (last sign of life ' + ago(D.lock) + ')']
  : quiet ? ['wait', 'Paused since ' + ago(D.lock) + ', most likely the usage limit. It resumes by itself.']
  : ['', 'Between runs: the next one starts by itself'];
$('pill').className = 'pill ' + pill[0]; $('pilltext').textContent = pill[1];
const stage = D.stages.find((s) => s.number === D.currentStage);
$('sub').textContent = 'Stage ' + D.currentStage + (stage ? ': ' + stage.name : '') + ' · branch ' + D.branch;
$('headline').innerHTML = '';
const all = D.stagePlans.flatMap((p) => p.groups.flatMap((g) => g.steps));
$('headline').append(el('b', '', D.lanes.length ? D.lanes.length + (D.lanes.length === 1 ? ' builder' : ' builders') + ' at work at the same time' : now ? 'Next: ' + now.id + ' ' + now.name : 'All steps in this stage are done'), el('div', 'muted', D.lanes.length ? 'Each builds one step in its own copy of the code. The lead checks each one, has it reviewed, and saves it.' : now ? now.text : ''));
$('teamnote').textContent = D.laneLimit ? 'Allowed: ' + D.laneLimit : '';
D.lanes.forEach((l) => { const s = all.find((x) => x.id === l.id); const li = el('li'); li.append(el('b', '', l.id + (s ? ' ' + s.name : '')), document.createTextNode((s && s.model ? ' · built by ' + s.model : '') + ' · ' + l.text)); $('team').append(li); });
if (!D.lanes.length) $('team').append(el('li', 'muted', working ? 'The lead is checking what the last run left and opening lanes' : 'No builder is working right now'));
$('count').textContent = done + ' of ' + steps.length + ' steps done in this stage';
requestAnimationFrame(() => { $('fill').style.width = (steps.length ? (100 * done) / steps.length : 0) + '%'; });

const roles = [
  ['Lead', 'Plans, writes each brief, keeps the lanes full, checks every result'],
  ['Builders' + (D.lanes.length ? ' · ' + D.lanes.length + ' at once' : ''), 'Each writes the code for one step, in its own lane'],
  ['Reviewer', 'A fresh agent that did not write it looks for faults'],
  ['Save', 'Full check passes, then the work is committed'],
];
roles.forEach(([name, what]) => { const r = el('div', 'role'); r.append(el('b', '', name), el('span', 'muted small', what)); $('crew').append(r); });
if (working) { let i = 0; const tick = () => { [...$('crew').children].forEach((c, k) => c.classList.toggle('on', k === i)); i = (i + 1) % roles.length; }; tick(); setInterval(tick, 1600); }

let delay = 0;
D.stagePlans.slice().sort((a, b) => a.number - b.number).forEach((p) => { $('lanes').append(el('h3', '', 'Stage ' + p.number)); p.groups.forEach((g) => {
  const lane = el('div', 'lane'); const left = el('div');
  const d = g.steps.filter((s) => s.state === 'done').length;
  const models = [...new Set(g.steps.map((s) => s.model.split(/[ ,]/)[0]).filter(Boolean))].join(', ');
  left.append(el('h3', '', g.letter + '. ' + g.name), el('div', 'muted small', d + ' of ' + g.steps.length + ' done'), el('div', 'muted small', 'Built by: ' + models));
  const chips = el('div', 'chips');
  g.steps.forEach((s) => {
    const c = el('button', 'chip ' + s.state); c.style.animationDelay = (delay += 40) + 'ms';
    c.append(el('b', '', s.id + ' ' + s.name), el('small', '', s.state === 'done' ? 'done' : s.state === 'now' ? 'in progress' : 'planned · ' + s.model));
    c.onclick = () => show(s, c); chips.append(c);
  });
  lane.append(left, chips); $('lanes').append(lane);
}); });
function show(s, chip) {
  document.querySelectorAll('.chip.sel').forEach((c) => c.classList.remove('sel')); chip.classList.add('sel');
  const d = $('detail'); d.innerHTML = ''; d.className = 'card open';
  d.append(el('b', '', s.id + ' ' + s.name), el('p', '', s.text));
  [['Who builds it', s.model], ['Done when', s.test], ['From the spec', s.spec], ['What happened', s.note]].forEach(([k, v]) => { if (v) { const p = el('p', 'small'); p.append(el('b', '', k + ': '), document.createTextNode(v)); d.append(p); } });
}

D.stages.forEach((s) => { const c = el('div', 'card stage ' + s.state); c.append(el('b', '', 'Stage ' + s.number + ' · ' + s.name), el('div', 'muted small', s.state === 'done' ? 'Done' : s.state === 'now' ? 'In progress · ' + done + ' of ' + steps.length + ' steps' : 'Planned' + (s.size ? ' · ' + s.size : '')), el('div', 'small', s.goal)); $('road').append(c); });
D.commits.forEach((c) => { const li = el('li'); li.append(document.createTextNode(c.subject + ' '), el('code', '', clock(c.time))); $('commits').append(li); });
if (!D.commits.length) $('commits').append(el('li', 'muted', 'Nothing saved yet'));
D.needs.filter((n) => !n.done).forEach((n) => $('needs').append(el('li', '', n.text)));
if (!$('needs').children.length) $('needs').append(el('li', 'muted', 'Nothing right now'));
$('foot').textContent = 'Page written ' + clock(D.generatedAt) + '. It is rewritten each time a step is saved and reloads itself every minute.';
setInterval(() => { if (!$('detail').classList.contains('open')) location.reload(); }, 60000);
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(buildDir, 'dashboard.html'), html);
console.log(
  `Wrote docs/build/dashboard.html (${data.stagePlans.length} stage plan, ${commits.length} commits).`,
);
