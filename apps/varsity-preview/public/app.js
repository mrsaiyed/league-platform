import {
  esc,
  clock,
  names,
  orderedPlayers,
  overview,
  roster,
  rosterRow,
  games,
  stats,
  scorer,
} from './views.js';

const main = document.querySelector('#main'),
  dialog = document.querySelector('#dialog'),
  status = document.querySelector('#save-status');
let dashboard,
  game,
  selectedId = '',
  busy = false,
  renderedAt = performance.now(),
  requestSequence = 0;
const pendingKey = 'league-platform:varsity-pending:v1';
const savedLabel =
  document.body.dataset.storage === 'cloud' ? 'Saved to shared database' : 'Saved to this computer';
let pending;
try {
  pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
} catch {
  pending = null;
}
function notice(message) {
  const n = document.querySelector('#notice');
  n.innerHTML = `${esc(message)}<br><button class="small" data-action="dismiss">Dismiss</button>`;
  n.hidden = false;
}
async function api(url, data, method = 'POST') {
  const response = await fetch(url, {
    method: data === undefined ? 'GET' : method,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return result;
}
function setBusy(value) {
  busy = value;
  main.classList.toggle('busy', value);
  status.textContent = value ? 'Saving…' : pending ? 'Unsaved action needs attention' : savedLabel;
}
function renderPending() {
  const el = document.querySelector('#pending-area');
  if (!el || !pending || pending.gameId !== game?.id) return;
  el.innerHTML =
    '<div class="pending-banner"><b>One action has not been acknowledged.</b> Keep this tab open. Retry uses the same action ID so an accepted play will not count twice.<div class="actions"><button class="small" data-action="retry">Retry saved action</button><button class="small" data-action="discard-pending">Review server record and discard pending action</button></div></div>';
}
function drawGame() {
  main.innerHTML = scorer(game, selectedId);
  renderedAt = performance.now();
  renderPending();
}
async function load() {
  const seq = ++requestSequence,
    route = location.hash.slice(1) || 'overview';
  document
    .querySelectorAll('nav a')
    .forEach((a) =>
      a.classList.toggle(
        'active',
        a.hash === `#${route}` || (route.startsWith('game/') && a.hash === '#games'),
      ),
    );
  try {
    if (route.startsWith('game/')) {
      const result = await api(`/api/games/${route.split('/')[1]}`);
      if (seq !== requestSequence) return;
      game = result;
      if (!game.state.players[selectedId])
        selectedId = orderedPlayers(game.state).find((p) => p.side === game.trackedSide)?.id || '';
      drawGame();
    } else {
      const result = await api('/api/dashboard');
      if (seq !== requestSequence) return;
      dashboard = result;
      game = null;
      main.innerHTML = ({ overview, roster, games, stats }[route] || overview)(dashboard);
    }
    status.textContent = pending ? 'Unsaved action needs attention' : savedLabel;
  } catch (error) {
    status.textContent = 'Connection unavailable';
    notice(error.message);
  }
}
function showDialog(html) {
  document.querySelector('#dialog-body').innerHTML = html;
  dialog.showModal();
}
const dialogTitle = (heading) =>
  `<div class="dialog-heading"><h2 id="dialog-title">${heading}</h2><button type="button" class="ghost small" data-action="close-dialog" aria-label="Close dialog">✕</button></div>`;
async function submitCommand(input, retry = false) {
  if (busy || !game) return;
  if (pending && !retry) {
    notice('Resolve the pending action before recording another play.');
    renderPending();
    return;
  }
  const record = retry
    ? pending
    : {
        gameId: game.id,
        body: { commandId: crypto.randomUUID(), expectedRevision: game.revision, input },
      };
  try {
    localStorage.setItem(pendingKey, JSON.stringify(record));
  } catch {
    notice('Browser recovery storage is unavailable. No action was sent.');
    return;
  }
  pending = record;
  setBusy(true);
  try {
    game = await api(`/api/games/${record.gameId}/commands`, record.body);
    pending = null;
    localStorage.removeItem(pendingKey);
    drawGame();
  } catch (error) {
    if (error.status && error.status < 500) {
      pending = null;
      localStorage.removeItem(pendingKey);
      await load();
    }
    notice(error.message);
    renderPending();
  } finally {
    setBusy(false);
  }
}
function newGame() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  showDialog(
    `${dialogTitle('Prepare a varsity game')}<p>Use the saved Al-Hadi roster. Opponent names are optional; enter one jersey number per line, followed by a name if known.</p><form id="game-form"><div class="form-grid"><label>Opponent<input name="opponent" required maxlength="100" /></label><label>Al-Hadi is<select name="trackedSide"><option value="home">Home team</option><option value="away">Away team</option></select></label><label>Tip-off (optional)<input name="scheduledAt" type="datetime-local" /><small>${esc(timezone)}</small></label><label>Venue<input name="venue" maxlength="160" /></label><label class="full">Confirmed schedule source (optional)<input name="sourceUrl" type="url" placeholder="https://texascharter.org/…" /></label><label class="full">Opponent roster<textarea name="opponents" rows="5" required placeholder="4&#10;12&#10;23 Player name"></textarea></label><label>Regulation periods<select name="periods"><option value="4">4 periods</option><option value="2">2 halves</option></select></label><label>Minutes per period<input name="periodMinutes" type="number" min="1" max="30" value="8" required /></label><label>Overtime minutes<input name="otMinutes" type="number" min="1" max="10" value="4" required /></label><label class="check-label full"><input name="rulesConfirmed" type="checkbox" required /><span>I checked this game format with the coach or competition rules. The starting values are an editable practice preset.</span></label></div><div class="form-actions"><button type="button" data-action="close-dialog">Cancel</button><button class="primary">Create game</button></div></form>`,
  );
}
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled || busy) return;
  const action = button.dataset.action;
  try {
    if (action === 'dismiss') document.querySelector('#notice').hidden = true;
    else if (action === 'close-dialog') dialog.close();
    else if (action === 'new-game') newGame();
    else if (action === 'practice') {
      setBusy(true);
      const result = await api('/api/practice', { commandId: crypto.randomUUID() });
      location.hash = `game/${result.id}`;
    } else if (action === 'add-roster-row') {
      if (document.querySelectorAll('.roster-edit-row').length >= 30)
        throw new Error('This preview supports up to 30 roster players.');
      document.querySelector('#roster-rows').insertAdjacentHTML('beforeend', rosterRow());
    } else if (action === 'remove-roster-row') button.closest('.roster-edit-row').remove();
    else if (action === 'select-player') {
      selectedId = button.dataset.id;
      drawGame();
    } else if (action === 'score')
      await submitCommand({
        type: 'score',
        playerId: selectedId,
        points: Number(button.dataset.points),
      });
    else if (action === 'foul') await submitCommand({ type: 'foul', playerId: selectedId });
    else if (action === 'undo') await submitCommand({ type: 'undo', targetId: button.dataset.id });
    else if (action === 'clock-toggle')
      await submitCommand({ type: game.state.running ? 'pause' : 'start' });
    else if (action === 'next-period') await submitCommand({ type: 'next-period' });
    else if (action === 'lineup') {
      const side = button.dataset.side;
      showDialog(
        `${dialogTitle(`${esc(names(game)[side])} · on-court players`)}<p>Select up to five. A shortened lineup is allowed for rehearsal; confirm actual players on the court.</p><form id="lineup-form" data-side="${side}">${orderedPlayers(
          game.state,
        )
          .filter((p) => p.side === side)
          .map(
            (p) =>
              `<label class="lineup-option"><input type="checkbox" name="player" value="${p.id}" ${game.state.lineups[side].includes(p.id) ? 'checked' : ''} /><span class="jersey">${esc(p.jersey)}</span>${esc(p.name)}</label>`,
          )
          .join(
            '',
          )}<div class="form-actions"><button type="button" data-action="first-five">Select first five</button><button class="primary">Save lineup</button></div></form>`,
      );
    } else if (action === 'first-five')
      document.querySelectorAll('#lineup-form input').forEach((i, n) => {
        i.checked = n < 5;
      });
    else if (action === 'substitute') {
      const incoming = document.querySelector('#sub-player').value;
      if (!incoming) throw new Error('Choose a bench player.');
      await submitCommand({
        type: 'substitute',
        side: game.state.players[selectedId].side,
        outId: selectedId,
        inId: incoming,
      });
      selectedId = incoming;
      drawGame();
    } else if (action === 'clock-adjust') {
      showDialog(
        `${dialogTitle('Correct the game clock')}<p>Pause first and match the official clock. This preview flags tracked minutes for review after a mid-game clock correction; it does not silently invent corrected playing time.</p><form id="clock-form"><label>Clock (MM:SS)<input name="clock" pattern="[0-9]{1,2}:[0-5][0-9]" value="${clock(game.state.remainingMs)}" required /></label><label class="section-space">Reason<input name="reason" minlength="5" maxlength="300" required /></label><div class="form-actions"><button class="primary">Save clock correction</button></div></form>`,
      );
    } else if (action === 'finalize') {
      showDialog(
        `${dialogTitle('Review the final box score')}<p>Check both team scores and every player’s participation. The clock must be paused. ${game.practice ? 'This practice game stays outside season totals.' : 'Finalizing adds this team record to Al-Hadi’s season totals. It does not submit a result to TCSAAL.'}</p>${game.state.minutesQuality === 'review-required' ? '<div class="note">Minutes need review and will not enter verified season-minute totals.</div>' : ''}<div class="actions"><button data-action="close-dialog">Keep reviewing</button><button class="primary" data-action="confirm-finalize">Finalize record</button></div>`,
      );
    } else if (action === 'confirm-finalize') {
      dialog.close();
      await submitCommand({ type: 'finalize' });
    } else if (action === 'reopen')
      showDialog(
        `${dialogTitle('Reopen the result')}<p>The result will leave season totals until you finalize the correction. All prior actions remain in the record.</p><form id="reopen-form"><label>Correction reason<input name="reason" minlength="5" maxlength="300" required /></label><div class="form-actions"><button class="primary">Reopen result</button></div></form>`,
      );
    else if (action === 'retry') await submitCommand(null, true);
    else if (action === 'discard-pending') {
      if (
        confirm(
          'Review the refreshed game and play log before recording the action again. Discard this local pending request?',
        )
      ) {
        pending = null;
        localStorage.removeItem(pendingKey);
        await load();
      }
    }
  } catch (error) {
    notice(error.message);
  } finally {
    if (busy) setBusy(false);
  }
});
document.addEventListener('submit', async (event) => {
  const form = event.target;
  event.preventDefault();
  if (busy) return;
  const data = new FormData(form);
  try {
    if (form.id === 'lineup-form') {
      const ids = data.getAll('player');
      if (ids.length < 1 || ids.length > 5)
        throw new Error('Select between one and five on-court players.');
      dialog.close();
      await submitCommand({ type: 'lineup', side: form.dataset.side, playerIds: ids });
    } else if (form.id === 'clock-form') {
      const [m, s] = data.get('clock').split(':').map(Number);
      dialog.close();
      await submitCommand({ type: 'clock', seconds: m * 60 + s, reason: data.get('reason') });
    } else if (form.id === 'reopen-form') {
      dialog.close();
      await submitCommand({ type: 'reopen', reason: data.get('reason') });
    } else if (form.id === 'roster-form') {
      setBusy(true);
      const players = [...form.querySelectorAll('.roster-edit-row')].map((row) => ({
        ...(row.dataset.playerId ? { id: row.dataset.playerId } : {}),
        name: row.querySelector('[name=name]').value,
        jersey: row.querySelector('[name=jersey]').value,
      }));
      await api('/api/roster', { expectedRevision: Number(form.dataset.revision), players }, 'PUT');
      await load();
    } else if (form.id === 'game-form') {
      setBusy(true);
      const opponents = data
        .get('opponents')
        .trim()
        .split(/\n/)
        .filter((s) => s.trim())
        .map((line) => {
          const [jersey, ...parts] = line.trim().split(/\s+/);
          return { jersey, name: parts.join(' ') };
        });
      const result = await api('/api/games', {
        commandId: crypto.randomUUID(),
        opponent: data.get('opponent'),
        trackedSide: data.get('trackedSide'),
        scheduledAt: data.get('scheduledAt')
          ? new Date(data.get('scheduledAt')).toISOString()
          : null,
        venue: data.get('venue'),
        sourceUrl: data.get('sourceUrl'),
        rules: {
          periods: Number(data.get('periods')),
          periodSeconds: Number(data.get('periodMinutes')) * 60,
          overtimeSeconds: Number(data.get('otMinutes')) * 60,
        },
        rulesConfirmed: data.has('rulesConfirmed'),
        opponents,
      });
      dialog.close();
      location.hash = `game/${result.id}`;
    }
  } catch (error) {
    notice(error.message);
  } finally {
    if (busy) setBusy(false);
  }
});
document.addEventListener('keydown', (event) => {
  if (
    !game ||
    busy ||
    dialog.open ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(event.target.tagName)
  )
    return;
  const key = event.key.toLowerCase();
  const selector = ['1', '2', '3'].includes(key)
    ? `[data-action=score][data-points="${key}"]`
    : key === 'f'
      ? '[data-action=foul]'
      : key === ' '
        ? '[data-action=clock-toggle]'
        : null;
  if (selector) {
    event.preventDefault();
    document.querySelector(selector)?.click();
  }
});
window.addEventListener('hashchange', () => {
  if (dialog.open) dialog.close();
  void load();
});
window.addEventListener('beforeunload', (event) => {
  if (pending || busy) {
    event.preventDefault();
    event.returnValue = '';
  }
});
setInterval(() => {
  const el = document.querySelector('#game-clock');
  if (el && game && !busy)
    el.textContent = clock(
      game.state.remainingMs - (game.state.running ? performance.now() - renderedAt : 0),
    );
}, 200);
setInterval(async () => {
  if (busy || pending || dialog.open || document.hidden || !game) return;
  const id = game.id;
  try {
    const fresh = await api(`/api/games/${id}`);
    if (!game || game.id !== id || busy || pending || dialog.open) return;
    if (fresh.revision !== game.revision || fresh.state.running !== game.state.running) {
      game = fresh;
      drawGame();
    } else {
      game = fresh;
      renderedAt = performance.now();
    }
  } catch {
    status.textContent = 'Connection lost · do not close this window';
  }
}, 5000);
await load();
