// Shared by every page: escaping, API calls, live updates, dates and player names.
import { clockAt, formatClock, periodLabel } from '/js/engine.js';

export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** JSON in, JSON out. Status 0 means the server could not be reached at all. */
export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No connection to the stats server.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, res.status);
  return data;
}

/** A v4 UUID. `crypto.randomUUID` exists only on secure origins, which a phone on the gym network is not. */
export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Server time, estimated from the last response, so every device reads the same game clock. */
export const serverClock = {
  offset: 0,
  sync(serverTime) {
    if (Number.isFinite(serverTime)) this.offset = serverTime - Date.now();
  },
  now() {
    return Date.now() + this.offset;
  },
};

/**
 * Live updates from the server. Each named event calls its handler with the
 * data; the browser reconnects by itself, and `onStatus` hears about it.
 */
export function subscribe(query, handlers, onStatus = () => {}) {
  const source = new EventSource(`/api/stream${query}`);
  for (const [event, fn] of Object.entries(handlers))
    source.addEventListener(event, (e) => fn(JSON.parse(e.data)));
  source.onopen = () => onStatus(true);
  source.onerror = () => onStatus(false);
  return source;
}

let session = null;
/** Whether this device may score, and the addresses phones can watch on. */
export const getSession = () =>
  (session ??= api('/api/session').catch(() => ({ canScore: false })));

// Fixtures are in Houston, so they read in Central time wherever they are opened.
const TZ = 'America/Chicago';
const format = (options) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...options });
export const fmtDay = (iso) =>
  format({ weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso));
export const fmtTime = (iso) =>
  format({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const fmtLongDate = (iso) =>
  format({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(iso));

/** "#23 Yusuf", "#4" for a number alone, or the name alone. */
export function playerLabel(p) {
  if (!p) return 'Unknown player';
  if (p.jersey === '') return p.name;
  return p.name ? `#${p.jersey} ${p.name}` : `#${p.jersey}`;
}

/** By jersey: 00, 0, 1 … 99, then players with no number by name. */
export function sortPlayers(list) {
  const key = (p) => (p.jersey === '' ? [1, 0, 0] : [0, Number(p.jersey), -p.jersey.length]);
  return [...list].sort((a, b) => {
    const ka = key(a),
      kb = key(b);
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return a.name.localeCompare(b.name);
  });
}

/** Digits only, two at most; a third pushes the first out, so a box can be typed over. */
export const typedJersey = (raw) =>
  String(raw ?? '')
    .replace(/\D/g, '')
    .slice(-2);

/** The tracked team's side of a game, or home when neither is tracked. */
export const ourSide = (game) => (game.away.tracked && !game.home.tracked ? 'away' : 'home');

const GAME_TYPES = { exhibition: 'Exhibition', regular_season: 'Regular season' };
export const gameTypeLabel = (type) => GAME_TYPES[type] ?? type.replace(/_/g, ' ');

/** "Q2 · 3:41", "End of Q1", "Final" or "" for a game not started. */
export function gameClockText(game, now) {
  if (game.status === 'final') return 'Final';
  if (game.status === 'scheduled') return '';
  const clock = clockAt({ clock: game.clock }, now);
  const label = periodLabel(game.period, game.periods);
  if (clock.remainingMs === 0) {
    const half = game.periods === 4 && game.period === 2;
    return half || (game.periods === 2 && game.period === 1) ? 'Halftime' : `End of ${label}`;
  }
  return `${label} · ${formatClock(clock.remainingMs)}`;
}

/** The site header; with sign-in set up, it also signs scorers in and out. */
export function siteHeader(active, teamId, session = null) {
  const link = (href, label, key) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  const account = !session?.signIn
    ? ''
    : session.canScore
      ? '<button type="button" class="nav-button" data-sign-out>Sign out</button>'
      : active === 'sign-in'
        ? ''
        : link(`/sign-in?next=${encodeURIComponent(location.pathname)}`, 'Scorer sign-in', '');
  return `<a class="brand" href="/"><img src="/img/lions.png" alt="" /><span><strong>Al-Hadi Lions</strong><small>Varsity boys basketball · 2026–27</small></span></a>
    <nav aria-label="Site">${link('/', 'Schedule', 'schedule')}${teamId ? link(`/team/${teamId}`, 'Roster &amp; stats', 'team') : ''}${account}</nav>`;
}

document.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-sign-out]'))
    void api('/api/session', { method: 'DELETE' }).finally(() => location.reload());
});
