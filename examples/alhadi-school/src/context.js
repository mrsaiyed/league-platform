import D from '@demo/data';
import * as M from '@demo/domain';
const STORAGE = 'alhadi-concept-v2';
const seed = () => ({
  config: {
    color: '#96062d',
    awards: true,
    openGym: true,
    stats: true,
    capacity: 28,
    rosterMax: 7,
  },
  applications: structuredClone(D.applications),
  draft: { picks: [], paused: true, seconds: 60 },
  live: M.initialLive(D.players),
  schedule: null,
  schedulePublished: false,
  announcement: null,
  registration: null,
});
const state = { ...seed(), readNotifications: [], preferences: { reminders: true, reports: true } };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (saved && saved.config && saved.live) Object.assign(state, saved);
} catch {}
state.live.running = false;
state.draft.paused = true;
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const team = (id) => D.teams.find((t) => t.id === id);
const player = (id) => D.players.find((p) => p.id === id);
const initials = (name) =>
  name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('');
const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
function save() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
function toast(s) {
  $('#toast').textContent = s;
  $('#toast').classList.add('visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').classList.remove('visible'), 3300);
}

const ui = {
  route: '',
  scheduleWeek: 'all',
  scheduleTeam: 'all',
  appFilter: 'all',
  selectedPlayer: 'p0',
  scorerTeam: 'falcons',
  modalBack: null,
};
export { D, M, STORAGE, seed, state, ui, $, esc, team, player, initials, clock, save, toast };
