// One team's names and jersey numbers, saved as they are typed, with a row to add
// more. There is no limit on players. Used by the tracker's Players panel and the
// team page.
import { api, esc, sortPlayers, typedJersey } from '/js/common.js';

/**
 * @param {HTMLElement} el where the editor goes
 * @param {{ teamId: string, players: object[], onChange?: (player: object) => void }} options
 *   `onChange` hears about every player saved, added or removed (removed ones are inactive)
 */
export function rosterEditor(el, { teamId, players, onChange = () => {} }) {
  el.classList.add('re');
  el.innerHTML = `<div class="re-dupes" hidden></div><div class="re-list"></div>
    <div class="re-row re-add">
      <input class="re-jersey" inputmode="numeric" autocomplete="off" placeholder="#" aria-label="New player's jersey number" enterkeyhint="next">
      <input class="re-name" autocomplete="off" placeholder="Add a player…" aria-label="New player's name" enterkeyhint="done">
      <button type="button" class="re-add-btn">Add</button>
    </div>
    <div class="re-msg" role="status"></div>`;
  const list = el.querySelector('.re-list');
  const add = el.querySelector('.re-add');
  const msg = el.querySelector('.re-msg');
  const say = (text) => (msg.textContent = text);

  const row = (p) => `<div class="re-row" data-id="${esc(p.id)}">
      <input class="re-jersey" inputmode="numeric" autocomplete="off" placeholder="#" value="${esc(p.jersey)}" data-saved="${esc(p.jersey)}" aria-label="Jersey number" enterkeyhint="next">
      <input class="re-name" autocomplete="off" placeholder="Name" value="${esc(p.name)}" data-saved="${esc(p.name)}" aria-label="Name" enterkeyhint="next">
      <span class="re-state" aria-hidden="true"></span>
      <button type="button" class="re-remove" title="Remove from the roster" aria-label="Remove">×</button>
    </div>`;
  list.innerHTML = sortPlayers(players.filter((p) => p.active))
    .map(row)
    .join('');

  function setState(r, kind, detail = '') {
    r.dataset.state = kind;
    r.querySelector('.re-state').textContent =
      kind === 'saving' ? '…' : kind === 'saved' ? '✓' : kind === 'error' ? '!' : '';
    r.querySelector('.re-state').title = detail;
  }

  /** Numbers more than one player on this team is down for. */
  function dupes() {
    const rows = [...list.querySelectorAll('.re-row')];
    const by = new Map();
    for (const r of rows) {
      const j = r.querySelector('.re-jersey').value;
      if (j !== '') by.set(j, [...(by.get(j) ?? []), r]);
    }
    const twice = [...by].filter(([, rs]) => rs.length > 1);
    for (const r of rows)
      r.classList.toggle(
        're-dupe',
        twice.some(([, rs]) => rs.includes(r)),
      );
    const note = el.querySelector('.re-dupes');
    note.hidden = !twice.length;
    note.textContent = twice.map(([j, rs]) => `#${j} is down for ${rs.length} players.`).join(' ');
  }
  dupes();

  /** Save a row if it differs from what is saved. Saves for one row run in order. */
  const chains = new WeakMap();
  function commit(r) {
    const jersey = r.querySelector('.re-jersey'),
      name = r.querySelector('.re-name');
    const value = { jersey: jersey.value.trim(), name: name.value.trim() };
    if (value.jersey === jersey.dataset.saved && value.name === name.dataset.saved) return;
    setState(r, 'saving');
    const run = async () => {
      try {
        const saved = await api(`/api/players/${r.dataset.id}`, { method: 'PUT', body: value });
        jersey.dataset.saved = saved.jersey;
        name.dataset.saved = saved.name;
        setState(r, 'saved');
        say('');
        onChange(saved);
      } catch (err) {
        setState(r, 'error', err.message);
        say(err.message);
      }
    };
    chains.set(r, (chains.get(r) ?? Promise.resolve()).then(run));
  }

  async function create() {
    const jersey = add.querySelector('.re-jersey'),
      name = add.querySelector('.re-name');
    const value = { jersey: jersey.value.trim(), name: name.value.trim() };
    if (!value.jersey && !value.name) {
      name.focus();
      return;
    }
    add.querySelector('.re-add-btn').disabled = true;
    try {
      const player = await api(`/api/teams/${teamId}/players`, { method: 'POST', body: value });
      list.insertAdjacentHTML('beforeend', row(player));
      setState(list.lastElementChild, 'saved');
      jersey.value = '';
      name.value = '';
      say('');
      dupes();
      onChange(player);
      jersey.focus();
    } catch (err) {
      say(err.message);
    } finally {
      add.querySelector('.re-add-btn').disabled = false;
    }
  }

  el.addEventListener('input', (e) => {
    if (!e.target.classList.contains('re-jersey')) return;
    const clean = typedJersey(e.target.value);
    if (clean !== e.target.value) e.target.value = clean;
    dupes();
  });
  // A number box is selected as it is entered, so typing replaces it.
  el.addEventListener('focusin', (e) => {
    if (e.target.classList?.contains('re-jersey')) setTimeout(() => e.target.select(), 0);
  });
  el.addEventListener('focusout', (e) => {
    const r = e.target.closest?.('.re-row[data-id]');
    if (r && !r.contains(e.relatedTarget)) commit(r);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const r = e.target.closest?.('.re-row');
    if (!r) return;
    e.preventDefault();
    if (r === add) {
      if (e.target.classList.contains('re-jersey') && !add.querySelector('.re-name').value)
        add.querySelector('.re-name').focus();
      else void create();
      return;
    }
    commit(r);
    const field = e.target.classList.contains('re-jersey') ? '.re-name' : '.re-jersey';
    const next = field === '.re-name' ? r : (r.nextElementSibling ?? add);
    next.querySelector(field).focus();
  });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('.re-add-btn')) return void create();
    const button = e.target.closest('.re-remove');
    if (!button) return;
    const r = button.closest('.re-row');
    const who = r.querySelector('.re-name').value || `#${r.querySelector('.re-jersey').value}`;
    if (!confirm(`Remove ${who} from the roster?\n\nGames they already played keep their stats.`))
      return;
    try {
      const player = await api(`/api/players/${r.dataset.id}`, { method: 'DELETE' });
      r.remove();
      dupes();
      say('');
      onChange(player);
    } catch (err) {
      say(err.message);
    }
  });

  return {
    focusAdd: () => add.querySelector('.re-jersey').focus(),
    /** Save anything typed but not yet saved. */
    flush: () => list.querySelectorAll('.re-row').forEach(commit),
  };
}
