// One team's names and jersey numbers, saved as they are typed, with a row to add
// more and a box to add several numbers at once. There is no limit on players.
// Used by the tracker's Players panel and the team page.
//
// Nothing typed is left unsaved: a change to a player saves shortly after typing
// stops and again when the row is left, and a new player half-entered in the add
// row is added when the row is left, on Done, or as the page closes.
import { api, esc, sortPlayers, typedJersey } from './common.js';

const JERSEY = /^(?:0|00|[1-9][0-9]?)$/;
/** Pause in typing after which a change to a player is saved. */
const TYPING_PAUSE_MS = 600;

/** "3 5, 10/12" → the jersey numbers in it, once each, and anything that is not one. */
export function parseJerseys(text) {
  const tokens = String(text ?? '')
    .split(/[^0-9]+/)
    .filter(Boolean);
  const ok = [],
    bad = [];
  for (const t of tokens) (JERSEY.test(t) ? ok : bad).push(t);
  return { ok: [...new Set(ok)], bad };
}

/**
 * @param {HTMLElement} el where the editor goes
 * @param {{ teamId: string, players: object[], onChange?: (player: object) => void,
 *   onError?: (message: string) => void }} options
 *   `onChange` hears about every player saved, added or removed (removed ones are
 *   inactive); `onError` hears about a save that failed, for when the editor is hidden
 */
export function rosterEditor(el, { teamId, players, onChange = () => {}, onError = () => {} }) {
  el.classList.add('re');
  el.innerHTML = `<div class="re-dupes" hidden></div><div class="re-list"></div>
    <div class="re-row re-add">
      <input class="re-jersey" inputmode="numeric" autocomplete="off" placeholder="#" aria-label="New player's jersey number" enterkeyhint="next">
      <input class="re-name" autocomplete="off" placeholder="Add a player…" aria-label="New player's name" enterkeyhint="done">
      <button type="button" class="re-add-btn">Add</button>
    </div>
    <div class="re-row re-quick">
      <input class="re-quick-input" autocomplete="off" placeholder="Several numbers: 3 5 10 12…" aria-label="Add several jersey numbers at once" enterkeyhint="done">
      <button type="button" class="re-quick-btn">Add all</button>
    </div>
    <div class="re-msg" role="status"></div>`;
  const list = el.querySelector('.re-list');
  const add = el.querySelector('.re-add');
  const addButton = add.querySelector('.re-add-btn');
  const quick = el.querySelector('.re-quick-input');
  const quickButton = el.querySelector('.re-quick-btn');
  const msg = el.querySelector('.re-msg');
  const say = (text, kind = 'error') => {
    msg.textContent = text;
    msg.dataset.kind = kind;
  };
  const report = (text) => {
    say(text);
    onError(text);
  };

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

  function insert(player) {
    list.insertAdjacentHTML('beforeend', row(player));
    setState(list.lastElementChild, 'saved');
    dupes();
    onChange(player);
  }

  /** Save a row if it differs from what is saved. Saves for one row run in order. */
  const chains = new WeakMap();
  const timers = new WeakMap();
  function commit(r, { keepalive = false } = {}) {
    clearTimeout(timers.get(r));
    const jersey = r.querySelector('.re-jersey'),
      name = r.querySelector('.re-name');
    const run = async () => {
      // Read the boxes when this save runs, so saves queued behind each other send the latest.
      const value = { jersey: jersey.value.trim(), name: name.value.trim() };
      if (value.jersey === jersey.dataset.saved && value.name === name.dataset.saved) return;
      setState(r, 'saving');
      try {
        const saved = await api(`/api/players/${r.dataset.id}`, {
          method: 'PUT',
          body: value,
          keepalive,
        });
        jersey.dataset.saved = saved.jersey;
        name.dataset.saved = saved.name;
        const current = jersey.value.trim() === saved.jersey && name.value.trim() === saved.name;
        setState(r, current ? 'saved' : 'saving');
        say('');
        onChange(saved);
      } catch (err) {
        setState(r, 'error', err.message);
        report(err.message);
      }
    };
    const next = (chains.get(r) ?? Promise.resolve()).then(run);
    chains.set(r, next);
    return next;
  }
  /** Save a row once typing pauses, unless it is blank for now (it is being retyped). */
  function commitSoon(r) {
    clearTimeout(timers.get(r));
    timers.set(
      r,
      setTimeout(() => {
        const blank =
          !r.querySelector('.re-jersey').value.trim() && !r.querySelector('.re-name').value.trim();
        if (!blank) void commit(r);
      }, TYPING_PAUSE_MS),
    );
  }

  /** Add the player typed in the add row. One add at a time, so it is never sent twice. */
  let creating = null;
  function create({ focus = true, keepalive = false } = {}) {
    if (creating) return creating;
    const jersey = add.querySelector('.re-jersey'),
      name = add.querySelector('.re-name');
    const value = { jersey: jersey.value.trim(), name: name.value.trim() };
    if (!value.jersey && !value.name) {
      if (focus) name.focus();
      return Promise.resolve();
    }
    addButton.disabled = true;
    creating = (async () => {
      try {
        const player = await api(`/api/teams/${teamId}/players`, {
          method: 'POST',
          body: value,
          keepalive,
        });
        // Clear what was saved; anything typed over it since stays for the next add.
        if (jersey.value.trim() === value.jersey && name.value.trim() === value.name) {
          jersey.value = '';
          name.value = '';
        }
        insert(player);
        say('');
        if (focus) jersey.focus();
      } catch (err) {
        report(`${playerText(value)} not added: ${err.message}`);
      } finally {
        addButton.disabled = false;
        creating = null;
      }
    })();
    return creating;
  }

  /** Add every number typed in the quick box that is not on the roster yet. */
  let adding = null;
  function quickAdd() {
    if (adding) return adding;
    const { ok, bad } = parseJerseys(quick.value);
    if (!ok.length && !bad.length) {
      quick.focus();
      return Promise.resolve();
    }
    const have = new Set([...list.querySelectorAll('.re-jersey')].map((i) => i.value.trim()));
    const fresh = ok.filter((j) => !have.has(j));
    const already = ok.filter((j) => have.has(j));
    quickButton.disabled = true;
    adding = (async () => {
      const added = [];
      let failed = null;
      for (const jersey of fresh) {
        try {
          insert(
            await api(`/api/teams/${teamId}/players`, {
              method: 'POST',
              body: { jersey, name: '' },
            }),
          );
          added.push(jersey);
        } catch (err) {
          failed = err;
          break;
        }
      }
      // Leave in the box only the numbers still to add, so trying again finishes the job.
      quick.value = failed ? fresh.slice(added.length).join(' ') : '';
      const notes = [];
      if (added.length) notes.push(`Added ${added.map((j) => `#${j}`).join(', ')}.`);
      if (already.length)
        notes.push(
          `${already.map((j) => `#${j}`).join(', ')} ${already.length === 1 ? 'was' : 'were'} already on the roster.`,
        );
      if (bad.length) notes.push(`Not a jersey number (0–99 or 00): ${bad.join(', ')}.`);
      if (failed) {
        notes.push(`Stopped: ${failed.message} The rest are still in the box.`);
        report(notes.join(' '));
      } else say(notes.join(' '), bad.length ? 'error' : 'ok');
      quickButton.disabled = false;
      adding = null;
    })();
    return adding;
  }

  el.addEventListener('input', (e) => {
    if (e.target.classList.contains('re-jersey')) {
      const clean = typedJersey(e.target.value);
      if (clean !== e.target.value) e.target.value = clean;
      dupes();
    }
    const r = e.target.closest?.('.re-row[data-id]');
    if (r) commitSoon(r);
  });
  // A number box is selected as it is entered, so typing replaces it.
  el.addEventListener('focusin', (e) => {
    if (e.target.classList?.contains('re-jersey')) setTimeout(() => e.target.select(), 0);
  });
  el.addEventListener('focusout', (e) => {
    const r = e.target.closest?.('.re-row[data-id]');
    if (r && !r.contains(e.relatedTarget)) void commit(r);
    // Leaving the add row with something typed in it adds that player.
    if (add.contains(e.target) && !add.contains(e.relatedTarget)) void create({ focus: false });
  });
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.target === quick) {
      e.preventDefault();
      void quickAdd();
      return;
    }
    const r = e.target.closest?.('.re-row');
    if (!r) return;
    e.preventDefault();
    if (r === add) {
      if (e.target.classList.contains('re-jersey') && !add.querySelector('.re-name').value)
        add.querySelector('.re-name').focus();
      else void create();
      return;
    }
    void commit(r);
    const field = e.target.classList.contains('re-jersey') ? '.re-name' : '.re-jersey';
    const next = field === '.re-name' ? r : (r.nextElementSibling ?? add);
    next.querySelector(field).focus();
  });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('.re-add-btn')) return void create();
    if (e.target.closest('.re-quick-btn')) return void quickAdd();
    const button = e.target.closest('.re-remove');
    if (!button) return;
    const r = button.closest('.re-row');
    const who = r.querySelector('.re-name').value || `#${r.querySelector('.re-jersey').value}`;
    if (!confirm(`Remove ${who} from the roster?\n\nGames they already played keep their stats.`))
      return;
    try {
      const player = await api(`/api/players/${r.dataset.id}`, { method: 'DELETE' });
      clearTimeout(timers.get(r));
      r.remove();
      dupes();
      say('');
      onChange(player);
    } catch (err) {
      report(err.message);
    }
  });

  return {
    focusAdd: () => add.querySelector('.re-jersey').focus(),
    /**
     * Save everything typed and not yet saved: changed players and a player
     * half-entered in the add row. Resolves when those saves have answered.
     * `keepalive` lets them finish as the page closes.
     */
    flush({ keepalive = false } = {}) {
      const saves = [...list.querySelectorAll('.re-row[data-id]')].map((r) =>
        commit(r, { keepalive }),
      );
      saves.push(create({ focus: false, keepalive }));
      return Promise.all(saves);
    },
  };
}

const playerText = (p) => (p.jersey ? `#${p.jersey}${p.name ? ` ${p.name}` : ''}` : p.name);
