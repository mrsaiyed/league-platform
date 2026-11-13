// The script of the build progress page. scripts/build-dashboard.mjs inlines it into
// docs/build/dashboard.html after a line that defines D, the data read from the build files.
// The page is a little village: each kind of job has its own home and its own character,
// paths join the homes whose work depends on each other, and the lead's big top is at the top.
/* global D, document, location, localStorage, requestAnimationFrame */

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};
const esc = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
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
// c is [main colour, dark shade, light tint]. ink is the text colour that reads on the main colour.
const CAST = {
  lead: {
    name: 'Leo',
    animal: 'lion',
    job: 'The lead',
    short: 'The lead',
    home: 'The Big Top',
    does: 'Plans the work, briefs every builder, checks every result and saves it.',
    c: ['#f2b33d', '#c8791a', '#ffe9b8'],
    ink: '#3a2a00',
  },
  inspector: {
    name: 'Rocky',
    animal: 'raccoon',
    job: 'The reviewer',
    short: 'Reviewer',
    home: 'The Checkpoint',
    does: 'Looks for faults in work he did not write. Nothing is saved until it has passed his checkpoint.',
    c: ['#8e99a8', '#4b5563', '#e5e9ef'],
    ink: '#fff',
  },
  security: {
    name: 'Shelly',
    animal: 'turtle',
    job: 'Security',
    short: 'Security',
    home: 'The Guardhouse',
    does: "Sign-in, permissions, and keeping each league's records apart.",
    c: ['#3bb878', '#1f7f52', '#c9f2dc'],
    ink: '#fff',
  },
  database: {
    name: 'Ellie',
    animal: 'elephant',
    job: 'Database',
    short: 'Database',
    home: 'The Archive',
    does: 'Tables, lookups, and moving data in.',
    c: ['#5b9cf6', '#2f6fd6', '#d6e6ff'],
    ink: '#fff',
  },
  rules: {
    name: 'Plum',
    animal: 'owl',
    job: 'Rules of the product',
    short: 'Product rules',
    home: 'The Treehouse',
    does: 'Leagues, seasons, teams, schedules and standings.',
    c: ['#9b7bf2', '#6a48cf', '#e8dfff'],
    ink: '#fff',
  },
  pages: {
    name: 'Pixel',
    animal: 'cat',
    job: 'Pages and design',
    short: 'Pages & design',
    home: 'The Studio',
    does: 'Everything people see and tap.',
    c: ['#f277b0', '#c9437f', '#ffe0ee'],
    ink: '#fff',
  },
  services: {
    name: 'Bizzy',
    animal: 'bee',
    job: 'Background jobs',
    short: 'Background jobs',
    home: 'The Hive',
    does: 'Email, the job queue, logging and outside services.',
    c: ['#f4c531', '#3a2f00', '#fff3c2'],
    ink: '#3a2f00',
  },
  tracker: {
    name: 'Dash',
    animal: 'fox',
    job: 'Live stats',
    short: 'Live stats',
    home: 'The Gym',
    does: 'The game tracker and live game pages.',
    c: ['#f58a3c', '#b9541a', '#fff0e2'],
    ink: '#fff',
  },
  checks: {
    name: 'Dot',
    animal: 'ladybug',
    job: 'Tests and checks',
    short: 'Tests',
    home: 'The Mushroom Lab',
    does: 'Catches bugs before anything is saved.',
    c: ['#ef5350', '#2b2b33', '#ffd9d8'],
    ink: '#fff',
  },
  groundwork: {
    name: 'Timber',
    animal: 'beaver',
    job: 'Groundwork',
    short: 'Groundwork',
    home: 'The Log Cabin',
    does: 'Project structure, setup and records.',
    c: ['#b07a45', '#7a4f24', '#f3dcc3'],
    ink: '#fff',
  },
};
// Where each home sits on the ring road, in degrees (0 is the right-hand side, 90 the bottom).
const SPOTS = {
  pages: -52,
  tracker: -12,
  checks: 28,
  services: 68,
  groundwork: 112,
  database: 152,
  rules: 192,
  security: 232,
};
const JOBS = Object.keys(SPOTS);

const INK = '#1c1c22';
const eyes = (x1, x2, y, r = 2.6) =>
  `<g class="eyes"><circle cx="${x1}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x2}" cy="${y}" r="${r}" fill="${INK}"/>` +
  `<circle cx="${x1 + 0.9}" cy="${y - 0.9}" r="${r * 0.3}" fill="#fff"/><circle cx="${x2 + 0.9}" cy="${y - 0.9}" r="${r * 0.3}" fill="#fff"/></g>`;
const mouth = (y, colour = INK) =>
  `<path d="M28 ${y}q4 3.4 8 0" fill="none" stroke="${colour}" stroke-width="1.6" stroke-linecap="round"/>`;
const catMouth = (y) =>
  `<path d="M32 ${y}q-2 2.6-4 1M32 ${y}q2 2.6 4 1" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`;

// The characters, each drawn in a 64 by 64 box.
const DRAW = {
  turtle: (m, d, l) =>
    `<ellipse cx="17" cy="56" rx="5.5" ry="3.4" fill="${m}"/><ellipse cx="47" cy="56" rx="5.5" ry="3.4" fill="${m}"/>` +
    `<ellipse cx="32" cy="45" rx="19" ry="13" fill="${d}"/>` +
    `<path d="M16 41q16-13 32 0M15 49q17 9 34 0" fill="none" stroke="${l}" stroke-width="1.3" opacity=".5"/>` +
    `<circle cx="32" cy="23" r="12.5" fill="${m}"/>${eyes(27, 37, 22)}${mouth(28)}` +
    `<g class="tool"><path d="M32 37l7 2.6v5.4c0 4.4-3.4 6.8-7 8-3.6-1.2-7-3.6-7-8v-5.4z" fill="${l}" stroke="${d}" stroke-width="1"/>` +
    `<path d="M28.8 45l2.3 2.4 4.2-4.8" fill="none" stroke="${d}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  elephant: (m, d, l) =>
    `<ellipse cx="24" cy="57" rx="5" ry="3" fill="${d}"/><ellipse cx="40" cy="57" rx="5" ry="3" fill="${d}"/>` +
    `<ellipse cx="32" cy="47" rx="14" ry="11" fill="${m}"/>` +
    `<circle cx="13" cy="25" r="10" fill="${m}"/><circle cx="51" cy="25" r="10" fill="${m}"/>` +
    `<circle cx="13" cy="25" r="6" fill="${l}"/><circle cx="51" cy="25" r="6" fill="${l}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>${eyes(25, 39, 24)}` +
    `<g class="tool"><path d="M32 28v10q0 6-6.5 6" fill="none" stroke="${d}" stroke-width="5.2" stroke-linecap="round"/></g>`,
  owl: (m, d, l) =>
    `<g class="tool"><path d="M17 39q-7 8 0 15 4.5-7 0-15z" fill="${d}"/></g><path d="M47 39q7 8 0 15-4.5-7 0-15z" fill="${d}"/>` +
    `<ellipse cx="32" cy="45" rx="15" ry="13" fill="${m}"/><ellipse cx="32" cy="48" rx="8.5" ry="8" fill="${l}"/>` +
    `<path d="M27 45q2.5 2 5 0M32 45q2.5 2 5 0M29.5 49.5q2.5 2 5 0" stroke="${d}" stroke-width="1" fill="none"/>` +
    `<path d="M19 18l3-11 8 8zM45 18l-3-11-8 8z" fill="${d}"/>` +
    `<circle cx="32" cy="25" r="14" fill="${m}"/><circle cx="26" cy="24" r="6" fill="#fff"/><circle cx="38" cy="24" r="6" fill="#fff"/>` +
    `${eyes(26, 38, 24, 2.9)}<path d="M29.8 29h4.4l-2.2 4.2z" fill="#f59e0b"/>`,
  cat: (m, d, l) =>
    `<g class="tail"><path d="M44 52q11 0 9-11" fill="none" stroke="${d}" stroke-width="4" stroke-linecap="round"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/>` +
    `<path d="M19 20l1-14 11 8zM45 20l-1-14-11 8z" fill="${m}"/><path d="M21.5 16.5l.6-6.5 5.2 3.8zM42.5 16.5l-.6-6.5-5.2 3.8z" fill="${l}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>${eyes(26, 38, 25)}` +
    `<path d="M30.5 29.2h3l-1.5 1.9z" fill="${d}"/>${catMouth(31.2)}` +
    `<path d="M20 28h-6M20 31l-6 1.5M44 28h6M44 31l6 1.5" stroke="${d}" stroke-width="1" stroke-linecap="round"/>` +
    `<g class="tool"><path d="M14 56l6-13" stroke="#8b5a2b" stroke-width="2.4" stroke-linecap="round"/><path d="M18.6 44.5l1-6.5 3.6 5z" fill="${d}"/></g>`,
  bee: (m, d, l) =>
    `<g class="wing"><ellipse cx="17" cy="37" rx="9" ry="5.5" fill="#cfe8ff" stroke="#9cc7ee" stroke-width=".8" transform="rotate(-28 17 37)"/></g>` +
    `<g class="wing"><ellipse cx="47" cy="37" rx="9" ry="5.5" fill="#cfe8ff" stroke="#9cc7ee" stroke-width=".8" transform="rotate(28 47 37)"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/><path d="M20.5 44h23M20 50.5h24" stroke="${d}" stroke-width="3.6" stroke-linecap="round"/>` +
    `<path d="M27 14q-3-7-7-6M37 14q3-7 7-6" fill="none" stroke="${d}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<circle cx="20" cy="8" r="2" fill="${d}"/><circle cx="44" cy="8" r="2" fill="${d}"/>` +
    `<circle cx="32" cy="26" r="13.5" fill="${m}"/><ellipse cx="32" cy="30" rx="8" ry="5.5" fill="${l}"/>${eyes(26, 38, 25)}${mouth(30)}`,
  fox: (m, d) =>
    `<g class="tail"><path d="M44 53q13-1 10-15-9 3-10 15z" fill="${m}"/><circle cx="53.5" cy="40" r="2.6" fill="#fff"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/><ellipse cx="32" cy="50" rx="6.5" ry="7" fill="#fff"/>` +
    `<path d="M18 21v-15l12 9zM46 21v-15l-12 9z" fill="${m}"/><path d="M20.5 16.5v-7l5.6 4.2zM43.5 16.5v-7l-5.6 4.2z" fill="${d}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>` +
    `<path d="M18.6 29q6 12 13.4 11 7.4 1 13.4-11-7 3-13.4-2-6.4 5-13.4 2z" fill="#fff"/>` +
    `${eyes(26, 38, 24)}<circle cx="32" cy="31.5" r="1.9" fill="${INK}"/>` +
    `<g class="tool"><circle cx="13" cy="51" r="5.5" fill="#e8762b" stroke="#7a3a10" stroke-width="1"/><path d="M7.5 51h11M13 45.5v11" stroke="#7a3a10" stroke-width=".8"/></g>`,
  ladybug: (m, d) =>
    `<path d="M26 13q-4-7-8-5M38 13q4-7 8-5" fill="none" stroke="${d}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<circle cx="18" cy="8" r="1.9" fill="${d}"/><circle cx="46" cy="8" r="1.9" fill="${d}"/>` +
    `<ellipse cx="32" cy="45" rx="16" ry="13" fill="${m}"/><path d="M32 33v25" stroke="${d}" stroke-width="1.6"/>` +
    `<circle cx="23.5" cy="41" r="2.7" fill="${d}"/><circle cx="40.5" cy="41" r="2.7" fill="${d}"/><circle cx="22.5" cy="50.5" r="2.3" fill="${d}"/><circle cx="41.5" cy="50.5" r="2.3" fill="${d}"/>` +
    `<circle cx="32" cy="23" r="12.5" fill="${d}"/><circle cx="27" cy="22" r="3.7" fill="#fff"/><circle cx="37" cy="22" r="3.7" fill="#fff"/>` +
    `${eyes(27, 37, 22, 1.9)}${mouth(28.5, '#fff')}` +
    `<g class="tool"><rect x="46" y="41" width="12" height="15" rx="2" fill="#fff" stroke="${d}" stroke-width="1.2"/>` +
    `<path d="M48.8 48.5l2.3 2.5 4.2-5.2" fill="none" stroke="#22a55b" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  beaver: (m, d, l) =>
    `<g class="tail"><ellipse cx="50" cy="53" rx="9" ry="4.5" fill="${d}" transform="rotate(-20 50 53)"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/><ellipse cx="32" cy="50" rx="7" ry="7" fill="${l}"/>` +
    `<circle cx="19" cy="17" r="4.5" fill="${d}"/><circle cx="45" cy="17" r="4.5" fill="${d}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>` +
    `<path d="M18.5 19.5q13.5-17 27 0z" fill="#fbbf24"/><rect x="16" y="18.5" width="32" height="3.2" rx="1.6" fill="#f59e0b"/>` +
    `${eyes(26, 38, 26.5)}<ellipse cx="32" cy="31.5" rx="3" ry="2" fill="${d}"/>` +
    `<rect x="29.5" y="33.4" width="2.3" height="3.6" rx=".6" fill="#fff" stroke="${INK}" stroke-width=".5"/><rect x="32.2" y="33.4" width="2.3" height="3.6" rx=".6" fill="#fff" stroke="${INK}" stroke-width=".5"/>` +
    `<g class="tool"><path d="M12 56l6-13" stroke="#8b5a2b" stroke-width="2.4" stroke-linecap="round"/><rect x="13.5" y="38" width="10" height="5.5" rx="1.2" fill="#6b7280" transform="rotate(25 18.5 40.7)"/></g>`,
  lion: (m, d, l) =>
    `<circle cx="32" cy="26" r="19" fill="${d}"/><circle cx="32" cy="26" r="18.5" fill="none" stroke="${m}" stroke-width="3" stroke-dasharray="5 5.6" opacity=".85"/>` +
    `<ellipse cx="32" cy="49" rx="12" ry="9.5" fill="${m}"/>` +
    `<circle cx="20.5" cy="13.5" r="4.2" fill="${m}"/><circle cx="43.5" cy="13.5" r="4.2" fill="${m}"/>` +
    `<circle cx="32" cy="26" r="13" fill="${m}"/><ellipse cx="32" cy="31" rx="6" ry="4.6" fill="${l}"/>` +
    `${eyes(26, 38, 24)}<path d="M30.2 28.8h3.6l-1.8 2.1z" fill="#7a3a10"/>${catMouth(30.9)}` +
    `<g class="tool"><rect x="44" y="41" width="13" height="16" rx="2" fill="#fff" stroke="${d}" stroke-width="1.2"/>` +
    `<path d="M47 46h7M47 49.5h7M47 53h4.5" stroke="${d}" stroke-width="1.3" stroke-linecap="round"/></g>` +
    `<path d="M32 1l1.9 3.8 4.2.6-3 3 .7 4.2-3.8-2-3.8 2 .7-4.2-3-3 4.2-.6z" fill="#fde047" stroke="${d}" stroke-width=".6"/>`,
  raccoon: (m, d, l) =>
    `<g class="tail"><path d="M44 53q12-1 10-14" fill="none" stroke="${m}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M44 53q12-1 10-14" fill="none" stroke="${d}" stroke-width="6" stroke-dasharray="3 4.5"/></g>` +
    `<ellipse cx="32" cy="47" rx="13" ry="11" fill="${m}"/><ellipse cx="32" cy="50" rx="7" ry="7" fill="${l}"/>` +
    `<circle cx="20" cy="14" r="5" fill="${d}"/><circle cx="44" cy="14" r="5" fill="${d}"/><circle cx="20" cy="14" r="2.4" fill="${l}"/><circle cx="44" cy="14" r="2.4" fill="${l}"/>` +
    `<circle cx="32" cy="26" r="14" fill="${m}"/>` +
    `<path d="M18.5 24q7-6 13.5 0 6.5-6 13.5 0-2 7-8 6-3-.6-5.5-3-2.5 2.4-5.5 3-6 1-8-6z" fill="${d}"/>` +
    `<circle cx="26" cy="25" r="3.3" fill="#fff"/><circle cx="38" cy="25" r="3.3" fill="#fff"/>${eyes(26, 38, 25, 1.9)}` +
    `<ellipse cx="32" cy="33.5" rx="5" ry="3.6" fill="${l}"/><circle cx="32" cy="32" r="1.7" fill="${INK}"/>` +
    `<g class="tool"><circle cx="12" cy="47" r="5.5" fill="#dff1ff" stroke="${d}" stroke-width="2"/><path d="M16 51l5 5" stroke="${d}" stroke-width="2.6" stroke-linecap="round"/></g>`,
};

let critterCount = 0;
const stagger = () => -((critterCount++ * 0.37) % 3).toFixed(2) + 's';
/** A character as a piece of the page. mode is one of: idle, work, sleep, happy. */
function critter(key, size, mode = 'idle') {
  const who = CAST[key] || CAST.groundwork;
  const node = el('span', 'critter ' + mode);
  node.style.setProperty('--s', size + 'px');
  node.innerHTML =
    `<svg viewBox="0 0 64 64" role="img" aria-label="${who.name} the ${who.animal}">` +
    `<ellipse cx="32" cy="60" rx="15" ry="2.8" fill="#000" opacity=".13"/>` +
    `<g class="bod" style="animation-delay:${stagger()}">${DRAW[who.animal](...who.c)}</g></svg>`;
  if (mode === 'sleep') node.append(el('span', 'zzz', 'z'));
  return node;
}
/** The same character as a piece of the village drawing. */
function crit(key, mode, x, y, size) {
  const who = CAST[key] || CAST.groundwork;
  const delay = stagger();
  return (
    `<svg class="crit ${mode}" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64" overflow="visible">` +
    `<ellipse cx="32" cy="60" rx="15" ry="2.8" fill="#000" opacity=".18"/>` +
    `<g class="bod" style="animation-delay:${delay}">${DRAW[who.animal](...who.c)}</g>` +
    (mode === 'sleep'
      ? `<text class="zz" x="50" y="10" style="animation-delay:${delay}">z</text>`
      : '') +
    `</svg>`
  );
}

// ---------- the homes, each drawn in a 160 by 170 box with its door at the bottom middle ----------
const column = (x, m) =>
  `<rect x="${x}" y="87" width="12" height="73" fill="#fff" stroke="${m}" stroke-width="1"/>`;
const HOMES = {
  security: {
    smoke: [134, 18],
    draw: (m, d, l) =>
      `<rect x="30" y="78" width="100" height="92" fill="${m}"/>` +
      `<path d="M30 78v-11h13v11zM58 78v-11h13v11zM89 78v-11h13v11zM117 78v-11h13v11z" fill="${m}"/>` +
      `<rect x="8" y="50" width="36" height="120" fill="${d}"/><rect x="116" y="50" width="36" height="120" fill="${d}"/>` +
      `<path d="M2 52l24-32 24 32zM110 52l24-32 24 32z" fill="#17603f"/>` +
      `<path d="M26 22V2" stroke="#55606e" stroke-width="2.4"/><path class="flag" d="M27 3l17 5.5-17 5.5z" fill="#ffd34d"/>` +
      `<rect class="win" x="20" y="72" width="12" height="22" rx="6"/><rect class="win" x="128" y="72" width="12" height="22" rx="6"/>` +
      `<path d="M62 170v-34a18 18 0 0 1 36 0v34z" fill="#123d2b"/><path d="M71 170v-44M80 170v-52M89 170v-44" stroke="${l}" stroke-width="1.6" opacity=".35"/>` +
      `<path d="M80 86l13 5v9.5c0 7.5-6.5 11.5-13 13.5-6.5-2-13-6-13-13.5v-9.5z" fill="${l}" stroke="${d}" stroke-width="1.6"/>` +
      `<path d="M74 100l4.5 4.8 8-9.3" stroke="${d}" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  database: {
    smoke: [118, 52],
    draw: (m, d, l) =>
      `<rect x="12" y="160" width="136" height="10" fill="${d}"/><rect x="20" y="84" width="120" height="78" fill="${l}"/>` +
      `<path d="M8 80l72-48 72 48z" fill="${m}"/><rect x="8" y="78" width="144" height="9" fill="${d}"/>` +
      `<ellipse cx="80" cy="54" rx="12" ry="4.2" fill="#fff"/><path d="M68 54v11c0 2.3 5.4 4.2 12 4.2s12-1.9 12-4.2v-11" fill="#fff" opacity=".9"/>` +
      `<path d="M68 59.5c0 2.3 5.4 4.2 12 4.2s12-1.9 12-4.2" fill="none" stroke="${d}" stroke-width="1.2"/>` +
      column(26, m) +
      column(50, m) +
      column(98, m) +
      column(122, m) +
      `<rect class="win" x="40" y="100" width="8" height="24" rx="2"/><rect class="win" x="112" y="100" width="8" height="24" rx="2"/>` +
      `<path d="M68 160v-36a12 12 0 0 1 24 0v36z" fill="${d}"/>`,
  },
  rules: {
    smoke: [112, 26],
    draw: (m, d, l) =>
      `<path d="M60 170c3-28 1-48-6-66h52c-7 18-9 38-6 66z" fill="#8b5e3c"/>` +
      `<circle cx="44" cy="74" r="34" fill="${d}"/><circle cx="116" cy="74" r="34" fill="${d}"/><circle cx="80" cy="48" r="42" fill="${m}"/><circle cx="80" cy="88" r="28" fill="${m}"/>` +
      `<circle cx="54" cy="40" r="7" fill="${l}" opacity=".45"/><circle cx="108" cy="34" r="5" fill="${l}" opacity=".45"/><circle cx="118" cy="84" r="6" fill="${l}" opacity=".35"/>` +
      `<circle cx="80" cy="56" r="15" fill="#5a3a22"/><circle class="win" cx="80" cy="56" r="11.5"/>` +
      `<path d="M69 170v-24a11 11 0 0 1 22 0v24z" fill="#4a2f1b"/><circle cx="86" cy="152" r="1.6" fill="#ffd34d"/>` +
      `<path d="M119 144v26" stroke="#8b5e3c" stroke-width="2.5"/><path d="M104 128h30v16h-30z" fill="#f4e3b5" stroke="#8b5e3c" stroke-width="1.5"/>` +
      `<path d="M109 133h20M109 138h14" stroke="#8b5e3c" stroke-width="1.5" stroke-linecap="round"/>`,
  },
  pages: {
    smoke: [124, 26],
    draw: (m, d, l) =>
      `<rect x="118" y="30" width="12" height="22" fill="${d}"/><path d="M8 82l18-36h108l18 36z" fill="${d}"/>` +
      `<rect x="18" y="80" width="124" height="90" fill="${l}" stroke="${d}" stroke-width="2"/>` +
      `<ellipse cx="72" cy="64" rx="15" ry="11" fill="#fff"/><circle cx="65" cy="61" r="2.7" fill="#f58a3c"/><circle cx="72" cy="58" r="2.7" fill="#5b9cf6"/>` +
      `<circle cx="79" cy="61.5" r="2.7" fill="#3bb878"/><circle cx="76" cy="68" r="2.4" fill="${d}"/>` +
      `<rect class="win" x="30" y="108" width="60" height="40" rx="3"/>` +
      `<path d="M26 96h68v9q-5.667 7-11.333 0-5.667 7-11.333 0-5.667 7-11.333 0-5.667 7-11.333 0-5.667 7-11.333 0-5.667 7-11.335 0z" fill="${m}"/>` +
      `<rect x="102" y="104" width="28" height="66" rx="3" fill="${d}"/><circle cx="108" cy="140" r="2.2" fill="#ffe08a"/>`,
  },
  services: {
    smoke: [80, 38],
    draw: (m) =>
      [
        [150, 60, 20],
        [124, 55, 20],
        [98, 46, 19],
        [74, 34, 16],
        [54, 20, 12],
      ]
        .map(
          ([cy, rx, ry]) =>
            `<ellipse cx="80" cy="${cy}" rx="${rx}" ry="${ry}" fill="${m}" stroke="#b8860b" stroke-width="2"/>`,
        )
        .join('') +
      `<circle cx="80" cy="100" r="11" fill="#b8860b"/><circle class="win" cx="80" cy="100" r="8"/>` +
      `<path d="M67 170v-16a13 13 0 0 1 26 0v16z" fill="#4a3300"/>` +
      `<path d="M148 170v-36" stroke="#7a5a12" stroke-width="3"/><rect x="135" y="122" width="24" height="14" rx="5" fill="#e25555"/>` +
      `<path class="flag" d="M153 122v-9h6v4h-6" fill="#e25555" stroke="#e25555" stroke-width="1.5"/>`,
  },
  tracker: {
    smoke: [30, 62],
    draw: (m, d, l, info) =>
      `<rect x="14" y="90" width="132" height="80" fill="${l}" stroke="${d}" stroke-width="2"/>` +
      `<path d="M8 92q72-70 144 0z" fill="${m}" stroke="${d}" stroke-width="2"/>` +
      `<rect x="50" y="60" width="60" height="24" rx="4" fill="#1f2430"/>` +
      `<text x="80" y="77.5" text-anchor="middle" font-size="15" font-weight="700" fill="#ffb347" style="font-family:Consolas,monospace">${info.done}:${String(info.total).padStart(2, '0')}</text>` +
      `<rect class="win" x="24" y="106" width="28" height="20" rx="2"/><rect class="win" x="108" y="106" width="28" height="20" rx="2"/>` +
      `<rect x="64" y="124" width="32" height="46" fill="${d}"/><path d="M80 124v46" stroke="${l}" stroke-width="1.6"/>` +
      `<path d="M153 170v-72" stroke="#6b7280" stroke-width="3"/><rect x="141" y="88" width="15" height="13" fill="#fff" stroke="#6b7280" stroke-width="1.2"/>` +
      `<ellipse cx="141" cy="103" rx="7" ry="2.6" fill="none" stroke="#e25555" stroke-width="2"/>`,
  },
  checks: {
    smoke: [117, 6],
    draw: (m) =>
      `<path d="M46 170v-64q0-10 34-10t34 10v64z" fill="#fbf3e4" stroke="#d8c7a8" stroke-width="2"/>` +
      `<rect x="112" y="8" width="10" height="32" fill="#8d6e63"/>` +
      `<path d="M4 106q4-88 76-88t76 88q-76 20-152 0z" fill="${m}"/>` +
      `<circle cx="42" cy="62" r="10" fill="#fff"/><circle cx="82" cy="42" r="12" fill="#fff"/><circle cx="122" cy="68" r="9" fill="#fff"/>` +
      `<circle cx="62" cy="92" r="6" fill="#fff"/><circle cx="104" cy="94" r="7" fill="#fff"/>` +
      `<path d="M70 170v-26a12 12 0 0 1 24 0v26z" fill="#7a3b2e"/><circle cx="89" cy="150" r="1.6" fill="#ffd34d"/>` +
      `<circle cx="58" cy="136" r="9" fill="#d8c7a8"/><circle class="win" cx="58" cy="136" r="6.5"/>`,
  },
  groundwork: {
    smoke: [114, 36],
    draw: (m, d) =>
      `<rect x="22" y="92" width="116" height="78" fill="${m}"/>` +
      `<path d="M22 108h116M22 124h116M22 140h116M22 156h116" stroke="${d}" stroke-width="2"/>` +
      `<rect x="106" y="40" width="16" height="34" fill="#9ca3af" stroke="#6b7280" stroke-width="1.5"/>` +
      `<path d="M6 96l74-58 74 58z" fill="${d}"/>` +
      `<rect x="66" y="122" width="28" height="48" rx="2" fill="#5a3a1a"/><circle cx="88" cy="147" r="1.8" fill="#ffd34d"/>` +
      `<rect class="win" x="32" y="110" width="24" height="22"/><path d="M44 110v22M32 121h24" stroke="${d}" stroke-width="1.6"/>` +
      `<rect class="win" x="104" y="110" width="24" height="22"/><path d="M116 110v22M104 121h24" stroke="${d}" stroke-width="1.6"/>`,
  },
};
// Leo's big top, drawn in a 240 by 200 box.
const bigTop = (m, d, l) => {
  let out = `<rect x="30" y="118" width="180" height="82" fill="${l}"/>`;
  for (let i = 0; i < 6; i++)
    out += `<rect x="${30 + i * 30}" y="118" width="15" height="82" fill="${m}"/>`;
  out +=
    `<path d="M12 122q108-152 216 0z" fill="#e25555"/>` +
    `<path d="M120 46q-34 24-58 76h36q6-48 22-76zM120 46q16 28 22 76h36q-24-52-58-76z" fill="${l}"/>`;
  for (let i = 0; i < 12; i++) {
    out += `<circle cx="${21 + i * 18}" cy="122" r="9" fill="${i % 2 ? '#e25555' : m}"/>`;
  }
  return (
    out +
    `<path d="M98 200l22-58 22 58z" fill="#5a2a1a"/>` +
    `<circle class="win" cx="62" cy="162" r="10"/><circle class="win" cx="178" cy="162" r="10"/>` +
    `<path d="M120 46V14" stroke="#55606e" stroke-width="2.6"/><path class="flag" d="M121 15l24 7.5-24 7.5z" fill="${d}"/>`
  );
};
// Rocky's checkpoint (120 by 90) and the vault where saved work is kept (120 by 100).
const checkpoint =
  `<rect x="10" y="36" width="46" height="54" fill="#e5e9ef" stroke="#4b5563" stroke-width="2"/><path d="M4 38l29-22 29 22z" fill="#4b5563"/>` +
  `<rect class="win" x="18" y="48" width="30" height="20" rx="2"/><rect x="68" y="58" width="6" height="32" fill="#4b5563"/>` +
  `<g class="arm"><rect x="68" y="54" width="50" height="7" rx="3.5" fill="#fff" stroke="#4b5563" stroke-width="1.2"/>` +
  `<rect x="80" y="54" width="8" height="7" fill="#e25555"/><rect x="98" y="54" width="8" height="7" fill="#e25555"/></g>`;
const vault =
  `<rect x="8" y="36" width="104" height="64" fill="#d5dde8" stroke="#51607a" stroke-width="2"/><path d="M2 38l58-28 58 28z" fill="#51607a"/>` +
  `<circle cx="60" cy="68" r="23" fill="#9fb1cb" stroke="#51607a" stroke-width="3"/>` +
  `<g class="spin"><path d="M60 49v38M41 68h38M46.6 54.6l26.800 26.800M73.400 54.600l-26.800 26.800" stroke="#51607a" stroke-width="2.6" stroke-linecap="round"/></g>` +
  `<circle cx="60" cy="68" r="5.5" fill="#51607a"/>`;

// ---------- what is happening ----------
const preview = location.hash === '#preview';
const plans = D.stagePlans.slice().sort((a, b) => a.number - b.number);
const all = plans.flatMap((p) => p.groups.flatMap((g) => g.steps));
const stepOf = (id) => all.find((s) => s.id === id);
let lanes = D.lanes;
if (preview) {
  const seen = new Set();
  lanes = all
    .filter((s) => s.state !== 'done' && s.job !== 'inspector')
    .filter((s) => !seen.has(s.job) && seen.add(s.job))
    .slice(0, D.laneCount || 6)
    .map((s) => ({ id: s.id, label: '', text: 'made-up example' }));
  const ids = new Set(lanes.map((l) => l.id));
  all.forEach((s) => {
    if (s.state !== 'done') s.state = ids.has(s.id) ? 'now' : 'todo';
  });
}
// The newest sign that the team is alive: the lead's own time stamp, or newer saved work
// on the build branch or in any builder's lane.
const lastSign =
  [D.lock, D.commits[0] && D.commits[0].time, D.newestWork]
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || '';
const lockAge = D.lock ? (Date.now() - new Date(lastSign)) / 60000 : Infinity;
// This page is a saved file: it knows only what was true when it was written. When it is
// old it says so, and does not guess why the team looks quiet.
const pageAge = (Date.now() - new Date(D.generatedAt)) / 60000;
const building = D.state === 'building';
const working = preview || (building && lockAge < 35);
const silent = !preview && building && lockAge >= 35;
const stale = silent && pageAge >= 25;
const quiet = silent && !stale && lockAge < 600;
const busy = working && lanes.length > 0;
const doneCount = all.filter((s) => s.state === 'done').length;
const laneOf = (id) => lanes.find((l) => l.id === id);
// What a lane's builder is doing: the last part of its line in the status file,
// with "Part 1:" in front when the step is being built in parts.
const doing = (lane) => {
  const part = lane.label.match(/part \d+/i)?.[0] ?? '';
  const left = lane.text.split(' — ').pop().trim().replace(/\.$/, '');
  const text = (part ? part[0].toUpperCase() + part.slice(1) + ': ' : '') + (left || 'building');
  return text.length > 110 ? text.slice(0, 108).trimEnd() + '…' : text;
};
const stat = {};
[...JOBS, 'inspector'].forEach((job) => {
  const mine = all.filter((s) => s.job === job);
  stat[job] = {
    total: mine.length,
    done: mine.filter((s) => s.state === 'done').length,
    now: busy ? mine.filter((s) => s.state === 'now') : [],
  };
});

// Which homes depend on each other: count the steps of one job that wait for a step of another.
const weight = {};
const pair = (a, b) => [a, b].sort().join('|');
all.forEach((s) => {
  if (!JOBS.includes(s.job)) return;
  (s.needIds || []).forEach((id) => {
    const other = stepOf(id);
    if (!other || !JOBS.includes(other.job) || other.job === s.job) return;
    weight[pair(s.job, other.job)] = (weight[pair(s.job, other.job)] || 0) + 1;
  });
});
// A letter travels along a path when a builder at work is using another home's finished work.
const letters = [];
JOBS.forEach((job) => {
  stat[job].now.forEach((s) => {
    (s.needIds || []).forEach((id) => {
      const other = stepOf(id);
      if (!other || !JOBS.includes(other.job) || other.job === job) return;
      if (!letters.some((x) => x.from === other.job && x.to === job)) {
        letters.push({ from: other.job, to: job });
      }
    });
  });
});
const edges = Object.entries(weight)
  .sort((a, b) => b[1] - a[1])
  .filter(([key], i) => i < 12 || letters.some((x) => pair(x.from, x.to) === key))
  .map(([key, w]) => ({ a: key.split('|')[0], b: key.split('|')[1], w }));
const partners = (job) =>
  edges
    .filter((e) => e.a === job || e.b === job)
    .map((e) => ({ job: e.a === job ? e.b : e.a, w: e.w }))
    .sort((x, y) => y.w - x.w);

// ---------- the top of the page ----------
const pill = preview
  ? ['go', 'Preview of a busy moment']
  : D.state === 'waiting-for-founder'
    ? ['wait', 'Waiting on you']
    : working
      ? ['go', 'The team is working (last save or check-in ' + ago(lastSign) + ')']
      : stale
        ? ['wait', 'This page is out of date: last refreshed ' + ago(D.generatedAt)]
        : quiet
          ? ['wait', 'Quiet: no saved work or check-in since ' + ago(lastSign)]
          : ['', 'Between runs: the next one starts by itself'];
$('pill').className = 'pill ' + pill[0];
$('pilltext').textContent = pill[1];
$('preview').hidden = !preview;
const stage = D.stages.find((s) => s.number === D.currentStage);
$('sub').textContent =
  'Stage ' + D.currentStage + (stage ? ': ' + stage.name : '') + ' · branch ' + D.branch;

// ---------- the village ----------
const W = 1240;
const H = 905;
const CX = 620;
const CY = 565;
const RX = 470;
const RY = 275;
const SCALE = 0.9;
const TOP = CY - RY;
const at = (job) => {
  const a = (SPOTS[job] * Math.PI) / 180;
  return [Math.round(CX + RX * Math.cos(a)), Math.round(CY + RY * Math.sin(a))];
};
// A path between two homes, bowed a little toward the middle of the village.
const chord = (from, to) => {
  const [ax, ay] = at(from);
  const [bx, by] = at(to);
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const cx = Math.round(mx + (CX - mx) * 0.35);
  const cy = Math.round(my + (CY + 30 - my) * 0.35);
  return `M${ax} ${ay - 6}Q${cx} ${cy} ${bx} ${by - 6}`;
};
const ring = `M${CX} ${TOP}a${RX} ${RY} 0 1 1 0 ${2 * RY}a${RX} ${RY} 0 1 1 0 ${-2 * RY}`;
const plate = (x, y, title, sub, colour, fraction) =>
  `<rect class="platebg" x="${x - 84}" y="${y + 5}" width="168" height="${fraction == null ? 36 : 41}" rx="11" style="stroke:${colour}"/>` +
  `<text class="t1" x="${x}" y="${y + 21}" text-anchor="middle">${esc(title)}</text>` +
  `<text class="t2" x="${x}" y="${y + 34}" text-anchor="middle">${esc(sub)}</text>` +
  (fraction == null
    ? ''
    : `<rect class="track" x="${x - 64}" y="${y + 38.5}" width="128" height="3" rx="1.5"/>` +
      `<rect x="${x - 64}" y="${y + 38.5}" width="${(128 * fraction).toFixed(1)}" height="3" rx="1.5" fill="${colour}"/>`);
// A step sign. It sits above a home with its tail pointing down, or below with its tail up.
const sign = (x, y, text, who, below) => {
  const width = Math.max(96, text.length * 7.3 + 28);
  return (
    `<g class="sign"><rect x="${x - width / 2}" y="${y - 13}" width="${width}" height="26" rx="13" fill="${who.c[0]}" stroke="${who.c[1]}" stroke-width="1.5"/>` +
    (below
      ? `<path d="M${x - 6} ${y - 12.5}l6-7 6 7z" fill="${who.c[0]}"/>`
      : `<path d="M${x - 6} ${y + 12.5}l6 7 6-7z" fill="${who.c[0]}"/>`) +
    `<text class="t3" x="${x}" y="${y + 4.5}" text-anchor="middle" fill="${who.ink}">${esc(text)}</text></g>`
  );
};
const short = (text, max) => (text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text);
const home = (job, label, inner) =>
  `<g class="home${inner.on ? ' on' : ''}" data-job="${job}" tabindex="0" role="button" aria-label="${esc(label)}"><title>${esc(label)}</title>${inner.html}</g>`;
// Little flags on a string between two points.
const bunting = (x1, y1, x2, y2, sag) => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + sag;
  let out = `<path class="flagline" d="M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}"/>`;
  const colours = JOBS.map((job) => CAST[job].c[0]);
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    const x = (1 - t) * (1 - t) * x1 + 2 * t * (1 - t) * mx + t * t * x2;
    const y = (1 - t) * (1 - t) * y1 + 2 * t * (1 - t) * my + t * t * y2;
    out += `<path class="flag" style="animation-delay:${-(i * 0.21).toFixed(2)}s" d="M${(x - 6).toFixed(1)} ${y.toFixed(1)}h12l-6 13z" fill="${colours[i % colours.length]}"/>`;
  }
  return out;
};

function drawVillage() {
  const day = working;
  const p = [];
  p.push(
    `<svg class="scene ${day ? 'day' : 'night'}" viewBox="0 0 ${W} ${H}" role="group" aria-label="The village: one home for each kind of job">`,
    `<defs><linearGradient id="skyDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd3ff"/><stop offset="1" stop-color="#e3f6ff"/></linearGradient>`,
    `<linearGradient id="skyNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1730"/><stop offset="1" stop-color="#27406b"/></linearGradient>`,
    `<linearGradient id="grassDay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd18a"/><stop offset="1" stop-color="#5fb36a"/></linearGradient>`,
    `<linearGradient id="grassNight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c5a4c"/><stop offset="1" stop-color="#1c3f38"/></linearGradient></defs>`,
    `<rect class="sky" width="${W}" height="300"/>`,
  );
  if (day) {
    let rays = '';
    for (let i = 0; i < 12; i++) {
      rays += `<path d="M0 -44V-58" stroke="#ffd34d" stroke-width="5" stroke-linecap="round" transform="rotate(${i * 30})"/>`;
    }
    p.push(
      `<g transform="translate(1100 92)"><g class="sunrays">${rays}</g><circle r="34" fill="#ffd34d"/><circle r="34" fill="#fff" opacity=".18"/></g>`,
    );
  } else {
    for (let i = 0; i < 34; i++) {
      p.push(
        `<circle class="star" cx="${(i * 197 + 40) % W}" cy="${14 + ((i * 83) % 210)}" r="${1.1 + (i % 3) * 0.5}" style="animation-delay:${-(i * 0.37).toFixed(2)}s"/>`,
      );
    }
    p.push(
      `<g transform="translate(1100 92)"><circle r="32" fill="#f4f1de"/><circle cx="-9" cy="-7" r="6" fill="#dcd8c0"/><circle cx="10" cy="9" r="4.5" fill="#dcd8c0"/><circle cx="8" cy="-13" r="3" fill="#dcd8c0"/></g>`,
    );
  }
  [
    [70, 1, 0],
    [128, 0.75, -34],
    [42, 0.6, -63],
  ].forEach(([y, size, delay]) => {
    p.push(
      `<g class="cloud" style="animation-delay:${delay}s"><g transform="translate(0 ${y}) scale(${size})"><ellipse cx="70" cy="30" rx="60" ry="22"/><ellipse cx="110" cy="18" rx="42" ry="24"/><ellipse cx="150" cy="32" rx="52" ry="20"/></g></g>`,
    );
  });
  p.push(
    `<path class="hill" d="M0 262q150-78 330-14t320-26 300 8 290-30v90h-1240z"/>`,
    `<path class="ground" d="M0 268q310-46 620-12t620-14v${H}h-1240z"/>`,
    `<ellipse class="plaza" cx="${CX}" cy="${CY + 4}" rx="205" ry="80"/>`,
    `<path class="road" d="${ring}"/><path class="roadline" d="${ring}"/>`,
  );
  edges.forEach((e) => {
    const live = letters.some((x) => pair(x.from, x.to) === pair(e.a, e.b));
    p.push(
      `<path class="chord${live ? ' live' : ''}" data-a="${e.a}" data-b="${e.b}" d="${chord(e.a, e.b)}" style="stroke-width:${(2 + Math.min(3.2, e.w * 0.35)).toFixed(1)}"><title>${esc(CAST[e.a].name + ' and ' + CAST[e.b].name + ': ' + e.w + (e.w === 1 ? ' step waits' : ' steps wait') + ' on the other')}</title></path>`,
    );
  });
  letters.forEach((x, i) => {
    p.push(
      `<g><rect x="-9" y="-6.5" width="18" height="13" rx="2" fill="#fff" stroke="#51607a" stroke-width="1.3"/><path d="M-9 -6.5l9 8 9-8" fill="none" stroke="#51607a" stroke-width="1.3"/>` +
        `<animateMotion dur="${6 + (i % 3)}s" begin="${-i * 1.7}s" repeatCount="indefinite" path="${chord(x.from, x.to)}"/></g>`,
    );
  });
  if (working) {
    for (let i = 0; i < 3; i++) {
      p.push(
        `<circle class="runner" r="6.5"><animateMotion dur="24s" begin="${-i * 8}s" repeatCount="indefinite" path="${ring}"/></circle>`,
      );
    }
  }
  p.push(bunting(CX, TOP - 186, 300, TOP - 96, 34), bunting(CX, TOP - 186, 940, TOP - 96, 34));

  // Buildings, drawn from the back of the village to the front.
  const things = [];
  const lead = CAST.lead;
  things.push({
    y: TOP,
    html: home('lead', "Leo's big top: the lead", {
      on: working,
      html:
        `<g class="lift"><g transform="translate(${CX - 120} ${TOP - 200})">${bigTop(...lead.c)}</g></g>` +
        crit('lead', working ? 'work' : 'idle', CX + 40, TOP - 76, 84) +
        plate(
          CX,
          TOP,
          'Leo · The lead',
          busy
            ? lanes.length + ' of ' + (D.laneCount || lanes.length) + ' desks busy'
            : working
              ? 'handing out work'
              : 'resting',
          lead.c[1],
          null,
        ),
    }),
  });
  JOBS.forEach((job) => {
    const who = CAST[job];
    const [x, y] = at(job);
    const mine = stat[job];
    const on = mine.now.length > 0;
    const first = mine.now[0];
    const label =
      who.name +
      "'s home, " +
      who.home +
      ': ' +
      who.job +
      '. ' +
      mine.done +
      ' of ' +
      mine.total +
      ' steps done.';
    const [sx, sy] = HOMES[job].smoke;
    things.push({
      y,
      html: home(job, label, {
        on,
        html:
          `<g class="lift"><g transform="translate(${x - 80 * SCALE} ${y - 170 * SCALE}) scale(${SCALE})">` +
          HOMES[job].draw(...who.c, mine) +
          `<g class="smoke" transform="translate(${sx} ${sy})"><circle r="6"/><circle r="6"/><circle r="6"/></g></g></g>` +
          crit(job, on ? 'work' : day ? 'idle' : 'sleep', x + 30, y - 52, 58) +
          plate(
            x,
            y,
            who.name + ' · ' + who.short,
            mine.done + ' of ' + mine.total + ' steps done',
            who.c[0],
            mine.total ? mine.done / mine.total : 0,
          ) +
          (on
            ? sign(
                x,
                // The two homes low on the sides carry their sign below, clear of the home above them.
                job === 'database' || job === 'checks' ? y + 64 : y - 170 * SCALE - 24,
                short(first.id + ' ' + first.name, 26) +
                  (mine.now.length > 1 ? '  +' + (mine.now.length - 1) : ''),
                who,
                job === 'database' || job === 'checks',
              )
            : ''),
      }),
    });
  });
  const base = CY + 6;
  things.push({
    y: base,
    html:
      home('inspector', "Rocky's checkpoint: every finished step is reviewed here", {
        on: busy,
        html:
          `<g class="lift"><g transform="translate(${CX - 158} ${base - 90})">${checkpoint}</g></g>` +
          crit('inspector', busy ? 'work' : day ? 'idle' : 'sleep', CX - 200, base - 50, 56) +
          plate(
            CX - 96,
            base,
            'Rocky · Reviewer',
            'checks every finished step',
            CAST.inspector.c[1],
            null,
          ),
      }) +
      home('vault', 'The vault: saved work', {
        on: working,
        html:
          `<g class="lift"><g transform="translate(${CX + 36} ${base - 100})">${vault}</g></g>` +
          plate(CX + 96, base, 'The vault', doneCount + ' steps saved', '#51607a', null),
      }),
  });
  things.sort((a, b) => a.y - b.y).forEach((thing) => p.push(thing.html));
  p.push('</svg>');
  $('scene').innerHTML = p.join('');
}
drawVillage();

// Leo's speech bubble.
const bubble = $('bubble');
const says = busy
  ? [
      'I brief every builder myself.',
      'I read every change before it is saved.',
      'Rocky reviews each step. He never reviews his own work.',
      'Nothing goes in the vault until the full check passes.',
      'When a desk frees up, the next step starts.',
    ]
  : working
    ? ['Checking what the last run left…', 'Handing out the next steps…']
    : stale
      ? [
          'This page has not been refreshed lately, so I cannot say what the team is doing right now.',
          'It refreshes every ten minutes while the Claude app is open and has usage left.',
        ]
      : quiet
        ? [
            'No saved work for a while. A long check may be running.',
            'If this run is stuck, the next one takes over by itself.',
          ]
        : D.state === 'waiting-for-founder'
          ? ['We need an answer from you. Click my tent to see what.']
          : ['Everyone is resting. The next run starts by itself in a few minutes.'];
let line = 0;
bubble.textContent = says[line++ % says.length];
if (says.length > 1) {
  setInterval(() => {
    bubble.style.opacity = 0;
    setTimeout(() => {
      bubble.textContent = says[line++ % says.length];
      bubble.style.opacity = 1;
    }, 350);
  }, 4200);
}
$('legend').textContent =
  'Each home is one kind of work. A dotted path joins two homes when one waits on the other’s work; a thicker path means more of it, and a letter travels along it when a builder is using another home’s finished work. The gold ring is Leo’s round: he briefs and checks every home. Click a home to see what is happening inside.';

// A little celebration when a step has been saved since this page was last looked at.
try {
  const key = 'srl-build-done';
  const before = JSON.parse(localStorage.getItem(key) || 'null');
  const now = all.filter((s) => s.state === 'done').map((s) => s.id);
  if (!preview) localStorage.setItem(key, JSON.stringify(now));
  const fresh = before ? now.filter((id) => !before.includes(id)) : [];
  if (fresh.length && !preview) {
    const step = stepOf(fresh[fresh.length - 1]);
    const toast = $('toast');
    toast.hidden = false;
    toast.textContent =
      'Saved: ' +
      step.id +
      ' ' +
      step.name +
      (fresh.length > 1 ? ' and ' + (fresh.length - 1) + ' more' : '');
    const colours = JOBS.map((job) => CAST[job].c[0]);
    for (let i = 0; i < 28; i++) {
      const bit = el('i', 'confetti');
      bit.style.left = 30 + ((i * 37) % 40) + '%';
      bit.style.background = colours[i % colours.length];
      bit.style.animationDelay = (i % 7) * 0.12 + 's';
      bit.style.setProperty('--dx', ((i % 9) - 4) * 22 + 'px');
      toast.parentNode.append(bit);
    }
  }
} catch {
  // No storage here (a private window, for example): skip the celebration.
}

// ---------- the panel under the village ----------
const detail = $('detail');
let picked = '';
const stepLink = (step, note) => {
  const b = el('button', 'steplink');
  b.append(
    el('b', '', step.id + ' '),
    document.createTextNode(step.name + (note ? ' · ' + note : '')),
  );
  b.onclick = () => showStep(step);
  return b;
};
const column2 = (title, nodes, empty) => {
  const box = el('div');
  box.append(el('h4', '', title));
  if (nodes.length) nodes.forEach((n) => box.append(n));
  else box.append(el('div', 'muted small', empty));
  return box;
};
function openPanel(key, mode, colour) {
  detail.innerHTML = '';
  detail.className = 'open';
  detail.style.setProperty('--c', colour);
  const text = el('div');
  text.style.flex = '1';
  detail.append(critter(key, 92, mode), text);
  return text;
}
function showStep(step) {
  const who = CAST[step.job] || CAST.groundwork;
  const mode = step.state === 'done' ? 'happy' : step.state === 'now' ? 'work' : 'idle';
  const text = openPanel(step.job, mode, who.c[0]);
  const verb =
    step.state === 'done'
      ? who.name + ' finished this'
      : step.state === 'now'
        ? who.name + ' is building this now'
        : who.name + ' will build this';
  text.append(el('span', 'muted small', verb), el('h3', '', step.id + ' ' + step.name));
  text.append(el('p', '', step.text));
  const lane = laneOf(step.id);
  [
    ['Right now', lane && step.state === 'now' ? doing(lane) : ''],
    ['Done when', step.test],
    ['Waits for', step.needs],
    ['AI model', step.model],
    ['From the spec', step.spec],
    ['What happened', step.note],
  ].forEach(([label, value]) => {
    if (!value) return;
    const para = el('p', 'small');
    para.append(el('b', '', label + ': '), document.createTextNode(value));
    text.append(para);
  });
  if (JOBS.includes(step.job)) {
    const back = el('button', 'link small', 'Back to ' + who.name + "'s home");
    back.onclick = () => showHome(step.job);
    text.append(el('p'), back);
  }
  detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function showHome(job) {
  const who = CAST[job];
  const mine = all.filter((s) => s.job === job);
  const now = stat[job].now;
  const text = openPanel(job, now.length ? 'work' : working ? 'idle' : 'sleep', who.c[0]);
  text.append(
    el('span', 'muted small', who.home + ' · ' + who.job),
    el('h3', '', who.name + ' the ' + who.animal),
    el('p', '', who.does),
  );
  const cols = el('div', 'cols');
  const ready = D.ready.map((r) => stepOf(r.id)).filter((s) => s && s.job === job);
  const later = mine.filter((s) => s.state === 'todo' && !ready.includes(s));
  const done = mine.filter((s) => s.state === 'done');
  cols.append(
    column2(
      'Building now',
      now.map((s) => stepLink(s, laneOf(s.id) ? doing(laneOf(s.id)) : '')),
      working ? 'Nothing at this moment' : 'Resting',
    ),
    column2(
      'Ready to start',
      ready.slice(0, 6).map((s) => stepLink(s)),
      'Nothing is ready yet',
    ),
    column2(
      'Still to come (' + later.length + ')',
      later.slice(0, 6).map((s) => stepLink(s)),
      'Nothing else planned',
    ),
    column2(
      'Finished (' + done.length + ')',
      done.slice(-6).map((s) => stepLink(s)),
      'Nothing finished yet',
    ),
    column2(
      'Works with',
      partners(job).map((x) =>
        el(
          'div',
          'small',
          CAST[x.job].name +
            ' (' +
            CAST[x.job].job.toLowerCase() +
            ') · ' +
            x.w +
            (x.w === 1 ? ' hand-off' : ' hand-offs'),
        ),
      ),
      'No shared work in the plans yet',
    ),
  );
  text.append(cols);
}
function showLead() {
  const text = openPanel('lead', working ? 'work' : 'idle', CAST.lead.c[0]);
  text.append(
    el('span', 'muted small', 'The Big Top · The lead'),
    el('h3', '', 'Leo the lion'),
    el('p', '', CAST.lead.does),
  );
  const cols = el('div', 'cols');
  const open = D.needs.filter((n) => !n.done);
  cols.append(
    column2(
      'At work now (' + lanes.length + (D.laneCount ? ' of ' + D.laneCount + ' desks' : '') + ')',
      busy
        ? lanes
            .map((l) => stepOf(l.id))
            .filter(Boolean)
            .map((s) => stepLink(s))
        : [],
      working ? 'Handing out work' : 'Nobody: the team is resting',
    ),
    column2(
      'Next in line',
      D.ready
        .map((r) => stepOf(r.id))
        .filter(Boolean)
        .slice(0, 8)
        .map((s) => stepLink(s)),
      'Nothing can start until something lands',
    ),
    column2(
      'Waiting on you (' + open.length + ')',
      open.slice(0, 3).map((n) => el('div', 'small', short(n.text, 150))),
      'Nothing right now',
    ),
  );
  text.append(cols);
}
function showReviewer() {
  const text = openPanel(
    'inspector',
    busy ? 'work' : working ? 'idle' : 'sleep',
    CAST.inspector.c[0],
  );
  text.append(
    el('span', 'muted small', 'The Checkpoint · The reviewer'),
    el('h3', '', 'Rocky the raccoon'),
    el('p', '', CAST.inspector.does),
    el(
      'p',
      'small',
      'Every step is reviewed by a fresh AI reviewer that did not build it and was not told how it was built. What he finds is fixed, or answered in writing, before the step is saved. He also reviews each whole stage at its end.',
    ),
  );
}
function showVault() {
  const text = openPanel('lead', 'happy', '#51607a');
  text.append(
    el('span', 'muted small', 'The vault · saved work'),
    el('h3', '', doneCount + ' steps saved'),
    el(
      'p',
      'small',
      'A step goes in the vault only after its full check passes and Rocky has reviewed it. Each one is saved under your name and pushed to GitHub.',
    ),
  );
  const list = el('ul');
  D.commits.slice(0, 8).forEach((c) => {
    const li = el('li', 'small');
    li.append(document.createTextNode(c.subject + ' '), el('code', '', clock(c.time)));
    list.append(li);
  });
  text.append(list);
}
function pick(job, quietly) {
  picked = picked === job && !quietly ? '' : job;
  const scene = document.querySelector('.scene');
  const pals = picked && JOBS.includes(picked) ? partners(picked).map((x) => x.job) : [];
  scene.classList.toggle('picking', Boolean(picked) && JOBS.includes(picked));
  document.querySelectorAll('.home').forEach((node) => {
    node.classList.toggle('sel', node.dataset.job === picked);
    node.classList.toggle(
      'pal',
      pals.includes(node.dataset.job) || !JOBS.includes(node.dataset.job),
    );
  });
  document.querySelectorAll('.chord').forEach((node) => {
    const mine = node.dataset.a === picked || node.dataset.b === picked;
    node.classList.toggle('hi', Boolean(picked) && mine);
    node.classList.toggle('dim', Boolean(picked) && JOBS.includes(picked) && !mine);
    node.style.stroke = picked && mine ? CAST[picked].c[0] : '';
  });
  if (!picked) {
    detail.className = '';
    return;
  }
  if (picked === 'lead') showLead();
  else if (picked === 'inspector') showReviewer();
  else if (picked === 'vault') showVault();
  else showHome(picked);
  if (!quietly) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
document.querySelectorAll('.home').forEach((node) => {
  node.addEventListener('click', () => pick(node.dataset.job));
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pick(node.dataset.job);
    }
  });
});

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

// ---------- every step, one by one ----------
function drawBoard(number) {
  $('lanes').innerHTML = '';
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('sel', Number(t.dataset.stage) === number);
  });
  const plan = plans.find((p) => p.number === number);
  if (!plan) return;
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
      chip.style.setProperty('--c', who.c[0]);
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
      chip.append(critter(step.job, 30, step.state === 'now' && busy ? 'work' : 'idle'), text);
      chip.onclick = () => showStep(step);
      chips.append(chip);
    });
    lane.append(left, chips);
    $('lanes').append(lane);
  });
}
plans.forEach((p) => {
  const steps = p.groups.flatMap((g) => g.steps);
  const done = steps.filter((s) => s.state === 'done').length;
  const tab = el('button', 'tab', 'Stage ' + p.number + ' · ' + done + '/' + steps.length);
  tab.dataset.stage = p.number;
  tab.onclick = () => drawBoard(p.number);
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
  '. It is rewritten every ten minutes and each time a step is saved, and reloads itself every minute. ' +
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

// Remember which home was open across the page's own reloads.
try {
  const saved = sessionStorage.getItem('srl-build-picked');
  if (saved && document.querySelector('.home[data-job="' + saved + '"]')) pick(saved, true);
} catch {
  // No storage: nothing to restore.
}
setInterval(() => {
  try {
    sessionStorage.setItem('srl-build-picked', picked);
  } catch {
    // No storage: the page just reloads without it.
  }
  location.reload();
}, 60000);
