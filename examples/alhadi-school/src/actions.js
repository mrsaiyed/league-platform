import { D, M, state, ui, $, esc, team, player, clock, save, toast, seed } from '@demo/context';
import { button } from '@demo/components';
import { render } from '@demo/router';
import { showModal, closeModal, guide, review } from '@demo/dialogs';
function getDraftPlayers() {
  return [
    ...D.players,
    ...state.applications
      .filter(
        (a) =>
          a.review === 'approved' &&
          a.placement === 'confirmed' &&
          !D.players.some((p) => p.id === a.personId),
      )
      .map((a) => ({ id: a.personId, name: a.name, grade: a.grade, captain: false })),
  ];
}
function addGameEvent(type, label, before) {
  state.live.events.push({ type, label, at: clock(state.live.remaining), before });
  save();
  render();
}
function generateSchedule() {
  const date = $('#start-date').value,
    time = $('#start-time').value,
    reps = Number($('#repetitions').value);
  if (!date || !time) {
    toast('Choose a start date and time.');
    return;
  }
  const [hh, mm] = time.split(':').map(Number),
    baseMinutes = hh * 60 + mm;
  if (baseMinutes + 120 > 1440) {
    toast('The two game slots must finish before midnight.');
    return;
  }
  const [y, m, d] = date.split('-').map(Number),
    rounds = M.roundRobin(
      D.teams.map((t) => t.id),
      reps,
    ).map((row, i) => {
      const day = new Date(y, m - 1, d + 7 * i);
      return {
        date: day.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
        games: row.map(([home, away], j) => {
          const total = baseMinutes + j * 60;
          return {
            home,
            away,
            time: `${((Math.floor(total / 60) + 11) % 12) + 1}:${String(total % 60).padStart(2, '0')} ${total >= 720 ? 'PM' : 'AM'}`,
          };
        }),
      };
    });
  state.schedule = { rounds };
  state.schedulePublished = false;
  save();
  render();
  toast('Schedule draft generated. Ready for review.');
}
const handlers = {
  guide,
  close: closeModal,
  'go-register': () => {
    location.hash = 'register';
  },
  'guide-go': (el) => {
    closeModal();
    location.hash = el.dataset.route;
  },
  'read-notification': (el) => {
    state.readNotifications ??= [];
    if (!state.readNotifications.includes(el.dataset.id))
      state.readNotifications.push(el.dataset.id);
    save();
    render();
  },
  'read-all': () => {
    state.readNotifications = ['n1', 'n2', 'n3', 'registration'];
    save();
    render();
    toast('Demo notifications marked as read.');
  },
  preferences: () =>
    showModal(
      /* HTML */ `<div class="eyebrow">My league · Personal preferences</div>
        <h2 id="dialog-title">Choose your updates.</h2>
        <p>
          Your website inbox keeps league updates together. Email can also bring reminders and
          reports to you. These settings are only a demonstration.
        </p>
        <label class="check-row"
          ><input
            type="checkbox"
            id="email-reminders"
            ${state.preferences?.reminders !== false ? 'checked' : ''}
          />Email me about upcoming games and schedule changes.</label
        ><label class="check-row"
          ><input
            type="checkbox"
            id="email-reports"
            ${state.preferences?.reports !== false ? 'checked' : ''}
          />Email me my last-game report after results are finalized.</label
        >
        <div class="modal-note">
          No emails or browser notifications are sent. Browser push is a possible later feature with
          its own opt-in; the website inbox does not need browser notification permission.
        </div>
        <div class="modal-actions">${button('Save preferences', 'save-preferences')}</div>`,
    ),
  'save-preferences': () => {
    state.preferences = {
      reminders: $('#email-reminders').checked,
      reports: $('#email-reports').checked,
    };
    save();
    closeModal();
    toast('Demo preferences saved. No email was sent.');
  },
  reset: () =>
    showModal(
      /* HTML */ `<div class="eyebrow">Reset concept</div>
        <h2 id="dialog-title">Ready for a fresh walkthrough?</h2>
        <p>
          This resets only the demo’s fictional registrations, draft rehearsal, scoring, and
          appearance settings in this browser.
        </p>
        <div class="modal-actions">
          ${button('Keep exploring', 'close', '', 'btn-ghost')}${button(
            'Reset demo',
            'confirm-reset',
          )}
        </div>`,
    ),
  'confirm-reset': () => {
    Object.assign(state, {
      ...seed(),
      readNotifications: [],
      preferences: { reminders: true, reports: true },
    });
    save();
    closeModal();
    render();
    toast('Demo restored to its starting point.');
  },
  week: (el) => {
    ui.scheduleWeek = el.dataset.week;
    render();
  },
  'app-filter': (el) => {
    ui.appFilter = el.dataset.filter;
    render();
  },
  review: (el) => review(el.dataset.id),
  approve: (el) => {
    if (!$('#eligibility-check').checked) {
      toast('Confirm the school eligibility check first.');
      return;
    }
    const a = state.applications.find((a) => a.id === el.dataset.id);
    a.review = 'approved';
    if (a.placement === 'reserved') a.placement = 'confirmed';
    save();
    closeModal();
    render();
    toast(a.name + ' approved. The draft pool has been updated.');
  },
  refund: (el) => {
    const a = state.applications.find((a) => a.id === el.dataset.id);
    showModal(
      /* HTML */ `<div class="eyebrow">Finance action · Demo only</div>
        <h2 id="dialog-title">Review waitlist refund.</h2>
        <p>
          ${esc(a.name)} is paid and waitlisted. This demonstration returns the full sample fee and
          closes their playing-place request.
        </p>
        <div class="info-list">
          <div><span>PAID AMOUNT</span><strong>$75.00</strong></div>
          <div><span>SIMULATED REFUND</span><strong>$75.00</strong></div>
        </div>
        <div class="modal-note">
          In the full product, authorized finance staff would follow the approved cutoff and refund
          policy. No actual transaction occurs here.
        </div>
        <div class="modal-actions">
          ${button('Cancel', 'close', '', 'btn-ghost')}${button(
            'Simulate refund',
            'confirm-refund',
            `data-id="${a.id}"`,
          )}
        </div>`,
    );
  },
  'confirm-refund': (el) => {
    const a = state.applications.find((a) => a.id === el.dataset.id);
    if (a.payment !== 'paid') {
      toast('This sample payment has already been refunded.');
      return;
    }
    a.payment = 'refunded';
    a.placement = 'withdrawn';
    save();
    closeModal();
    render();
    toast('Simulated $75 refund recorded. No funds moved.');
  },
  pay: () => {
    const c = showModal.candidate;
    if (!c) return;
    state.registration = c;
    state.applications = state.applications.filter((a) => a.id !== 'demo-app');
    state.applications.push({
      id: 'demo-app',
      personId: 'demo-person',
      ...c,
      review: 'pending',
      placement: 'waitlist',
      payment: 'paid',
      amount: 75,
    });
    save();
    closeModal();
    render(true);
    toast('Demo payment complete. Application added to the private queue.');
  },
  'clear-registration': () => {
    state.registration = null;
    state.applications = state.applications.filter((a) => a.id !== 'demo-app');
    save();
    render();
  },
  pick: (el) => {
    try {
      state.draft = M.draftPick(
        state.draft,
        el.dataset.id,
        getDraftPlayers(),
        D.teams,
        state.config.rosterMax,
      );
      state.draft.seconds = 60;
      save();
      render();
      toast('Pick recorded. Team roster updated.');
    } catch (e) {
      toast(e.message);
    }
  },
  'undo-pick': () => {
    state.draft.picks.pop();
    state.draft.seconds = 60;
    save();
    render();
    toast('Last pick reversed. Player returned to the pool.');
  },
  'draft-timer': () => {
    state.draft.paused = !state.draft.paused;
    if (!state.draft.seconds) state.draft.seconds = 60;
    save();
    render();
  },
  'reset-draft': () =>
    showModal(
      /* HTML */ `<div class="eyebrow">Draft rehearsal</div>
        <h2 id="dialog-title">Start the practice draft again?</h2>
        <p>Captains remain assigned. All practice picks return to the available player pool.</p>
        <div class="modal-actions">
          ${button('Cancel', 'close', '', 'btn-ghost')}${button(
            'Reset draft',
            'confirm-reset-draft',
          )}
        </div>`,
    ),
  'confirm-reset-draft': () => {
    state.draft = { picks: [], paused: true, seconds: 60 };
    save();
    closeModal();
    render();
  },
  'generate-schedule': generateSchedule,
  'publish-schedule': () =>
    showModal(
      /* HTML */ `<div class="eyebrow">Schedule review</div>
        <h2 id="dialog-title">Publish this sample schedule?</h2>
        <p>
          ${state.schedule.rounds.length * 2} games across ${state.schedule.rounds.length} weeks.
          The draft has one court and no team overlaps.
        </p>
        <div class="modal-note">
          This marks the generated schedule as published in the demo. The separate public season
          preview remains unchanged. No notifications are sent.
        </div>
        <div class="modal-actions">
          ${button('Keep draft', 'close', '', 'btn-ghost')}${button(
            'Publish in demo',
            'confirm-publish',
          )}
        </div>`,
    ),
  'confirm-publish': () => {
    state.schedulePublished = true;
    save();
    closeModal();
    render();
    toast('Schedule published in the demonstration.');
  },
  clock: () => {
    if (state.live.final) return;
    state.live.running = !state.live.running;
    save();
    render();
  },
  'scorer-team': (el) => {
    ui.scorerTeam = el.dataset.team;
    ui.selectedPlayer = D.players.find((p) => p.team === ui.scorerTeam).id;
    render();
  },
  'select-player': (el) => {
    ui.selectedPlayer = el.dataset.id;
    render();
  },
  points: (el) => {
    const s = state.live.players[ui.selectedPlayer];
    if (state.live.final || !s.onCourt) return;
    const before = structuredClone(state.live.players);
    const pts = Number(el.dataset.points);
    s.points += pts;
    s.participated = true;
    addGameEvent('points', player(ui.selectedPlayer).name + ' +' + pts, before);
  },
  foul: () => {
    if (state.live.final) return;
    const before = structuredClone(state.live.players);
    state.live.players[ui.selectedPlayer].fouls++;
    addGameEvent('foul', player(ui.selectedPlayer).name + ' · foul', before);
  },
  'undo-score': () => {
    const ev = state.live.events.pop();
    if (!ev) return;
    const now = state.live.players;
    for (const [id, p] of Object.entries(ev.before)) {
      const current = now[id];
      now[id] = {
        ...p,
        seconds: current.seconds,
        participated: p.participated || current.seconds > 0,
      };
    }
    save();
    render();
    toast('Last action reversed. Elapsed playing time is preserved.');
  },
  substitution: () => {
    const ps = D.players.filter((p) => p.team === ui.scorerTeam);
    showModal(
      /* HTML */ `<div class="eyebrow">${team(ui.scorerTeam).name} · Substitution</div>
        <h2 id="dialog-title">Make the switch.</h2>
        <p>
          Playing time follows the lineup. The outgoing player’s stint ends, and the incoming player
          starts participating.
        </p>
        <div class="form-grid mt">
          <label class="field"
            >Player coming off<select id="sub-out">
              ${ps
                .filter((p) => state.live.players[p.id].onCourt)
                .map((p) => `<option value="${p.id}">${p.name}</option>`)
                .join('')}
            </select></label
          ><label class="field"
            >Player coming on<select id="sub-in">
              ${ps
                .filter((p) => !state.live.players[p.id].onCourt)
                .map((p) => `<option value="${p.id}">${p.name}</option>`)
                .join('')}
            </select></label
          >
        </div>
        <div class="modal-actions">
          ${button('Cancel', 'close', '', 'btn-ghost')}${button(
            'Confirm substitution',
            'confirm-sub',
          )}
        </div>`,
    );
  },
  'confirm-sub': () => {
    const out = $('#sub-out').value,
      into = $('#sub-in').value;
    if (!out || !into || out === into) return;
    const before = structuredClone(state.live.players);
    state.live.players[out].onCourt = false;
    state.live.players[into].onCourt = true;
    state.live.players[into].participated = true;
    ui.selectedPlayer = into;
    closeModal();
    addGameEvent('sub', player(into).name + ' on · ' + player(out).name + ' off', before);
    toast('Lineup updated. Playing time follows the substitution.');
  },
  finalize: () => {
    state.live.running = false;
    save();
    render();
    showModal(
      /* HTML */ `<div class="eyebrow">End-game review · Simulation</div>
        <h2 id="dialog-title">Review before making it final.</h2>
        <p>
          The real workflow reconciles the game’s score, appearances, minutes, and saved events.
          Here you can end the sample early to preview that final step.
        </p>
        <div class="info-list">
          <div><span>GAME</span><strong>Falcons vs Eagles</strong></div>
          <div><span>SAVING</span><strong>Browser-local demo only</strong></div>
          <div>
            <span>APPEARANCES</span
            ><strong
              >${Object.values(state.live.players).filter((p) => p.participated).length} players
              recorded</strong
            >
          </div>
          <div>
            <span>NEW ACTIONS</span><strong>${state.live.events.length} in this rehearsal</strong>
          </div>
        </div>
        <div class="modal-note">
          Finalizing freezes this scoring example. The fictional public season statistics remain a
          separate preview.
        </div>
        <div class="modal-actions">
          ${button('Return to game', 'close', '', 'btn-ghost')}${button(
            'Finalize sample game',
            'confirm-finalize',
          )}
        </div>`,
    );
  },
  'confirm-finalize': () => {
    state.live.final = true;
    state.live.running = false;
    save();
    closeModal();
    render();
    toast('Sample game finalized. Points and minutes retained in this browser.');
  },
  toggle: (el) => {
    state.config[el.dataset.key] = !state.config[el.dataset.key];
    save();
    render();
    toast('Public site configuration updated.');
  },
  color: (el) => {
    state.config.color = el.dataset.color;
    save();
    render();
    toast('Accent color updated across the concept.');
  },
  announcement: () =>
    showModal(
      /* HTML */ `<div class="eyebrow">League noticeboard</div>
        <h2 id="dialog-title">Keep everyone in the loop.</h2>
        <p>Publish a notice to the homepage. This demonstration does not send email.</p>
        <form id="announcement-form">
          <label class="field"
            >Title<input
              name="title"
              required
              maxlength="80"
              value="Open gym details are coming soon." /></label
          ><label class="field"
            >Message<textarea name="body" required maxlength="600">
Bring your energy. We’ll share the date, time, and what to expect before the captain draft.</textarea
            >
          </label>
          <div class="modal-actions">
            ${button('Cancel', 'close', '', 'btn-ghost')}<button class="btn" type="submit">
              Publish demo announcement
            </button>
          </div>
        </form>`,
    ),
};

export { handlers };
