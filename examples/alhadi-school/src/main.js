import { M, state, ui, $, clock, save, toast } from '@demo/context';
import { handlers } from '@demo/actions';
import { render } from '@demo/router';
import { closeModal, payModal } from '@demo/dialogs';
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el && !el.disabled) {
    const action = handlers[el.dataset.action];
    if (action) action(el);
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'registration-form') {
    e.preventDefault();
    if (e.target.reportValidity()) payModal(e.target);
  }
  if (e.target.id === 'announcement-form') {
    e.preventDefault();
    const f = new FormData(e.target);
    state.announcement = {
      title: String(f.get('title')).trim(),
      body: String(f.get('body')).trim(),
    };
    save();
    closeModal();
    render();
    toast('Announcement published to the sample homepage.');
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'schedule-team') {
    ui.scheduleTeam = e.target.value;
    render();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'app-search') {
    const q = e.target.value.toLowerCase().trim();
    let n = 0;
    document.querySelectorAll('[data-app-name]').forEach((row) => {
      row.hidden = !row.dataset.appName.includes(q);
      if (!row.hidden) n++;
    });
    $('#search-empty').hidden = n > 0;
  }
});
document.addEventListener('keydown', (e) => {
  if (!$('.modal')) return;
  if (e.key === 'Escape') {
    closeModal();
    return;
  }
  if (e.key === 'Tab') {
    const f = [
      ...$('.modal').querySelectorAll('button:not(:disabled),a[href],input,select,textarea'),
    ];
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener('hashchange', () => {
  if (state.live.running) {
    state.live.running = false;
    save();
  }
  if (!state.draft.paused) {
    state.draft.paused = true;
    save();
  }
  closeModal();
  render(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.live.running = false;
    state.draft.paused = true;
    save();
  } else render();
});
setInterval(() => {
  if (state.live.running && !state.live.final) {
    state.live = M.tickLive(state.live);
    save();
    if ($('#live-clock')) $('#live-clock').textContent = clock(state.live.remaining);
    document
      .querySelectorAll('[data-player-seconds]')
      .forEach(
        (el) => (el.textContent = clock(state.live.players[el.dataset.playerSeconds].seconds)),
      );
    if (!state.live.running) render();
  }
  if (!state.draft.paused && state.draft.seconds > 0) {
    state.draft.seconds--;
    if (!state.draft.seconds) {
      state.draft.paused = true;
      toast('Draft timer finished. The host still chooses the pick.');
    }
    save();
    if ($('#draft-clock')) $('#draft-clock').textContent = clock(state.draft.seconds);
  }
}, 1000);
render();
