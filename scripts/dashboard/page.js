// The script of the build progress page. scripts/build-dashboard.mjs inlines it into
// docs/build/dashboard.html after a line that defines D, the data read from the build files.
/* global D, document, location, requestAnimationFrame */

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const ago = (iso) => {
  const minutes = Math.round((Date.now() - new Date(iso)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + ' min ago';
  if (minutes < 1440) return Math.round(minutes / 60) + ' h ago';
  return Math.round(minutes / 1440) + ' d ago';
};
const clock = (iso) =>
  new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// ---------- the cast: one character for each kind of job ----------
// c is [main colour, dark shade, light tint].
const CAST = {
  lead: {
    name: 'Leo',
    animal: 'lion',
    job: 'The lead',
    does: 'Plans the work, briefs every builder, checks every result and saves it.',
    c: ['#f2b33d', '#c8791a', '#ffe9b8'],
  },
  inspector: {
    name: 'Rocky',
    animal: 'raccoon',
    job: 'The reviewer',
    does: 'Looks for faults in work he did not write. Nothing is saved without him.',
    c: ['#8e99a8', '#4b5563', '#e5e9ef'],
  },
  security: {
    name: 'Shelly',
    animal: 'turtle',
    job: 'Security',
    does: "Sign-in, permissions, and keeping each league's records apart.",
    c: ['#3bb878', '#1f7f52', '#c9f2dc'],
  },
  database: {
    name: 'Ellie',
    animal: 'elephant',
    job: 'Database',
    does: 'Tables, lookups, and moving data in.',
    c: ['#5b9cf6', '#2f6fd6', '#d6e6ff'],
  },
  rules: {
    name: 'Plum',
    animal: 'owl',
    job: 'Rules of the product',
    does: 'Leagues, seasons, teams, schedules and standings.',
    c: ['#9b7bf2', '#6a48cf', '#e8dfff'],
  },
  pages: {
    name: 'Pixel',
    animal: 'cat',
    job: 'Pages and design',
    does: 'Everything people see and tap.',
    c: ['#f277b0', '#c9437f', '#ffe0ee'],
  },
  services: {
    name: 'Bizzy',
    animal: 'bee',
    job: 'Background jobs',
    does: 'Email, the job queue, logging and outside services.',
    c: ['#f4c531', '#3a2f00', '#fff3c2'],
  },
  tracker: {
    name: 'Dash',
    animal: 'fox',
    job: 'Live stats',
    does: 'The game tracker and live game pages.',
    c: ['#f58a3c', '#b9541a', '#fff0e2'],
  },
  checks: {
    name: 'Dot',
    animal: 'ladybug',
    job: 'Tests and checks',
    does: 'Catches bugs before anything is saved.',
    c: ['#ef5350', '#2b2b33', '#ffd9d8'],
  },
  groundwork: {
    name: 'Timber',
    animal: 'beaver',
    job: 'Groundwork',
    does: 'Project structure, setup and records.',
    c: ['#b07a45', '#7a4f24', '#f3dcc3'],
  },
};
const JOBS = [
  'security',
  'database',
  'rules',
  'pages',
  'services',
  'tracker',
  'checks',
  'groundwork',
];

const INK = '#1c1c22';
const eyes = (x1, x2, y, r = 2.6) =>
  `<g class="eyes"><circle cx="${x1}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x2}" cy="${y}" r="${r}" fill="${INK}"/>` +
  `<circle cx="${x1 + 0.9}" cy="${y - 0.9}" r="${r * 0.3}" fill="#fff"/><circle cx="${x2 + 0.9}" cy="${y - 0.9}" r="${r * 0.3}" fill="#fff"/></g>`;
const mouth = (y, colour = INK) =>
  `<path d="M28 ${y}q4 3.4 8 0" fill="none" stroke="${colour}" stroke-width="1.6" stroke-linecap="round"/>`;
const catMouth = (y) =>
  `<path d="M32 ${y}q-2 2.6-4 1M32 ${y}q2 2.6 4 1" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`;

const DRAW = {
  turtle: (m, d, l) =>
    `<ellipse cx="17" cy="56" rx="5.5" ry="3.4" fill="${m}"/><ellipse cx="47" cy="56" rx="5.5" ry="3.4" fill="${m}"/>` +
    `<ellipse cx="32" cy="45" rx="19" ry="13" fill="${d}"/>` +
    `<path d="M16 41q16-13 32 0M15 49q17 9 34 0" fill="none" stroke="${l}" stroke-width="1.3" opacity=".5"/>` +
    `<circle cx="32" cy="23" r="12.5" fill="${m}"/>${eyes(27, 37, 22)}${mouth(28)}` +
    `<g class="tool"><path d="M32 37l7 2.6v5.4c0 4.4-3.4 6.8-7 8-3.6-1.200-7-3.600-7-8v-5.400z" fill="${l}" stroke="${d}" stroke-width="1"/>` +
    `<path d="M28.800 45l2.300 2.400 4.200-4.800" fill="none" stroke="${d}" stroke-width="1.800" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  elephant: (m, d, l) =>
    `<ellipse cx="24" cy="57" rx="5" ry="3" fill="${d}"/><ellipse cx="40" cy="57" rx="5" ry="3" fill="${d}"/>` +
    `<ellipse cx="32" cy="47" rx="14" ry="11" fill="${m}"/>` +
    `<circle cx="13" cy="25" r="10" fill="${m}"/><circle cx="51" cy="25" r="10" fill="${m}"/>` +
    `<circle cx="13" cy="25" r="6" fill="${l}"/><circle cx="51" cy="25" r="6" fill="${l}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>${eyes(25, 39, 24)}` +
    `<g class="tool"><path d="M32 28v10q0 6-6.500 6" fill="none" stroke="${d}" stroke-width="5.200" stroke-linecap="round"/></g>`,
  owl: (m, d, l) =>
    `<g class="tool"><path d="M17 39q-7 8 0 15 4.500-7 0-15z" fill="${d}"/></g><path d="M47 39q7 8 0 15-4.500-7 0-15z" fill="${d}"/>` +
    `<ellipse cx="32" cy="45" rx="15" ry="13" fill="${m}"/><ellipse cx="32" cy="48" rx="8.500" ry="8" fill="${l}"/>` +
    `<path d="M27 45q2.500 2 5 0M32 45q2.500 2 5 0M29.500 49.500q2.500 2 5 0" stroke="${d}" stroke-width="1" fill="none"/>` +
    `<path d="M19 18l3-11 8 8zM45 18l-3-11-8 8z" fill="${d}"/>` +
    `<circle cx="32" cy="25" r="14" fill="${m}"/><circle cx="26" cy="24" r="6" fill="#fff"/><circle cx="38" cy="24" r="6" fill="#fff"/>` +
    `${eyes(26, 38, 24, 2.9)}<path d="M29.800 29h4.400l-2.200 4.200z" fill="#f59e0b"/>`,
  cat: (m, d, l) =>
    `<g class="tail"><path d="M44 52q11 0 9-11" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/>` +
    `<path d="M19 20l1-14 11 8zM45 20l-1-14-11 8z" fill="${m}"/><path d="M21.500 16.500l.600-6.500 5.200 3.800zM42.500 16.500l-.600-6.500-5.200 3.800z" fill="${l}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>${eyes(26, 38, 25)}` +
    `<path d="M30.500 29.200h3l-1.500 1.900z" fill="${d}"/>${catMouth(31.2)}` +
    `<path d="M20 28h-6M20 31l-6 1.500M44 28h6M44 31l6 1.500" stroke="${d}" stroke-width="1" stroke-linecap="round"/>` +
    `<g class="tool"><path d="M14 56l6-13" stroke="#8b5a2b" stroke-width="2.400" stroke-linecap="round"/><path d="M18.600 44.500l1-6.500 3.600 5z" fill="${d}"/></g>`,
  bee: (m, d, l) =>
    `<g class="wing"><ellipse cx="17" cy="37" rx="9" ry="5.500" fill="#cfe8ff" stroke="#9cc7ee" stroke-width=".8" transform="rotate(-28 17 37)"/></g>` +
    `<g class="wing"><ellipse cx="47" cy="37" rx="9" ry="5.500" fill="#cfe8ff" stroke="#9cc7ee" stroke-width=".8" transform="rotate(28 47 37)"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/><path d="M20.500 44h23M20 50.500h24" stroke="${d}" stroke-width="3.600" stroke-linecap="round"/>` +
    `<path d="M27 14q-3-7-7-6M37 14q3-7 7-6" fill="none" stroke="${d}" stroke-width="1.600" stroke-linecap="round"/>` +
    `<circle cx="20" cy="8" r="2" fill="${d}"/><circle cx="44" cy="8" r="2" fill="${d}"/>` +
    `<circle cx="32" cy="26" r="13.500" fill="${m}"/><ellipse cx="32" cy="30" rx="8" ry="5.500" fill="${l}"/>${eyes(26, 38, 25)}${mouth(30)}`,
  fox: (m, d) =>
    `<g class="tail"><path d="M44 53q13-1 10-15-9 3-10 15z" fill="${m}"/><circle cx="53.500" cy="40" r="2.600" fill="#fff"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/><ellipse cx="32" cy="50" rx="6.500" ry="7" fill="#fff"/>` +
    `<path d="M18 21v-15l12 9zM46 21v-15l-12 9z" fill="${m}"/><path d="M20.500 16.500v-7l5.600 4.200zM43.500 16.500v-7l-5.600 4.200z" fill="${d}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>` +
    `<path d="M18.600 29q6 12 13.400 11 7.400 1 13.400-11-7 3-13.400-2-6.400 5-13.400 2z" fill="#fff"/>` +
    `${eyes(26, 38, 24)}<circle cx="32" cy="31.500" r="1.900" fill="${INK}"/>` +
    `<g class="tool"><circle cx="13" cy="51" r="5.500" fill="#e8762b" stroke="#7a3a10" stroke-width="1"/><path d="M7.500 51h11M13 45.500v11" stroke="#7a3a10" stroke-width=".8"/></g>`,
  ladybug: (m, d) =>
    `<path d="M26 13q-4-7-8-5M38 13q4-7 8-5" fill="none" stroke="${d}" stroke-width="1.600" stroke-linecap="round"/>` +
    `<circle cx="18" cy="8" r="1.900" fill="${d}"/><circle cx="46" cy="8" r="1.900" fill="${d}"/>` +
    `<ellipse cx="32" cy="45" rx="16" ry="13" fill="${m}"/><path d="M32 33v25" stroke="${d}" stroke-width="1.600"/>` +
    `<circle cx="23.500" cy="41" r="2.700" fill="${d}"/><circle cx="40.500" cy="41" r="2.700" fill="${d}"/><circle cx="22.500" cy="50.500" r="2.300" fill="${d}"/><circle cx="41.500" cy="50.500" r="2.300" fill="${d}"/>` +
    `<circle cx="32" cy="23" r="12.500" fill="${d}"/><circle cx="27" cy="22" r="3.700" fill="#fff"/><circle cx="37" cy="22" r="3.700" fill="#fff"/>` +
    `${eyes(27, 37, 22, 1.9)}${mouth(28.5, '#fff')}` +
    `<g class="tool"><rect x="46" y="41" width="12" height="15" rx="2" fill="#fff" stroke="${d}" stroke-width="1.200"/>` +
    `<path d="M48.800 48.500l2.300 2.500 4.200-5.200" fill="none" stroke="#22a55b" stroke-width="1.900" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  beaver: (m, d, l) =>
    `<g class="tail"><ellipse cx="50" cy="53" rx="9" ry="4.500" fill="${d}" transform="rotate(-20 50 53)"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/><ellipse cx="32" cy="50" rx="7" ry="7" fill="${l}"/>` +
    `<circle cx="19" cy="17" r="4.500" fill="${d}"/><circle cx="45" cy="17" r="4.500" fill="${d}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>` +
    `<path d="M18.500 19.500q13.500-17 27 0z" fill="#fbbf24"/><rect x="16" y="18.500" width="32" height="3.200" rx="1.600" fill="#f59e0b"/>` +
    `${eyes(26, 38, 26.5)}<ellipse cx="32" cy="31.500" rx="3" ry="2" fill="${d}"/>` +
    `<rect x="29.500" y="33.400" width="2.300" height="3.600" rx=".6" fill="#fff" stroke="${INK}" stroke-width=".5"/><rect x="32.200" y="33.400" width="2.300" height="3.600" rx=".6" fill="#fff" stroke="${INK}" stroke-width=".5"/>` +
    `<g class="tool"><path d="M12 56l6-13" stroke="#8b5a2b" stroke-width="2.400" stroke-linecap="round"/><rect x="13.500" y="38" width="10" height="5.500" rx="1.200" fill="#6b7280" transform="rotate(25 18.500 40.700)"/></g>`,
  lion: (m, d, l) =>
    `<circle cx="32" cy="26" r="19" fill="${d}"/><circle cx="32" cy="26" r="18.500" fill="none" stroke="${m}" stroke-width="3" stroke-dasharray="5 5.600" opacity=".85"/>` +
    `<ellipse cx="32" cy="49" rx="12" ry="9.500" fill="${m}"/>` +
    `<circle cx="20.500" cy="13.500" r="4.200" fill="${m}"/><circle cx="43.500" cy="13.500" r="4.200" fill="${m}"/>` +
    `<circle cx="32" cy="26" r="13" fill="${m}"/><ellipse cx="32" cy="31" rx="6" ry="4.600" fill="${l}"/>` +
    `${eyes(26, 38, 24)}<path d="M30.200 28.800h3.600l-1.800 2.100z" fill="#7a3a10"/>${catMouth(30.9)}` +
    `<g class="tool"><rect x="44" y="41" width="13" height="16" rx="2" fill="#fff" stroke="${d}" stroke-width="1.200"/>` +
    `<path d="M47 46h7M47 49.500h7M47 53h4.500" stroke="${d}" stroke-width="1.300" stroke-linecap="round"/></g>` +
    `<path d="M32 1l1.900 3.800 4.200.6-3 3 .7 4.200-3.800-2-3.800 2 .7-4.200-3-3 4.200-.6z" fill="#fde047" stroke="${d}" stroke-width=".6"/>`,
  raccoon: (m, d, l) =>
    `<g class="tail"><path d="M44 53q12-1 10-14" fill="none" stroke="${m}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M44 53q12-1 10-14" fill="none" stroke="${d}" stroke-width="6" stroke-dasharray="3 4.500"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/><ellipse cx="32" cy="50" rx="7" ry="7" fill="${l}"/>` +
    `<circle cx="20" cy="14" r="5" fill="${d}"/><circle cx="44" cy="14" r="5" fill="${d}"/><circle cx="20" cy="14" r="2.400" fill="${l}"/><circle cx="44" cy="14" r="2.400" fill="${l}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>` +
    `<path d="M18.500 24q7-6 13.500 0 6.500-6 13.500 0-2 7-8 6-3-.6-5.500-3-2.500 2.400-5.500 3-6 1-8-6z" fill="${d}"/>` +
    `<circle cx="26" cy="25" r="3.300" fill="#fff"/><circle cx="38" cy="25" r="3.300" fill="#fff"/>${eyes(26, 38, 25, 1.9)}` +
    `<ellipse cx="32" cy="33.500" rx="5" ry="3.600" fill="${l}"/><circle cx="32" cy="32" r="1.700" fill="${INK}"/>` +
    `<g class="tool"><circle cx="12" cy="47" r="5.500" fill="#dff1ff" stroke="${d}" stroke-width="2"/><path d="M16 51l5 5" stroke="${d}" stroke-width="2.600" stroke-linecap="round"/></g>`,
};

let critterCount = 0;
/** A character. mode is one of: idle, work, sleep, happy. */
function critter(key, size, mode = 'idle') {
  const who = CAST[key] || CAST.groundwork;
  const node = el('span', 'critter ' + mode);
  node.style.setProperty('--s', size + 'px');
  node.innerHTML =
    `<svg viewBox="0 0 64 64" role="img" aria-label="${who.name} the ${who.animal}">` +
    `<ellipse cx="32" cy="60" rx="15" ry="2.800" fill="#000" opacity=".13"/>` +
    `<g class="bod">${DRAW[who.animal](...who.c)}</g></svg>`;
  // Stagger the animations so the characters do not move in step.
  const offset = -((critterCount++ * 0.37) % 3).toFixed(2) + 's';
  node.querySelectorAll('.bod, .eyes, .tool, .tail').forEach((part) => {
    part.style.animationDelay = offset;
  });
  if (mode === 'sleep') {
    const zzz = el('span', 'zzz', 'z');
    zzz.style.animationDelay = offset;
    node.append(zzz);
  }
  return node;
}

// ---------- what is happening ----------
const preview = location.hash === '#preview';
const plans = D.stagePlans.slice().sort((a, b) => a.number - b.number);
const all = plans.flatMap((p) => p.groups.flatMap((g) => g.steps));
let lanes = D.lanes;
if (preview) {
  const max = D.laneCount || 6;
  lanes = all
    .filter((s) => s.state !== 'done')
    .filter((s, i, list) => list.findIndex((x) => x.job === s.job) === i || i < 3)
    .slice(0, max)
    .map((s) => ({ id: s.id, label: '', text: 'made-up example' }));
  const ids = new Set(lanes.map((l) => l.id));
  all.forEach((s) => {
    if (s.state !== 'done') s.state = ids.has(s.id) ? 'now' : 'todo';
  });
}
const lockAge = D.lock ? (Date.now() - new Date(D.lock)) / 60000 : Infinity;
const building = D.state === 'building';
const working = preview || (building && lockAge < 35);
const quiet = !preview && building && lockAge >= 35 && lockAge < 600;
const stepOf = (id) => all.find((s) => s.id === id);

const pill = preview
  ? ['go', 'Preview of a busy moment']
  : D.state === 'waiting-for-founder'
    ? ['wait', 'Waiting on you']
    : working
      ? ['go', 'The team is working (last sign of life ' + ago(D.lock) + ')']
      : quiet
        ? [
            'wait',
            'Paused since ' + ago(D.lock) + ', most likely the usage limit. It resumes by itself.',
          ]
        : ['', 'Between runs: the next one starts by itself'];
$('pill').className = 'pill ' + pill[0];
$('pilltext').textContent = pill[1];
$('preview').hidden = !preview;
const stage = D.stages.find((s) => s.number === D.currentStage);
$('sub').textContent =
  'Stage ' + D.currentStage + (stage ? ': ' + stage.name : '') + ' · branch ' + D.branch;

// ---------- the workshop ----------
const busy = working && lanes.length > 0;
$('headline').textContent = busy
  ? lanes.length + (lanes.length === 1 ? ' builder' : ' builders') + ' at work right now'
  : working
    ? 'Leo is checking what was left and handing out work'
    : quiet
      ? 'The team is resting until the usage allowance comes back'
      : D.state === 'waiting-for-founder'
        ? 'The team is waiting on you'
        : 'The team is between runs';
$('teamnote').textContent = D.laneCount ? 'Room for ' + D.laneCount + ' builders at once' : '';

const lead = $('lead');
lead.append(critter('lead', 78, working ? 'work' : 'idle'));
if (working) lead.classList.add('walk');
const bubble = el('div', 'bubble');
lead.append(bubble);
const says = busy
  ? [
      'I brief every builder myself.',
      'I read every change before it is saved.',
      'Rocky reviews each step. He never reviews his own work.',
      'Nothing is saved until the full check passes.',
      'When a desk frees up, the next step starts.',
    ]
  : working
    ? ['Checking what the last run left…', 'Opening lanes for the next steps…']
    : quiet
      ? ['We ran out of usage allowance. We start again by ourselves when it resets.']
      : D.state === 'waiting-for-founder'
        ? ['We need an answer from you. See "Waiting on you" below.']
        : ['The next run starts by itself in a few minutes.'];
let line = 0;
const speak = () => {
  bubble.style.opacity = 0;
  setTimeout(() => {
    bubble.textContent = says[line++ % says.length];
    bubble.style.opacity = 1;
  }, 350);
};
bubble.textContent = says[line++ % says.length];
if (says.length > 1) setInterval(speak, 4200);

// What a lane's builder is doing: the last part of its line in the status file,
// with "Part 1:" in front when the step is being built in parts.
const doing = (lane) => {
  const part = lane.label.match(/part \d+/i)?.[0] ?? '';
  const left = lane.text.split(' — ').pop().trim().replace(/\.$/, '');
  const text = (part ? part[0].toUpperCase() + part.slice(1) + ': ' : '') + (left || 'building');
  return text.length > 96 ? text.slice(0, 94).trimEnd() + '…' : text;
};
const desks = $('desks');
let delay = 0;
if (busy) {
  lanes.forEach((lane) => {
    const step = stepOf(lane.id);
    const job = step ? step.job : 'groundwork';
    const who = CAST[job] || CAST.groundwork;
    const desk = el('div', 'desk');
    desk.style.setProperty('--c', who.c[0]);
    desk.style.animationDelay = (delay += 90) + 'ms';
    const text = el('div');
    text.append(
      el('span', 'who', who.name + ' · ' + who.job),
      el('b', '', lane.id + ' ' + (step ? step.name : lane.label.trim())),
      el('span', 'muted small', doing(lane)),
      el('div', 'stripes'),
    );
    desk.append(critter(job, 68, 'work'), text);
    desks.append(desk);
  });
  for (let i = lanes.length; i < (D.laneCount || 0); i++) {
    const free = el('div', 'desk free', 'Free desk');
    free.style.animationDelay = (delay += 90) + 'ms';
    desks.append(free);
  }
  const review = el('div', 'desk');
  review.style.setProperty('--c', CAST.inspector.c[0]);
  review.style.animationDelay = (delay += 90) + 'ms';
  const reviewText = el('div');
  reviewText.append(
    el('span', 'who', 'Rocky · the reviewer'),
    el('b', '', 'Reviews every finished step'),
    el('span', 'muted small', 'A fresh pair of eyes each time'),
  );
  review.append(critter('inspector', 68, 'work'), reviewText);
  desks.append(review);
} else {
  const rest = el('div', 'rest');
  [...JOBS, 'inspector'].forEach((job) =>
    rest.append(critter(job, 54, working ? 'idle' : 'sleep')),
  );
  desks.append(rest);
}

// ---------- how far along ----------
plans.forEach((p) => {
  const steps = p.groups.flatMap((g) => g.steps);
  const done = steps.filter((s) => s.state === 'done').length;
  const row = el('div', 'prog');
  const bar = el('div', 'bar');
  const fill = el('i');
  bar.append(fill);
  row.append(
    el('b', '', 'Stage ' + p.number),
    bar,
    el('span', 'muted small', done + ' of ' + steps.length + ' steps done'),
  );
  $('progress').append(row);
  requestAnimationFrame(() => {
    fill.style.width = (steps.length ? (100 * done) / steps.length : 0) + '%';
  });
});

// ---------- the team ----------
let filter = '';
const board = $('board');
const applyFilter = () => {
  board.classList.toggle('filtered', Boolean(filter));
  document.querySelectorAll('.member').forEach((m) => {
    m.classList.toggle('sel', m.dataset.job === filter);
  });
  document.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('match', c.dataset.job === filter);
  });
};
const member = (job, plainCard) => {
  const who = CAST[job];
  const mine = all.filter((s) => s.job === job);
  const done = mine.filter((s) => s.state === 'done').length;
  const active = busy && mine.some((s) => s.state === 'now');
  const card = el(plainCard ? 'div' : 'button', 'member' + (plainCard ? ' plain' : ''));
  card.dataset.job = job;
  card.style.setProperty('--c', who.c[0]);
  const text = el('div');
  text.append(el('b', '', who.name + ' the ' + who.animal), el('span', 'job', who.job));
  if (plainCard) {
    text.append(el('div', 'muted small', who.does));
  } else {
    const mini = el('div', 'mini');
    const fill = el('i');
    mini.append(fill);
    text.append(
      el(
        'div',
        'muted small',
        mine.length ? done + ' of ' + mine.length + ' steps done' : 'No steps planned yet',
      ),
      mini,
    );
    requestAnimationFrame(() => {
      fill.style.width = (mine.length ? (100 * done) / mine.length : 0) + '%';
    });
    card.title = who.does + ' Click to light up these steps on the board.';
    card.onclick = () => {
      filter = filter === job ? '' : job;
      applyFilter();
    };
  }
  const mode = active || (plainCard && busy) ? 'work' : working ? 'idle' : 'sleep';
  card.append(critter(job, 58, plainCard && !busy && working ? 'idle' : mode), text);
  return card;
};
$('roster').append(member('lead', true), member('inspector', true));
JOBS.forEach((job) => $('roster').append(member(job, false)));

// ---------- the board ----------
const detail = $('detail');
function show(step, chip) {
  document.querySelectorAll('.chip.sel').forEach((c) => c.classList.remove('sel'));
  chip.classList.add('sel');
  const who = CAST[step.job] || CAST.groundwork;
  detail.innerHTML = '';
  detail.className = 'open';
  detail.style.setProperty('--c', who.c[0]);
  const mode = step.state === 'done' ? 'happy' : step.state === 'now' ? 'work' : 'idle';
  const text = el('div');
  const verb =
    step.state === 'done'
      ? who.name + ' finished this'
      : step.state === 'now'
        ? who.name + ' is building this now'
        : who.name + ' will build this';
  text.append(el('span', 'muted small', verb), el('h3', '', step.id + ' ' + step.name));
  text.append(el('p', '', step.text));
  [
    ['Done when', step.test],
    ['Waits for', step.needs],
    ['AI model', step.model],
    ['From the spec', step.spec],
    ['What happened', step.note],
  ].forEach(([label, value]) => {
    if (!value) return;
    const p = el('p', 'small');
    p.append(el('b', '', label + ': '), document.createTextNode(value));
    text.append(p);
  });
  detail.append(critter(step.job, 84, mode), text);
  detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function drawBoard(number) {
  $('lanes').innerHTML = '';
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('sel', Number(t.dataset.stage) === number);
  });
  const plan = plans.find((p) => p.number === number);
  if (!plan) return;
  let wait = 0;
  plan.groups.forEach((group) => {
    const lane = el('div', 'lane');
    const left = el('div');
    const done = group.steps.filter((s) => s.state === 'done').length;
    left.append(
      el('h3', '', group.letter + '. ' + group.name),
      el('div', 'muted small', done + ' of ' + group.steps.length + ' done'),
    );
    const chips = el('div', 'chips');
    group.steps.forEach((step) => {
      const who = CAST[step.job] || CAST.groundwork;
      const chip = el('button', 'chip ' + step.state);
      chip.dataset.job = step.job;
      chip.style.setProperty('--c', who.c[0]);
      chip.style.animationDelay = Math.min((wait += 25), 1200) + 'ms';
      const text = el('span');
      text.append(
        el('b', '', step.id + ' ' + step.name),
        el(
          'small',
          '',
          step.state === 'done'
            ? 'done'
            : step.state === 'now'
              ? who.name + ' is on it'
              : 'planned · ' + who.job.toLowerCase(),
        ),
      );
      chip.append(critter(step.job, 30, step.state === 'now' ? 'work' : 'idle'), text);
      chip.onclick = () => show(step, chip);
      chips.append(chip);
    });
    lane.append(left, chips);
    $('lanes').append(lane);
  });
  applyFilter();
}
plans.forEach((p) => {
  const steps = p.groups.flatMap((g) => g.steps);
  const done = steps.filter((s) => s.state === 'done').length;
  const tab = el('button', 'tab', 'Stage ' + p.number + ' · ' + done + '/' + steps.length);
  tab.dataset.stage = p.number;
  tab.onclick = () => {
    detail.className = '';
    drawBoard(p.number);
  };
  $('tabs').append(tab);
});
drawBoard(plans.some((p) => p.number === D.currentStage) ? D.currentStage : plans[0]?.number);

// ---------- the road, saved work, waiting on you ----------
D.stages.forEach((s) => {
  const plan = plans.find((p) => p.number === s.number);
  const steps = plan ? plan.groups.flatMap((g) => g.steps) : [];
  const done = steps.filter((x) => x.state === 'done').length;
  const card = el('div', 'card stage ' + s.state);
  const state =
    s.state === 'done'
      ? 'Done'
      : steps.length
        ? (s.state === 'now' ? 'In progress · ' : 'Planned · ') +
          done +
          ' of ' +
          steps.length +
          ' steps'
        : 'Steps not listed yet';
  card.append(
    el('b', '', 'Stage ' + s.number + ' · ' + s.name),
    el('div', 'muted small', state),
    el('div', 'small', s.goal),
  );
  $('road').append(card);
});
D.commits.forEach((c) => {
  const li = el('li');
  li.append(document.createTextNode(c.subject + ' '), el('code', '', clock(c.time)));
  $('commits').append(li);
});
if (!D.commits.length) $('commits').append(el('li', 'muted', 'Nothing saved yet'));
D.needs
  .filter((n) => !n.done)
  .forEach((n) => {
    $('needs').append(el('li', '', n.text));
  });
if (!$('needs').children.length) $('needs').append(el('li', 'muted', 'Nothing right now'));

$('foot').textContent =
  'Page written ' +
  clock(D.generatedAt) +
  '. It is rewritten each time a step is saved, and reloads itself every minute. ' +
  'Each character stands for a kind of work: every step is built by a fresh AI builder, and the character shows which kind of work it is. ';
const toggle = el(
  'button',
  'link',
  preview ? 'Back to what is really happening' : 'See what a busy moment looks like',
);
toggle.onclick = () => {
  location.hash = preview ? '' : '#preview';
  location.reload();
};
$('foot').append(toggle);
setInterval(() => {
  if (!detail.classList.contains('open')) location.reload();
}, 60000);
