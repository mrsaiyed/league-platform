/**
 * Courtside live stat tracker, after the Faraj League tracker.
 *
 *  - Tap a player and their options open under their name: +1, +2, +3, Foul,
 *    −Foul (a foul found to be wrong later; Undo only reaches the last play) and
 *    TO, a turnover. Turnovers stay off the player tiles: each team's total sits
 *    in its title, and tapping it lists each player's, with − to take one back.
 *  - A bench player's options also say who they come on "In for", one button per
 *    player on the floor, so a substitution is two taps. Dragging a bench player
 *    onto whoever is coming off works too (Pointer Events, which iOS supports).
 *  - Until a team's starting lineup is set, tapping its players picks them.
 *  - "Players" opens a panel to add names and jersey numbers, both teams at once.
 *  - Each team's timeouts left sit in its title; tapped, they open to call a full
 *    or a 30-second one. A foul or a timeout stops the clock (the engine does it).
 *  - While the clock is stopped, a big Start clock button floats over the page, so
 *    play never runs on with the clock forgotten. Only the button takes taps: the
 *    players, subs and everything around it keep working, for free throws on a
 *    stopped clock. Its × hides it until the clock next stops.
 *
 * Every tap is a command saved to the database. It is applied here at once with
 * the same engine the server runs, held in an outbox in this browser until the
 * server confirms it, and resent in order after a refresh or a dropped
 * connection. The server ignores a command it has already taken.
 */
import {
  apply,
  bonusLabel,
  clockAt,
  derive,
  describePlay,
  formatClock,
  formatMinutes,
  periodLabel,
  periodOptions,
  runningScores,
  timeoutRules,
  HALVES,
  LINEUP_SIZE,
  NFHS_QUARTERS,
  QUARTERS,
  SIDES,
} from './engine.js';
import {
  api,
  esc,
  fmtDay,
  fmtTime,
  gameTypeLabel,
  getSession,
  here,
  link,
  pageId,
  playerLabel,
  serverClock,
  sortPlayers,
  subscribe,
  uuid,
} from './common.js';
import { rosterEditor } from './roster-editor.js';
import { playBonusHorn } from './sound.js';

const gameId = pageId();
const $ = (id) => document.getElementById(id);
const OUTBOX = `live-stats:outbox:${gameId}`;
/** Starting lineups being picked, kept so a refresh mid-pick keeps the taps. */
const PICKS = `live-stats:picks:${gameId}`;

/** A player's options: points first, they are the common case, then fouls and turnovers. */
const ACTIONS = [
  { act: 'p1', label: '+1', cls: 'lt-opt-score' },
  { act: 'p2', label: '+2', cls: 'lt-opt-score' },
  { act: 'p3', label: '+3', cls: 'lt-opt-score' },
  { act: 'foul', label: 'Foul', cls: 'lt-opt-foul' },
  { act: 'unfoul', label: '−Foul', cls: 'lt-opt-unfoul' },
  { act: 'to', label: 'TO', cls: 'lt-opt-to', title: 'Turnover' },
];

/** The server's latest copy: teams, players, state and revision. */
let game = null;
/** Commands not yet confirmed by the server, oldest first. */
let outbox = loadOutbox();
/** What is shown: the server's state with the outbox applied on top. */
let view = null;
let playerMap = new Map();
/** The player whose options are open under their tile, or null. */
let menuFor = null;
/** Starting lineups being picked, per side. */
const pending = loadPicks();
/** Which teams' turnover lists are open. */
const turnoversOpen = { home: false, away: false };
/** Which teams' timeout rows are open. */
const timeoutsOpen = { home: false, away: false };
/** The clock stop the scorer hid the Start clock button for; see `stopKey`. */
let goHiddenFor = null;

function loadPicks() {
  try {
    const saved = JSON.parse(localStorage.getItem(PICKS) || '{}');
    const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    return { home: list(saved?.home), away: list(saved?.away) };
  } catch {
    return { home: [], away: [] };
  }
}
function savePicks() {
  try {
    if (pending.home.length || pending.away.length)
      localStorage.setItem(PICKS, JSON.stringify(pending));
    else localStorage.removeItem(PICKS);
  } catch {
    // Picks are a convenience; the lineup itself is saved when it is set.
  }
}

function loadOutbox() {
  try {
    const saved = JSON.parse(localStorage.getItem(OUTBOX) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}
function saveOutbox() {
  try {
    if (outbox.length) localStorage.setItem(OUTBOX, JSON.stringify(outbox));
    else localStorage.removeItem(OUTBOX);
  } catch {
    // Private mode or full storage: the game still works, just not across a refresh.
  }
}

// ---- names -----------------------------------------------------------------
const label = (id) => playerLabel(playerMap.get(id));
/** "#23 Yusuf": number and first name, for the tight "In for" buttons. */
function shortLabel(id) {
  const p = playerMap.get(id);
  if (!p) return '?';
  const first = p.name.split(' ')[0];
  return p.jersey !== '' ? `#${p.jersey}${first ? ` ${first}` : ''}` : first;
}
const describe = (play) => describePlay(play, label, (side) => game[side].name, view.rules.periods);
const colorOf = (side) => ((side === 'home') !== view.colorsSwapped ? 'light' : 'dark');

// ---- syncing with the server ----------------------------------------------
function adopt(payload) {
  if (!game || payload.revision >= game.revision) {
    game = payload;
    playerMap = new Map(payload.players.map((p) => [p.id, p]));
    serverClock.sync(payload.serverTime);
  }
  const taken = new Set(game.state.recent);
  const left = outbox.filter((c) => !taken.has(c.commandId));
  if (left.length !== outbox.length) {
    outbox = left;
    saveOutbox();
  }
  recompute();
}

function recompute() {
  let state = game.state;
  const kept = [];
  for (const c of outbox) {
    try {
      state = apply(state, c.input, { id: c.commandId, now: c.at });
      kept.push(c);
    } catch (err) {
      // The server would refuse it too, against what it now holds.
      flash(`Not saved: ${err.message}`);
    }
  }
  if (kept.length !== outbox.length) {
    outbox = kept;
    saveOutbox();
  }
  view = state;
  render();
}

/** Record an action: shown now, saved as soon as the server can take it. */
function perform(input) {
  if (!view) return false;
  const command = { commandId: uuid(), at: Math.round(serverClock.now()), input };
  try {
    apply(view, input, { id: command.commandId, now: command.at });
  } catch (err) {
    flash(err.message);
    return false;
  }
  outbox.push(command);
  saveOutbox();
  recompute();
  void pump();
  return true;
}

let sending = false;
let offline = false;
/** The scorer's sign-in ran out: keep every tap here until they sign in again. */
let signedOut = false;
/** The server would not take scoring from this device; the reason, kept until it does. */
let blocked = '';
let retryTimer = null;
let retryDelay = 1000;
let savedAt = null;
/**
 * Answers that mean the action itself can never be saved: the rules refuse it, or
 * the game is gone. Only these drop a tap. Anything else (no answer, a timeout, a
 * server or database hiccup, a sign-in or permission problem) keeps it on this
 * device and tries again, so a tap is never lost to a bad moment.
 */
const REFUSED = new Set([400, 404, 409, 413, 415, 422]);

/** Send the outbox to the server, one command at a time, in order. */
async function pump() {
  if (sending) return;
  clearTimeout(retryTimer);
  sending = true;
  while (outbox.length) {
    const command = outbox[0];
    syncLine();
    try {
      const payload = await api(`/api/games/${gameId}/commands`, { method: 'POST', body: command });
      offline = false;
      signedOut = false;
      blocked = '';
      retryDelay = 1000;
      savedAt = new Date();
      outbox = outbox.filter((c) => c.commandId !== command.commandId);
      saveOutbox();
      adopt(payload);
    } catch (err) {
      if (err.status === 401) {
        signedOut = true;
        break;
      }
      if (!REFUSED.has(err.status)) {
        // No answer, a server or database hiccup, or not allowed right now: keep it
        // and try again shortly. The server ignores a repeat it already saved.
        offline = err.status === 0 || err.status >= 500;
        blocked = offline ? '' : err.message;
        retryTimer = setTimeout(() => void pump(), retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15_000);
        break;
      }
      outbox = outbox.filter((c) => c.commandId !== command.commandId);
      saveOutbox();
      flash(`Not saved: ${err.message}`);
      await refresh();
    }
  }
  sending = false;
  syncLine();
}

async function refresh() {
  try {
    adopt(await api(`/api/games/${gameId}`));
  } catch {
    // The live stream will bring it when the server is back.
  }
}

function syncLine() {
  const el = $('lt-sync');
  const waiting = `${outbox.length} ${outbox.length === 1 ? 'action' : 'actions'}`;
  let kind = '',
    text;
  if (signedOut && outbox.length) {
    // Signing in comes back here, and the waiting taps send themselves.
    el.className = 'lt-sync lt-sync-offline';
    el.innerHTML = `Signed out — ${waiting} kept on this device. <a class="lt-link" href="${esc(link.signIn(here()))}">Sign in to send them</a>`;
    return;
  }
  if (offline && outbox.length) {
    kind = 'offline';
    text = `Not connected — ${waiting} kept on this device and sent when the connection is back.`;
  } else if (blocked && outbox.length) {
    kind = 'offline';
    text = `Not saved yet — ${blocked} ${waiting} kept on this device; trying again.`;
  } else if (outbox.length) {
    kind = 'saving';
    text = 'Saving…';
  } else if (savedAt) {
    kind = 'saved';
    text = `Saved to the database · ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
  } else text = game?.revision ? 'Everything is saved.' : 'Nothing recorded yet.';
  el.className = `lt-sync${kind ? ` lt-sync-${kind}` : ''}`;
  el.textContent = text;
}

// ---- rendering -------------------------------------------------------------
/** Side → bonus level on screen; the horn sounds only when it rises. */
const bonusShown = {};
/** Seeded by the first paint, so opening a game already in the bonus stays quiet. */
let bonusPrimed = false;
let shownRunning = false;
let periodKey = '';

function visibleRoster(side, d) {
  const teamId = game[side].id;
  return sortPlayers(
    game.players.filter(
      (p) =>
        p.teamId === teamId &&
        (p.active || d.players[p.id] || d.teams[side].onCourt.includes(p.id)),
    ),
  );
}

function tile(p, side, d, { onCourt, floor = [], picking = false }) {
  const line = d.players[p.id];
  const fouls = line?.fouls ?? 0;
  const open = menuFor === p.id;
  const picked = picking && pending[side].includes(p.id);
  return `<div class="lt-slot${open ? ' lt-slot-open' : ''}">
    <button type="button" class="lt-player ${onCourt ? 'lt-on-court' : 'lt-bench-chip'}${fouls >= 5 ? ' lt-fouled-out' : ''}${open ? ' lt-menu-open' : ''}${picked ? ' lt-picked' : ''}"
      data-player="${esc(p.id)}" data-team="${side}" data-oncourt="${onCourt ? 1 : 0}" aria-expanded="${open}">
      <span class="lt-player-num${p.jersey === '' ? ' lt-player-num-none' : ''}">${p.jersey === '' ? '–' : esc(p.jersey)}</span>
      <span class="lt-player-name">${esc(p.name)}</span>
      <span class="lt-player-stats"><span class="lt-fouls">${fouls}F</span><span class="lt-pts">${line?.points ?? 0} pts</span></span>
      <span class="lt-player-mins" data-mins-for="${esc(p.id)}">${formatMinutes(line?.ms ?? 0)}</span>
    </button>
    ${open ? menu(p, side, fouls, onCourt, floor) : ''}
  </div>`;
}

/** +1 +2 +3 Foul −Foul, and for a bench player who they come on for. */
function menu(p, side, fouls, onCourt, floor) {
  const who = `data-player="${esc(p.id)}" data-team="${side}"`;
  const subs =
    onCourt || !floor.length
      ? ''
      : `<div class="lt-menu-row"><span class="lt-menu-label">In for</span>${floor
          .map(
            (id) =>
              `<button type="button" class="lt-opt lt-opt-sub" data-act="sub" ${who} data-out="${esc(id)}">${esc(shortLabel(id))}</button>`,
          )
          .join('')}</div>`;
  const button = (a) =>
    `<button type="button" class="lt-opt ${a.cls}" data-act="${a.act}" ${who}${a.title ? ` title="${esc(a.title)}" aria-label="${esc(a.title)}"` : ''}${a.act === 'unfoul' && !fouls ? ' disabled' : ''}>${esc(a.label)}</button>`;
  const group = (acts) =>
    `<div class="lt-menu-row">${ACTIONS.filter((a) => acts.includes(a.act))
      .map(button)
      .join('')}</div>`;
  return `<div class="lt-menu" aria-label="${esc(label(p.id))}">${subs}<div class="lt-menu-acts">${group(['p1', 'p2', 'p3'])}${group(['foul', 'unfoul', 'to'])}</div></div>`;
}

function renderCourt(side, d) {
  const roster = visibleRoster(side, d);
  const onCourt = d.teams[side].onCourt;
  const floor = $(`lt-floor-${side}`),
    bench = $(`lt-bench-${side}`);
  if (!roster.length) {
    floor.innerHTML = `<div class="lt-pick">No ${esc(game[side].name)} players yet.<button type="button" class="lt-btn lt-btn-save" data-add-players="${side}">Add players</button></div>`;
    bench.innerHTML = '<span class="lt-empty">Add names and jersey numbers to start.</span>';
    return;
  }
  // Picks kept from before a refresh: only players still on this roster, and none
  // once the lineup is set (perhaps from another device).
  const keep = onCourt.length ? [] : pending[side].filter((id) => roster.some((p) => p.id === id));
  if (keep.length !== pending[side].length) {
    pending[side] = keep;
    savePicks();
  }
  if (!onCourt.length) {
    const picked = pending[side].length;
    floor.innerHTML = `<div class="lt-pick">${
      picked
        ? `${picked} of ${LINEUP_SIZE} picked.`
        : `Pick the starting ${LINEUP_SIZE} — tap players below.`
    }${picked ? `<button type="button" class="lt-btn" data-set-lineup="${side}">Start with ${picked}</button>` : ''}</div>`;
    bench.innerHTML = roster
      .map((p) => tile(p, side, d, { onCourt: false, picking: true }))
      .join('');
    return;
  }
  floor.innerHTML = onCourt
    .map((id) => playerMap.get(id))
    .filter(Boolean)
    .map((p) => tile(p, side, d, { onCourt: true, floor: onCourt }))
    .join('');
  bench.innerHTML =
    roster
      .filter((p) => !onCourt.includes(p.id))
      .map((p) => tile(p, side, d, { onCourt: false, floor: onCourt }))
      .join('') || '<span class="lt-empty">Everyone is on the floor.</span>';
}

function render() {
  if (!view) return;
  const clock = clockAt(view, serverClock.now());
  const d = derive(view, clock.elapsedMs);
  const final = view.status === 'final';

  for (const side of SIDES) {
    document
      .querySelectorAll(`.lt-court[data-side="${side}"], .lt-team-score[data-side="${side}"]`)
      .forEach((el) => (el.dataset.color = colorOf(side)));
    $(`lt-name-${side}`).textContent = game[side].name;
    $(`lt-court-name-${side}`).textContent = game[side].name;
    $(`lt-score-${side}`).textContent = d.teams[side].score;
    const t = d.teams[side];
    const fouls = $(`lt-fouls-${side}`);
    fouls.textContent = t.periodFouls
      ? `${t.periodFouls} team foul${t.periodFouls === 1 ? '' : 's'}`
      : '';
    fouls.classList.toggle('lt-fouls-bonus', t.penalty === 1);
    fouls.classList.toggle('lt-fouls-double', t.penalty === 2);
    renderTimeouts(side, d, final);
    renderTurnovers(side, d, final);
    const bonus = $(`lt-bonus-${side}`);
    bonus.textContent = bonusLabel(t.bonus);
    bonus.hidden = !t.bonus;
    bonus.classList.toggle('lt-bonus-double', t.bonus === 2);
    const was = bonusShown[side] ?? 0;
    bonusShown[side] = t.bonus;
    if (bonusPrimed && t.bonus > was) {
      playBonusHorn(t.bonus);
      // Say it as well as sound it: a muted tablet is the normal case in a gym.
      flash(`${game[side].name} — ${bonusLabel(t.bonus)}.`);
    }
    renderCourt(side, d);
  }
  bonusPrimed = true;

  paintClock(clock);
  shownRunning = clock.running;
  const startStop = $('lt-startstop');
  startStop.textContent = clock.running ? 'Pause' : 'Start';
  startStop.classList.toggle('lt-btn-go', !clock.running);
  startStop.classList.toggle('lt-btn-stop', clock.running);
  startStop.disabled = final || (!clock.running && clock.remainingMs <= 0);
  startStop.title =
    !clock.running && clock.remainingMs <= 0 ? 'Period over: pick the next period' : '';
  renderGo(clock, d);

  // Only rebuilt when the options change, so an open picker is never yanked shut.
  const options = periodOptions(view.rules, d.period);
  const key = options.map((o) => o.label).join();
  const select = $('lt-period');
  if (key !== periodKey) {
    periodKey = key;
    select.innerHTML = options
      .map((o) => `<option value="${o.value}">${esc(o.label)}</option>`)
      .join('');
  }
  select.value = String(d.period);
  select.disabled = final;

  $('lt-undo').disabled = final || !view.plays.length;
  $('lt-redo').disabled = final || !view.redo.length;
  const last = view.plays.at(-1);
  $('lt-undo').title = last ? `Undo: ${describe(last)}` : 'Nothing to undo';
  $('lt-format').disabled = final || view.plays.length > 0 || view.clock.elapsedMs > 0;
  $('lt-reset').disabled =
    view.status === 'scheduled' && !view.plays.length && !view.clock.elapsedMs;
  $('lt-end').hidden = final;
  $('lt-final').hidden = !final;
  $('lt-clock').disabled = final;

  renderBadge();
  renderLog();
  placeMenu();
  syncLine();
}

/** A clock stop: when the clock stopped and in which period. A new one shows the Start button again. */
const stopKey = (d) => `${view.clock.anchorAt}|${d.period}`;

/**
 * The big Start clock button, while the clock is stopped with time left in a game
 * under way (or both starting fives set, for the tip-off), until the scorer hides it.
 */
function renderGo(clock, d) {
  const ready = view.status === 'live' || SIDES.every((side) => d.teams[side].onCourt.length > 0);
  const show =
    view.status !== 'final' &&
    !clock.running &&
    clock.remainingMs > 0 &&
    ready &&
    !drawerOpen &&
    goHiddenFor !== stopKey(d);
  const go = $('lt-go');
  go.hidden = !show;
  document.body.classList.toggle('lt-go-shown', show);
  if (!show) return;
  $('lt-go-title').textContent =
    view.status === 'scheduled' ? 'Start clock · tip-off' : 'Start clock';
  $('lt-go-when').textContent =
    `${periodLabel(d.period, view.rules.periods)} · ${formatClock(clock.remainingMs)}`;
  $('lt-go-note').textContent = `${stopReason(clock, d)} Stats and subs still work; × hides this.`;
}

/** Why the clock is stopped, as far as the plays tell. */
function stopReason(clock, d) {
  if (view.status === 'scheduled') return 'Start it at the tip.';
  const last = view.plays.at(-1);
  // The play that stopped the clock carries the moment it did, which the clock keeps.
  const stopper = view.plays.findLast((p) => p.stoppedClock);
  if (stopper && stopper.at === view.clock.anchorAt)
    return stopper.type === 'foul'
      ? `Stopped for a foul on ${label(stopper.playerId)}.`
      : `Stopped for a ${game[stopper.side].name} timeout.`;
  if (last?.type === 'period' && last.clockMs === clock.remainingMs)
    return `Start of ${periodLabel(d.period, view.rules.periods)}.`;
  return 'The clock is stopped.';
}

/** "3 full and 2 30-second a game · 1 more each overtime · none carried over". */
function timeoutRulesText(rules) {
  const t = timeoutRules(rules);
  const allowed = [
    t.fullTimeouts ? `${t.fullTimeouts} full` : '',
    t.shortTimeouts ? `${t.shortTimeouts} 30-second` : '',
  ].filter(Boolean);
  return [
    `${allowed.join(' and ') || 'None'} a ${t.timeoutsPer}`,
    t.overtimeTimeouts ? `${t.overtimeTimeouts} more each overtime` : 'none in overtime',
    t.timeoutsCarry ? 'unused carry over' : 'none carried over',
  ].join(' · ');
}

/**
 * The team's timeouts left in its title. Tapped, it opens to call a full or a
 * 30-second one, lists those taken, and takes back the latest.
 */
function renderTimeouts(side, d, final) {
  const t = timeoutRules(view.rules);
  const left = d.teams[side].timeoutsLeft;
  const total = Math.max(0, left.full) + Math.max(0, left.short);
  const open = timeoutsOpen[side];
  const toggle = $(`lt-tmo-${side}`);
  toggle.textContent = `${total ? `${total} ${total === 1 ? 'timeout' : 'timeouts'} left` : 'No timeouts left'} ${open ? '▴' : '▾'}`;
  toggle.classList.toggle('lt-tmo-none', !total);
  toggle.setAttribute('aria-expanded', String(open));
  const list = $(`lt-tmo-list-${side}`);
  list.hidden = !open;
  if (!open) return;
  // Each one taken, with when: rebuilt from the plays, as the engine counts them.
  const taken = [];
  for (const p of view.plays) {
    if (p.side !== side) continue;
    if (p.type === 'timeout') taken.push(p);
    else if (p.type === 'untimeout') taken.pop();
  }
  const off = final ? ' disabled' : '';
  const call = (seconds, name, n) =>
    `<button type="button" class="lt-opt lt-opt-tmo${n > 0 ? '' : ' lt-opt-tmo-none'}" data-act="timeout" data-team="${side}" data-seconds="${seconds}"${off}>${name}<small>${n > 0 ? `${n} left` : 'none left'}</small></button>`;
  const shortUsed = taken.some((p) => p.seconds === 30);
  const items = taken.map(
    (p) =>
      `<span class="lt-to-item"><span class="lt-to-who">${esc(periodLabel(p.period, view.rules.periods))} ${esc(formatClock(p.clockMs))}</span><b>${p.seconds === 30 ? '30s' : 'Full'}</b></span>`,
  );
  list.innerHTML = `<div class="lt-tmo-calls">${call(60, 'Full timeout', left.full)}${t.shortTimeouts || shortUsed ? call(30, '30-second', left.short) : ''}</div>${
    items.length
      ? `<div class="lt-tmo-taken"><span class="lt-menu-label">Taken</span>${items.join('')}<button type="button" class="lt-opt lt-opt-unto" data-act="untimeout" data-team="${side}" title="Take back the latest timeout" aria-label="Take back ${esc(game[side].name)}'s latest timeout"${off}>−</button></div>`
      : ''
  }<div class="lt-tmo-rule">${esc(timeoutRulesText(view.rules))}</div>`;
}

/**
 * The team's turnovers in its title, the sum of its players'. Tapped, it lists
 * each player's, most first, with − to take one back.
 */
function renderTurnovers(side, d, final) {
  const total = d.teams[side].turnovers;
  const toggle = $(`lt-to-${side}`);
  const open = turnoversOpen[side];
  toggle.textContent = `${total} ${total === 1 ? 'turnover' : 'turnovers'} ${open ? '▴' : '▾'}`;
  toggle.setAttribute('aria-expanded', String(open));
  const list = $(`lt-to-list-${side}`);
  list.hidden = !open;
  if (!open) return;
  const byJersey = sortPlayers(
    Object.keys(d.players)
      .map((id) => playerMap.get(id))
      .filter(Boolean),
  ).map((p) => p.id);
  const charged = Object.entries(d.players)
    .filter(([id, l]) => l.side === side && l.turnovers > 0 && playerMap.has(id))
    .sort(
      ([a, x], [b, y]) => y.turnovers - x.turnovers || byJersey.indexOf(a) - byJersey.indexOf(b),
    );
  const off = final ? ' disabled' : '';
  const take = (attrs, who) =>
    `<button type="button" class="lt-opt lt-opt-unto" ${attrs} data-team="${side}" title="Take back one turnover" aria-label="Take back one turnover from ${esc(who)}"${off}>−</button>`;
  const items = charged.map(
    ([id, l]) =>
      `<span class="lt-to-item"><span class="lt-to-who">${esc(shortLabel(id))}</span><b>${l.turnovers}</b>${take(`data-act="unto" data-player="${esc(id)}"`, label(id))}</span>`,
  );
  // Charged to the team rather than a player: a shot-clock or 5-second violation, say.
  const team = d.teams[side].teamTurnovers;
  if (team)
    items.push(
      `<span class="lt-to-item lt-to-team"><span class="lt-to-who">Team</span><b>${team}</b>${take('data-act="unteamto"', `${game[side].name}, the team`)}</span>`,
    );
  list.innerHTML = `${items.join('') || '<span class="lt-empty">No turnovers yet. Tap a player, then TO.</span>'}<button type="button" class="lt-opt lt-opt-teamto" data-act="teamto" data-team="${side}" title="A turnover not charged to a player, such as a shot-clock violation"${off}>+ Team turnover</button>`;
}

function renderLog() {
  const scores = runningScores(view.plays);
  const unsaved = new Set(outbox.map((c) => c.commandId));
  // Every play, newest first; the box scrolls. Plays still on their way to the server are dimmed.
  const rows = view.plays.map((play, i) => ({ play, score: scores[i] })).reverse();
  const saving = view.plays.filter((p) => unsaved.has(p.id)).length;
  $('lt-log-count').textContent = rows.length
    ? `${rows.length} ${rows.length === 1 ? 'play' : 'plays'} · ${saving ? `${saving} saving` : 'all saved'}`
    : '';
  $('lt-log').innerHTML = rows.length
    ? rows
        .map(
          ({ play, score }) =>
            `<div class="lt-log-row${unsaved.has(play.id) ? ' lt-log-pending' : ''}"><span class="lt-log-clock">${esc(periodLabel(play.period, view.rules.periods))} ${esc(formatClock(play.clockMs))}</span><span>${esc(describe(play))}</span>${play.type === 'score' ? `<span class="lt-log-score">${score.home}–${score.away}</span>` : ''}</div>`,
        )
        .join('')
    : '<div class="lt-empty">Nothing recorded yet.</div>';
}

function renderBadge() {
  const teams = SIDES.map((side) =>
    game.players.filter((p) => p.teamId === game[side].id && p.active),
  );
  const empty = teams.some((list) => !list.length);
  const missing = teams.flat().filter((p) => p.jersey === '').length;
  const badge = $('lt-players-badge');
  badge.hidden = !empty && !missing;
  badge.textContent = empty ? '!' : String(missing);
  badge.classList.toggle('lt-badge-warn', empty);
  $('lt-players').title = empty
    ? 'A team has no players yet'
    : missing
      ? `${missing} ${missing === 1 ? 'player has' : 'players have'} no jersey number`
      : 'Add players and jersey numbers';

  // Until the game starts: check both teams' numbers, then the starting fives and the clock.
  const pregame = $('lt-pregame');
  pregame.hidden = view.status !== 'scheduled';
  if (!pregame.hidden)
    $('lt-pregame-text').textContent = `${SIDES.map(
      (side, i) =>
        `${game[side].name}: ${teams[i].length} ${teams[i].length === 1 ? 'player' : 'players'}`,
    ).join(
      ' · ',
    )}. Check both teams' jersey numbers, tap each starting five, then start the clock.`;
}

function paintClock(clock) {
  const el = $('lt-clock');
  el.textContent = formatClock(clock.remainingMs);
  el.classList.toggle('lt-clock-zero', clock.remainingMs === 0);
}

/** Every quarter second: the clock and minutes, without rebuilding the tiles. */
setInterval(() => {
  if (!view?.clock.running) return;
  const clock = clockAt(view, serverClock.now());
  paintClock(clock);
  const d = derive(view, clock.elapsedMs);
  for (const el of document.querySelectorAll('[data-mins-for]'))
    el.textContent = formatMinutes(d.players[el.dataset.minsFor]?.ms ?? 0);
  if (shownRunning && !clock.running) {
    const label = periodLabel(d.period, view.rules.periods);
    const half = d.period === view.rules.periods / 2;
    flash(half ? 'Halftime.' : `End of ${label}.`);
    render();
  }
}, 250);

/** Keep the open options inside their court and in view. */
function placeMenu() {
  const el = document.querySelector('.lt-menu');
  if (!el) {
    menuFor = null;
    return;
  }
  const court = el.closest('.lt-court');
  el.style.maxWidth = `${Math.min(440, court.clientWidth - 12)}px`;
  el.style.setProperty('--nudge', '0px');
  const c = court.getBoundingClientRect(),
    m = el.getBoundingClientRect();
  let dx = 0;
  if (m.left < c.left + 6) dx = c.left + 6 - m.left;
  else if (m.right > c.right - 6) dx = c.right - 6 - m.right;
  if (dx) el.style.setProperty('--nudge', `${dx}px`);
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

let flashTimer = null;
function flash(text) {
  const el = $('lt-msg');
  el.textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (el.textContent = ''), 3200);
}

// ---- taps ------------------------------------------------------------------
/** Picks the starting lineup until it is set, then opens the player's options. */
function onPlayerTap(id, side) {
  if (view.status === 'final') return flash('This game is final. Reopen it to make changes.');
  if (!derive(view).teams[side].onCourt.length) {
    const picked = pending[side];
    pending[side] = picked.includes(id)
      ? picked.filter((x) => x !== id)
      : [...picked, id].slice(0, LINEUP_SIZE);
    savePicks();
    if (pending[side].length === LINEUP_SIZE) setLineup(side);
    else render();
    return;
  }
  menuFor = menuFor === id ? null : id;
  render();
}

function setLineup(side) {
  const playerIds = pending[side];
  pending[side] = [];
  savePicks();
  if (!perform({ type: 'lineup', side, playerIds })) render();
}

function onAction(btn) {
  if (btn.disabled) return;
  const { act, player, team: side, out } = btn.dataset;
  menuFor = null;
  // A foul or a timeout stops a running clock; say so, since it changes what comes next.
  const stops = clockAt(view, serverClock.now()).running ? ' Clock stopped.' : '';
  if (act === 'p1' || act === 'p2' || act === 'p3')
    perform({ type: 'score', side, playerId: player, points: Number(act.slice(1)) });
  else if (act === 'foul') {
    // Said first, so the bonus this foul may bring is said over it; the Start clock
    // button still shows the clock stopped.
    if (stops) flash(`Foul — ${label(player)}.${stops}`);
    perform({ type: 'foul', side, playerId: player });
  } else if (act === 'unfoul') perform({ type: 'unfoul', side, playerId: player });
  else if (act === 'timeout') {
    const seconds = Number(btn.dataset.seconds);
    const kind = seconds === 30 ? '30-second' : 'full';
    const left = derive(view).teams[side].timeoutsLeft[seconds === 30 ? 'short' : 'full'];
    if (
      left <= 0 &&
      !confirm(
        `${game[side].name} has no ${kind} timeouts left. Officials charge a technical foul for an extra one.\n\nRecord it anyway?`,
      )
    )
      return render();
    if (perform({ type: 'timeout', side, seconds })) {
      timeoutsOpen[side] = false;
      flash(`${seconds === 30 ? '30-second' : 'Full'} timeout — ${game[side].name}.${stops}`);
    }
  } else if (act === 'untimeout') {
    if (perform({ type: 'untimeout', side })) flash(`Timeout taken back — ${game[side].name}.`);
  } else if (act === 'to') {
    if (perform({ type: 'turnover', side, playerId: player }))
      flash(`Turnover — ${label(player)}.`);
  } else if (act === 'unto') perform({ type: 'unturnover', side, playerId: player });
  else if (act === 'teamto') {
    if (perform({ type: 'team-turnover', side })) flash(`Team turnover — ${game[side].name}.`);
  } else if (act === 'unteamto') perform({ type: 'team-unturnover', side });
  else if (act === 'sub') perform({ type: 'sub', side, inId: player, outId: out });
  render();
}

// Pointer-based, for touch, pen and mouse alike. A press that never moves far is a
// tap; one that does is a drag, which drops a bench player onto whoever comes off.
const panel = $('lt-panel');
let drag = null;
panel.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('.lt-opt')) return;
  const src = e.target.closest('.lt-player');
  if (src) drag = { src, x: e.clientX, y: e.clientY, moved: false, ghost: null };
});
panel.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'lt-ghost';
    drag.ghost.textContent = label(drag.src.dataset.player);
    document.body.appendChild(drag.ghost);
  }
  e.preventDefault();
  drag.ghost.style.left = `${e.clientX}px`;
  drag.ghost.style.top = `${e.clientY}px`;
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lt-player');
  for (const el of panel.querySelectorAll('.lt-player'))
    el.classList.toggle('lt-drop-target', el === over);
});
panel.addEventListener('pointerup', (e) => {
  const opt = e.target.closest('.lt-opt');
  if (opt && !drag) return onAction(opt);
  if (!drag) {
    // A tap anywhere else closes the options.
    if (menuFor && !e.target.closest('.lt-menu')) {
      menuFor = null;
      render();
    }
    return;
  }
  const { src, moved, ghost } = drag;
  drag = null;
  ghost?.remove();
  for (const el of panel.querySelectorAll('.lt-drop-target')) el.classList.remove('lt-drop-target');
  if (!moved) return onPlayerTap(src.dataset.player, src.dataset.team);
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lt-player');
  if (!target) return;
  if (src.dataset.team !== target.dataset.team)
    return flash('Substitutions have to stay within one team.');
  if (src.dataset.oncourt === '1' || target.dataset.oncourt !== '1')
    return flash('Drag a bench player onto someone on the floor.');
  menuFor = null;
  perform({
    type: 'sub',
    side: target.dataset.team,
    inId: src.dataset.player,
    outId: target.dataset.player,
  });
});
panel.addEventListener('pointercancel', () => {
  drag?.ghost?.remove();
  drag = null;
});

// Keyboard: Enter or Space on a player or an option does what a tap does (a click
// with no pointer behind it), and Escape closes the options. Focus goes back to
// where the next key belongs, since every action repaints the tiles.
const focusTile = (id) =>
  panel.querySelector(`.lt-player[data-player="${CSS.escape(id)}"]`)?.focus();
panel.addEventListener('click', (e) => {
  const addPlayers = e.target.closest('[data-add-players]');
  if (addPlayers) return openPlayers(addPlayers.dataset.addPlayers);
  const lineup = e.target.closest('[data-set-lineup]');
  if (lineup) return setLineup(lineup.dataset.setLineup);
  const turnovers = e.target.closest('[data-to-side]');
  if (turnovers) {
    const side = turnovers.dataset.toSide;
    turnoversOpen[side] = !turnoversOpen[side];
    return render();
  }
  const timeouts = e.target.closest('[data-tmo-side]');
  if (timeouts) {
    const side = timeouts.dataset.tmoSide;
    timeoutsOpen[side] = !timeoutsOpen[side];
    return render();
  }
  if (e.detail !== 0) return;
  const opt = e.target.closest('.lt-opt');
  if (opt) {
    const id = opt.dataset.player;
    onAction(opt);
    return focusTile(id);
  }
  const tileEl = e.target.closest('.lt-player');
  if (!tileEl) return;
  const id = tileEl.dataset.player;
  onPlayerTap(id, tileEl.dataset.team);
  const first = menuFor === id && panel.querySelector('.lt-menu .lt-opt:not(:disabled)');
  if (first) first.focus();
  else focusTile(id);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (drawerOpen) return closePlayers();
  if (!menuFor) {
    if (!$('lt-go').hidden) hideGo();
    return;
  }
  const id = menuFor;
  menuFor = null;
  render();
  focusTile(id);
});

// ---- clock, period and game controls ----------------------------------------
$('lt-startstop').onclick = () =>
  perform({ type: clockAt(view, serverClock.now()).running ? 'pause' : 'start' });
$('lt-go-start').onclick = () => {
  menuFor = null;
  perform({ type: 'start' });
};
/** Scoring on with the clock stopped: hidden until the clock next stops, or the period changes. */
function hideGo() {
  goHiddenFor = stopKey(derive(view));
  render();
  $('lt-startstop').focus({ preventScroll: true });
}
$('lt-go-close').onclick = hideGo;
$('lt-clock').onclick = () => {
  const now = clockAt(view, serverClock.now());
  const entry = prompt(
    'Set the clock (minutes, or m:ss).\nSetting it back also takes that time off the minutes of whoever was on the floor.',
    formatClock(now.remainingMs),
  );
  if (entry == null) return;
  const m = String(entry)
    .trim()
    .match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m || Number(m[2] ?? 0) > 59) return flash('Enter minutes like 8, or m:ss like 6:30.');
  const ms = (Number(m[1]) * 60 + Number(m[2] ?? 0)) * 1000;
  if (ms > now.remainingMs && now.elapsedMs > 0)
    flash(
      `Clock set back ${formatClock(ms - now.remainingMs)} — taken off the minutes of whoever was on the floor.`,
    );
  perform({ type: 'set-clock', ms });
};
$('lt-period').onchange = (e) => {
  if (!perform({ type: 'period', period: Number(e.target.value) })) render();
};
$('lt-undo').onclick = () => perform({ type: 'undo' });
$('lt-redo').onclick = () => perform({ type: 'redo' });
$('lt-swap').onclick = () => perform({ type: 'colors', swapped: !view.colorsSwapped });
$('lt-reset').onclick = () => {
  if (
    confirm(
      'Mark this game as not started?\n\nIts score and every stat recorded for it are cleared, here and on the live page. It shows as scheduled again.',
    )
  )
    perform({ type: 'reset' });
};
$('lt-end').onclick = () => {
  if (
    confirm(
      'End this game?\n\nThe final score goes on the schedule and the box score counts toward season stats. You can reopen it to correct something.',
    ) &&
    perform({ type: 'end' })
  )
    flash('Game over — final score and stats saved.');
};
$('lt-reopen').onclick = () => perform({ type: 'reopen' });

// ---- format ------------------------------------------------------------------
const formatDialog = $('lt-format-dialog');
const form = $('lt-format-form');
function fillFormat(rules) {
  form.elements.periods.value = String(rules.periods);
  form.elements.minutes.value = String(rules.periodSeconds / 60);
  form.elements.ot.value = String(rules.overtimeSeconds / 60);
  form.elements.bonus.value = String(rules.bonusFouls);
  form.elements.double.value = rules.doubleBonusFouls == null ? '' : String(rules.doubleBonusFouls);
  const t = timeoutRules(rules);
  form.elements.full.value = String(t.fullTimeouts);
  form.elements.short.value = String(t.shortTimeouts);
  form.elements.per.value = t.timeoutsPer;
  form.elements.otTimeouts.value = String(t.overtimeTimeouts);
  form.elements.carry.checked = t.timeoutsCarry;
}
$('lt-format').onclick = () => {
  fillFormat(view.rules);
  formatDialog.returnValue = '';
  formatDialog.showModal();
};
$('lt-format-quarters').onclick = () => fillFormat(QUARTERS);
$('lt-format-nfhs').onclick = () => fillFormat(NFHS_QUARTERS);
$('lt-format-halves').onclick = () => fillFormat(HALVES);
formatDialog.addEventListener('close', () => {
  if (formatDialog.returnValue !== 'save') return;
  const f = form.elements;
  const rules = {
    periods: Number(f.periods.value),
    periodSeconds: Math.round(Number(f.minutes.value) * 60),
    overtimeSeconds: Math.round(Number(f.ot.value) * 60),
    bonusFouls: Number(f.bonus.value),
    doubleBonusFouls: f.double.value === '' ? null : Number(f.double.value),
    fullTimeouts: Number(f.full.value),
    shortTimeouts: Number(f.short.value),
    timeoutsPer: f.per.value,
    overtimeTimeouts: Number(f.otTimeouts.value),
    timeoutsCarry: f.carry.checked,
  };
  if (perform({ type: 'rules', rules }))
    flash(
      `Format: ${rules.periods === 4 ? '4 quarters' : '2 halves'} of ${rules.periodSeconds / 60} minutes. Timeouts: ${timeoutRulesText(rules)}.`,
    );
});

// ---- players panel -----------------------------------------------------------
const drawer = $('lt-drawer');
const scrim = $('lt-scrim');
let drawerOpen = false;
let editors = [];

function openPlayers(focusSide) {
  if (drawerOpen) return;
  menuFor = null;
  render();
  const body = $('lt-drawer-body');
  body.innerHTML = SIDES.map(
    (side) =>
      `<section class="lt-roster-team" data-color="${colorOf(side)}"><h3><span>${esc(game[side].name)}</span><span class="re-count">${game[side].tracked ? 'Season roster' : 'Opponent'}</span></h3><div data-editor="${side}"></div></section>`,
  ).join('');
  editors = SIDES.map((side) => ({
    side,
    editor: rosterEditor(body.querySelector(`[data-editor="${side}"]`), {
      teamId: game[side].id,
      players: game.players.filter((p) => p.teamId === game[side].id),
      onChange: upsertPlayer,
      // Said here too, since a save can fail after the panel is closed.
      onError: (message) => flash(`${game[side].name} roster: ${message}`),
    }),
  }));
  drawerOpen = true;
  $('lt-go').hidden = true;
  drawer.classList.add('lt-open');
  scrim.classList.add('lt-open');
  drawer.removeAttribute('aria-hidden');
  panel.inert = true;
  const first =
    focusSide ??
    SIDES.find((side) => !game.players.some((p) => p.teamId === game[side].id && p.active)) ??
    'home';
  editors.find((e) => e.side === first)?.editor.focusAdd();
}
function closePlayers() {
  if (!drawerOpen) return;
  // Whatever was typed is saved, a player half-entered in an add row included.
  for (const { editor } of editors) void editor.flush();
  drawerOpen = false;
  drawer.classList.remove('lt-open');
  scrim.classList.remove('lt-open');
  drawer.setAttribute('aria-hidden', 'true');
  panel.inert = false;
  render();
  $('lt-players').focus({ preventScroll: true });
}
function upsertPlayer(player) {
  const i = game.players.findIndex((p) => p.id === player.id);
  if (i >= 0) game.players[i] = player;
  else game.players.push(player);
  playerMap.set(player.id, player);
  render();
}
$('lt-players').onclick = () => openPlayers();
$('lt-pregame-players').onclick = () => openPlayers();
$('lt-drawer-done').onclick = closePlayers;
scrim.onclick = closePlayers;
// Closing or leaving the page with the panel open still saves what was typed.
window.addEventListener('pagehide', () => {
  if (drawerOpen) for (const { editor } of editors) void editor.flush({ keepalive: true });
});
// While a box is being typed in on a touch screen, leave room above the keyboard.
drawer.addEventListener('focusin', () => drawer.classList.add('lt-drawer-typing'));
drawer.addEventListener('focusout', (e) => {
  if (!drawer.contains(e.relatedTarget)) drawer.classList.remove('lt-drawer-typing');
});

// ---- start ---------------------------------------------------------------------
async function start() {
  const session = await getSession();
  if (!session.canScore) {
    // Scorers sign in first. Where sign-in is not set up, other devices watch instead.
    location.replace(session.signIn ? link.signIn(here()) : link.game(gameId));
    return;
  }
  // A server still starting up, or a dropped connection: keep trying. Taps waiting
  // in this browser stay put and go out once the game loads.
  for (let wait = 1000; ; wait = Math.min(wait * 2, 10_000)) {
    try {
      adopt(await api(`/api/games/${gameId}`));
      break;
    } catch (err) {
      if (err.status !== 0 && err.status < 500) {
        $('lt-title').textContent = err.message;
        return;
      }
      $('lt-title').textContent =
        `Waiting for the stats server…${outbox.length ? ` ${outbox.length} unsaved ${outbox.length === 1 ? 'action is' : 'actions are'} kept on this device.` : ''}`;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  const title = `${game.away.name} at ${game.home.name}`;
  document.title = `Live stats · ${title}`;
  $('lt-title').textContent = [
    title,
    game.startsAt ? `${fmtDay(game.startsAt)} ${fmtTime(game.startsAt)}` : '',
    game.gameType !== 'regular_season' ? gameTypeLabel(game.gameType) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  $('lt-watch').href = link.game(gameId);
  subscribe(`?game=${gameId}`, { game: adopt }, (connected) => {
    if (connected && outbox.length) void pump();
  });
  window.addEventListener('online', () => void pump());
  // A team with no players yet can't be tracked: start by entering them.
  if (SIDES.some((side) => !game.players.some((p) => p.teamId === game[side].id && p.active)))
    openPlayers();
  void pump();
}
void start();
