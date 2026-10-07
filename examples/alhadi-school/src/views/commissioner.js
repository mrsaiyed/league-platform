import { D, M, state, ui, esc, team, player, initials, clock } from '@demo/context';
import { icon, crest, badge, button } from '@demo/components';
import { publicNav } from '@demo/public';
const adminLinks = [
  ['admin', 'Overview', 'home'],
  ['admin/registrations', 'Registrations', 'users'],
  ['admin/draft', 'Draft room', 'draft'],
  ['admin/schedule', 'Schedule', 'calendar'],
  ['admin/scoring', 'Live scoring', 'ball'],
  ['admin/settings', 'League settings', 'settings'],
];
const adminLayout = (body) =>
  /* HTML */ `<div class="admin-shell">
    <aside class="sidebar">
      <a class="wordmark" href="#home"
        ><img class="school-logo" src="assets/alhadi-logo.png" alt="Al-Hadi School logo" />
        <div>
          <div class="wordmark-title">AL-HADI</div>
          <small>League workspace</small>
        </div></a
      >
      <div class="nav-section">Season management</div>
      <nav class="admin-nav" aria-label="Commissioner">
        ${adminLinks
          .map(
            ([id, n, ic]) =>
              `<a class="${ui.route === id ? 'active' : ''}" href="#${id}">${icon(ic)}${n}</a>`,
          )
          .join('')}
      </nav>
      <div class="sidebar-bottom">
        <a class="section-link" href="#home" style="font-size:10px;color:#c69caa"
          >${icon('external')} View public site</a
        >
        <div class="school-account">
          <span class="avatar">LC</span>
          <div>League commissioner<small>School administrator · Demo</small></div>
        </div>
      </div>
    </aside>
    <div class="admin-main">
      <div class="workspace-bar">
        <div><b>Al-Hadi School</b><span>/</span><span>Inaugural season</span></div>
        <div>${badge('Commissioner preview', 'wine')}${icon('shield')}</div>
      </div>
      <main class="workspace-content" id="main" tabindex="-1">${body}${adminFooter()}</main>
    </div>
  </div>`;
const adminFooter = () =>
  /* HTML */ `<div class="admin-foot">
    <span>Concept workspace · Fictional student records · Changes stay in this browser</span
    ><span>Al-Hadi / Basketball</span>
  </div>`;
const adminTitle = (eyebrow, title, desc, action = '') =>
  /* HTML */ `<div class="admin-title">
    <div>
      <div class="admin-eyebrow">${eyebrow}</div>
      <h1>${title}</h1>
      <p>${desc}</p>
    </div>
    ${action}
  </div>`;
const personCell = (a) =>
  /* HTML */ `<div class="person">
    <span class="avatar">${esc(initials(a.name))}</span>
    <div><b>${esc(a.name)}</b><small>Grade ${a.grade} · Student applicant</small></div>
  </div>`;
const pendingApps = () => state.applications.filter((a) => a.review === 'pending');
function overview() {
  const pending = pendingApps(),
    paid = state.applications.filter((a) => a.payment === 'paid'),
    wait = state.applications.filter((a) => a.placement === 'waitlist'),
    approved = state.applications.filter(
      (a) => a.review === 'approved' && a.placement === 'confirmed',
    );
  return /* HTML */ `${adminTitle(
      'Your season, connected',
      'Good afternoon, Commissioner.',
      'A clear view of what’s ready—and what needs your attention.',
      button(icon('plus') + ' Announcement', 'announcement'),
    )}
    <div class="metric-grid">
      ${[
        ['Applications', state.applications.length, '28 playing places · paid waitlist', 'users'],
        [
          'Ready for the draft',
          approved.length,
          pending.length + ' awaiting school approval',
          'draft',
        ],
        [
          'Payments collected',
          '$' + paid.reduce((s, a) => s + a.amount, 0).toLocaleString(),
          'Simulated gross · before any refunds',
          'money',
        ],
        ['On the waitlist', wait.length, 'Paid applicants · managed separately', 'clock'],
      ]
        .map(
          ([l, v, f, ic]) =>
            /* HTML */ `<div class="metric-card">
              <div class="metric-label">${l}${icon(ic)}</div>
              <div class="metric-value">${v}</div>
              <div class="metric-foot">${f}</div>
            </div>`,
        )
        .join('')}
    </div>
    <div class="admin-grid">
      <div>
        <section class="panel">
          <div class="panel-heading">
            <h2>School approval queue ${badge(pending.length + ' pending', 'amber')}</h2>
            <a href="#admin/registrations">View registrations →</a>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Payment</th>
                  <th>Review</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${pending
                  .slice(0, 4)
                  .map(
                    (a) =>
                      /* HTML */ `<tr>
                        <td>${personCell(a)}</td>
                        <td>${badge('Paid $50', 'green')}</td>
                        <td>${badge('Pending', 'amber')}</td>
                        <td>
                          <button class="plain-button" data-action="review" data-id="${a.id}">
                            Review →
                          </button>
                        </td>
                      </tr>`,
                  )
                  .join('') || '<tr><td colspan="4">All applications reviewed.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>
        <section class="panel mt">
          <div class="panel-heading">
            <h2>A season with a clear next step</h2>
            <a href="#admin/settings">Manage setup →</a>
          </div>
          <div class="timeline">
            ${[
              ['check', 'Registration'],
              ['2', 'School review'],
              ['3', 'Team draft'],
              ['4', 'Game day'],
              ['5', 'Season archive'],
            ]
              .map(
                ([n, t], i) =>
                  `<div class="timeline-stage ${i === 1 ? 'current' : ''}"><span class="check-circle ${i === 0 ? 'done' : ''}">${n === 'check' ? icon('check') : n}</span>${t}</div>`,
              )
              .join('')}
          </div>
          <div class="capacity-bar">
            <span style="width:85.7%;background:#9b3a5d"></span
            ><span style="width:14.3%;background:#caa173"></span>
          </div>
          <div class="capacity-legend">
            <span
              ><i class="legend-dot" style="background:#9b3a5d"></i>${approved.length}
              confirmed</span
            ><span
              ><i class="legend-dot" style="background:#caa173"></i>${pending.length} pending
              review</span
            ><span>${wait.length} paid waitlist</span>
          </div>
        </section>
        <section class="panel mt">
          <div class="panel-heading">
            <h2>Recent activity</h2>
            ${badge('Example activity')}
          </div>
          ${[
            [
              'shield',
              'School approval is separate from payment.',
              'Eligibility decisions are recorded by the commissioner.',
            ],
            [
              'money',
              'Registration fee received at application.',
              'Waitlisted applicants are included in the paid queue.',
            ],
            [
              'draft',
              'Four captains appointed.',
              'A single host records the draft during the captains’ call.',
            ],
          ]
            .map(
              ([ic, t, d]) =>
                /* HTML */ `<div class="activity-item">
                  ${icon(ic)}
                  <div>${t}<small>${d}</small></div>
                </div>`,
            )
            .join('')}
        </section>
      </div>
      <aside>
        <section class="panel">
          <h3>Before the first tip-off</h3>
          ${[
            ['Set up league identity', true, 'Ready'],
            ['Appoint four captains', true, 'Ready'],
            ['Review student eligibility', false, pending.length + ' left'],
            ['Run the hosted draft', false, 'Next'],
            ['Confirm dates & publish', false, 'To do'],
          ]
            .map(
              ([t, done, s], i) =>
                /* HTML */ `<div class="checklist-item">
                  <span class="check-circle ${done ? 'done' : ''}"
                    >${done ? icon('check') : i + 1}</span
                  >
                  <div>${t}</div>
                  <span>${s}</span>
                </div>`,
            )
            .join('')}
        </section>
        <div class="school-preview-card">
          <div class="eyebrow">Your school. Your league.</div>
          <h3>A public home to be proud of.</h3>
          <p>Schedules, teams, results, and league information—without a login.</p>
          <a class="btn btn-gold btn-small" href="#home">Preview public site ${icon('arrow')}</a>
        </div>
        <section class="panel mt">
          <h3>The school stays in control.</h3>
          <p class="subtle" style="line-height:1.8">
            Choose the rules, appoint captains, approve players, and set staff permissions. Families
            get a simpler experience; staff get one place to manage it.
          </p>
        </section>
      </aside>
    </div>`;
}
function registrations() {
  const apps = state.applications.filter(
    (a) =>
      ui.appFilter === 'all' ||
      (ui.appFilter === 'pending'
        ? a.review === 'pending'
        : ui.appFilter === 'waitlist'
          ? a.placement === 'waitlist'
          : a.placement === 'confirmed'),
  );
  return /* HTML */ `${adminTitle(
      'Registration & eligibility',
      'Every student, accounted for.',
      'Payment, school approval, and a playing place are tracked separately.',
      button(icon('external') + ' Preview signup', 'go-register', '', 'btn-light'),
    )}
    <div class="info-banner">
      ${icon('shield')}Private commissioner view. These fictional contact and eligibility details
      never appear in public rosters.
    </div>
    <div class="filters">
      ${[
        ['all', 'All applications'],
        ['pending', 'Needs review'],
        ['confirmed', 'Confirmed'],
        ['waitlist', 'Waitlist'],
      ]
        .map(
          ([id, n]) =>
            `<button class="filter ${ui.appFilter === id ? 'active' : ''}" data-action="app-filter" data-filter="${id}">${n}</button>`,
        )
        .join('')}<label class="search-field"
        >${icon('search')}<input
          id="app-search"
          placeholder="Find a student"
          aria-label="Find a student"
      /></label>
    </div>
    <div class="panel" style="padding:7px 10px">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>School review</th>
              <th>Placement</th>
              <th>Payment</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${apps
              .map(
                (a) =>
                  /* HTML */ `<tr data-app-name="${esc(a.name.toLowerCase())}">
                    <td>${personCell(a)}</td>
                    <td>
                      ${badge(
                        a.review === 'approved'
                          ? 'Approved'
                          : a.review === 'rejected'
                            ? 'Rejected'
                            : 'Needs review',
                        a.review === 'approved' ? 'green' : 'amber',
                      )}
                    </td>
                    <td>
                      ${badge(
                        a.placement === 'confirmed'
                          ? 'Confirmed'
                          : a.placement === 'reserved'
                            ? 'Place reserved'
                            : a.placement === 'waitlist'
                              ? 'Waitlist'
                              : 'Withdrawn',
                        a.placement === 'waitlist' ? 'wine' : 'neutral',
                      )}
                    </td>
                    <td>
                      ${badge(
                        a.payment === 'paid' ? 'Paid $50' : 'Refunded',
                        a.payment === 'paid' ? 'green' : 'neutral',
                      )}
                    </td>
                    <td>
                      ${a.placement === 'waitlist' && a.payment === 'paid'
                        ? `<button class="plain-button" data-action="refund" data-id="${a.id}">Refund</button>`
                        : `<button class="plain-button" data-action="review" data-id="${a.id}">Review →</button>`}
                    </td>
                  </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div class="empty-state" id="search-empty" hidden>No students match this search.</div>
    </div>
    <p class="settings-note">
      In this example: $50 paid at application, including waitlist. Refund actions are simulated and
      require a deliberate review. Final school policies are still to be agreed.
    </p>`;
}
function draft() {
  const players = [
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
  const available = players.filter(
      (p) => !p.captain && !state.draft.picks.some((x) => x.playerId === p.id),
    ),
    picks = state.draft.picks,
    active = M.draftTeam(picks.length, D.teams);
  return /* HTML */ `${adminTitle(
      'Single-host draft · Rehearsal',
      'Build the teams. Together.',
      'Host the captains’ call, then record each choice here.',
      button(icon('undo') + ' Undo pick', 'undo-pick', picks.length ? '' : 'disabled', 'btn-light'),
    )}
    <div class="info-banner">
      ${icon('info')}Draft rehearsal: only the commissioner enters picks. This practice board is
      separate from the sample public rosters.
    </div>
    <div class="draft-clockbar">
      <div>
        <small
          >${available.length
            ? 'On the clock · Round ' +
              (Math.floor(picks.length / 4) + 1) +
              ' / Pick ' +
              (picks.length + 1)
            : 'All eligible players drafted'}</small
        >
        <h2>${crest(active, 'small')}${available.length ? team(active).name : 'Draft complete'}</h2>
      </div>
      <div style="text-align:center">
        <div class="draft-clock" id="draft-clock">${clock(state.draft.seconds)}</div>
        <small>${state.draft.paused ? 'Timer paused' : 'Host-controlled timer'}</small>
      </div>
      <div class="inline-actions">
        ${button(
          icon(state.draft.paused ? 'play' : 'pause') +
            (state.draft.paused ? ' Start timer' : ' Pause'),
          'draft-timer',
          '',
          'btn-ghost btn-small',
        )}${button('Reset board', 'reset-draft', '', 'btn-ghost btn-small')}
      </div>
    </div>
    <div class="draft-grid">
      ${D.teams
        .map((t) => {
          const captain = D.players.find((p) => p.team === t.id && p.captain),
            ps = picks.filter((p) => p.team === t.id);
          return /* HTML */ `<section
            class="draft-team ${t.id === active && available.length ? 'active' : ''}"
            style="--team-color:${t.color}"
          >
            <div class="draft-team-top">
              ${crest(t.id, 'small')}
              <div>
                <b>${t.name}</b><small>${ps.length + 1} / ${state.config.rosterMax} players</small>
              </div>
            </div>
            <div class="draft-slot captain"><span>${captain.name}</span><span>C</span></div>
            ${Array.from({ length: state.config.rosterMax - 1 }, (_, i) =>
              ps[i]
                ? /* HTML */ `<div class="draft-slot">
                    <span
                      >${esc(players.find((p) => p.id === ps[i].playerId)?.name || 'Player')}</span
                    ><span class="subtle">#${ps[i].pick}</span>
                  </div>`
                : /* HTML */ `<div class="draft-slot empty">
                    <span>Available roster spot</span><span>—</span>
                  </div>`,
            ).join('')}
          </section>`;
        })
        .join('')}
    </div>
    <div class="pool-layout">
      <section class="panel">
        <div class="panel-heading">
          <h2>Available players ${badge(available.length + ' eligible', 'green')}</h2>
          <span class="subtle">Select to draft</span>
        </div>
        <div class="pool-grid">
          ${available
            .map(
              (p) =>
                /* HTML */ `<button class="pool-player" data-action="pick" data-id="${p.id}">
                  <span><b>${esc(p.name)}</b><small>Grade ${p.grade} · Approved</small></span
                  >${icon('plus')}
                </button>`,
            )
            .join('') || '<div class="empty-state">All approved players have a team.</div>'}
        </div>
      </section>
      <section class="panel">
        <h3>Pick history</h3>
        <div class="pick-history">
          ${picks.length
            ? picks
                .slice()
                .reverse()
                .map(
                  (p) =>
                    /* HTML */ `<div>
                      <span>${String(p.pick).padStart(2, '0')}.</span>
                      <b>${esc(players.find((x) => x.id === p.playerId)?.name || 'Player')}</b
                      ><br /><span style="margin-left:19px">${team(p.team).name}</span>
                    </div>`,
                )
                .join('')
            : 'The first pick starts the story.<br>Each selection updates its team roster.'}
        </div>
        <p class="settings-note">
          Snake order · Captain occupies one roster place · Duplicate picks prevented · Reload
          restores this rehearsal.
        </p>
      </section>
    </div>`;
}
function adminSchedule() {
  return /* HTML */ `${adminTitle(
      'Competition & scheduling',
      'From availability to game day.',
      'Generate a draft, review the matchups, then publish when the school is ready.',
      state.schedule
        ? button(
            icon('check') + (state.schedulePublished ? ' Published in demo' : ' Publish schedule'),
            'publish-schedule',
            state.schedulePublished ? 'disabled' : '',
          )
        : button(icon('calendar') + ' Generate draft', 'generate-schedule'),
    )}
    <section class="panel">
      <div class="panel-heading">
        <h2>Build the season around your school.</h2>
        ${badge('4 teams · round robin', 'wine')}
      </div>
      <div class="schedule-generator">
        <label class="field"
          >Season start (example)<input id="start-date" type="date" value="2026-11-06" /></label
        ><label class="field"
          >First tip-off<input id="start-time" type="time" value="16:00" /></label
        ><label class="field"
          >Court<select id="court">
            <option>School gym · Court 1</option>
          </select></label
        ><label class="field"
          >Games per matchup<select id="repetitions">
            <option value="1">1 · Three game weeks</option>
            <option value="2" selected>2 · Six game weeks</option>
          </select></label
        >
      </div>
      <div class="inline-actions">
        ${button(icon('calendar') + ' Generate draft', 'generate-schedule', '', 'btn-small')}<span
          class="subtle"
          >60-minute slots · Two games each week · One court</span
        >
      </div>
    </section>
    ${state.schedule
      ? /* HTML */ `<div class="info-banner mt">
            ${icon('check')}${state.schedulePublished
              ? 'Schedule published in this demonstration. No messages were sent.'
              : 'Draft generated. No team or court overlaps. Review before publishing.'}
          </div>
          ${state.schedule.rounds
            .map(
              (row, i) =>
                /* HTML */ `<section class="panel mt">
                  <div class="panel-heading">
                    <h2>Week ${i + 1} <span class="subtle">· ${esc(row.date)}</span></h2>
                    ${badge(
                      state.schedulePublished ? 'Published' : 'Draft',
                      state.schedulePublished ? 'green' : 'amber',
                    )}
                  </div>
                  ${row.games
                    .map(
                      (g) =>
                        /* HTML */ `<div class="schedule-row">
                          <div class="time-block">${g.time}<small>School gym</small></div>
                          <div class="team-cell">${crest(g.home, 'small')}${team(g.home).name}</div>
                          <div class="team-cell">${crest(g.away, 'small')}${team(g.away).name}</div>
                          <div>${badge('Court 1')}</div>
                        </div>`,
                    )
                    .join('')}
                </section>`,
            )
            .join('')}`
      : /* HTML */ `<div class="panel mt">
          <div class="empty-state">
            ${icon('calendar')}Your season is ready to take shape.<br /><span style="font-size:10px"
              >Choose the first game date, then generate a reviewable draft.</span
            >
          </div>
        </div>`}
    <p class="settings-note">
      This concept demonstrates weekly round-robin scheduling. The full specification adds
      availability windows, blackouts, rest rules, manual adjustments, and change notifications.
      Generated demo dates do not replace the sample public schedule.
    </p>`;
}
function scoring() {
  const l = state.live,
    ps = D.players.filter((p) => p.team === ui.scorerTeam),
    selected = player(ui.selectedPlayer) || ps[0],
    sum = (t) =>
      D.players.filter((p) => p.team === t).reduce((s, p) => s + (l.players[p.id]?.points || 0), 0);
  return /* HTML */ `${adminTitle(
      'Courtside tools · Sample game',
      'Keep your eyes on the game.',
      'Record points, substitutions, and playing time from one place.',
      button(
        icon('check') + (l.final ? ' Finalized in demo' : ' Review & finalize'),
        'finalize',
        l.final ? 'disabled' : '',
      ),
    )}
    <div class="scorer-layout">
      <div>
        <div class="scorer-board">
          <div>
            ${crest('falcons')}
            <h3>Falcons</h3>
            <div class="score" id="score-falcons">${sum('falcons')}</div>
          </div>
          <div>
            <div class="clock-value" id="live-clock">${clock(l.remaining)}</div>
            <div class="clock-label">
              1ST HALF ·
              ${l.final ? 'FINALIZED DEMO' : l.running ? 'CLOCK RUNNING' : 'CLOCK PAUSED'}
            </div>
            ${button(
              icon(l.running ? 'pause' : 'play') + (l.running ? ' Pause' : ' Start clock'),
              'clock',
              l.final ? 'disabled' : '',
              'btn-ghost btn-small',
            )}
          </div>
          <div>
            ${crest('eagles')}
            <h3>Eagles</h3>
            <div class="score" id="score-eagles">${sum('eagles')}</div>
          </div>
        </div>
        <div class="panel mt">
          <div class="panel-heading">
            <h2>Players & participation</h2>
            <span class="save-status">Saved in this demo</span>
          </div>
          <div class="filters">
            ${['falcons', 'eagles']
              .map(
                (t) =>
                  `<button class="filter ${ui.scorerTeam === t ? 'active' : ''}" data-action="scorer-team" data-team="${t}">${team(t).name}</button>`,
              )
              .join('')}
          </div>
          <div class="court-list">
            ${ps
              .map((p) => {
                const s = l.players[p.id];
                return /* HTML */ `<button
                  class="scorer-player ${p.id === ui.selectedPlayer ? 'selected' : ''}"
                  data-action="select-player"
                  data-id="${p.id}"
                >
                  <span class="player-num">${p.number}</span
                  ><span class="name"
                    >${p.name}<small
                      >${s.onCourt
                        ? 'On court'
                        : s.participated
                          ? 'Bench · has appeared'
                          : 'Bench · not yet played'}</small
                    ></span
                  ><span class="player-time" data-player-seconds="${p.id}">${clock(s.seconds)}</span
                  ><span class="player-points"
                    >${s.points}<small style="font-size:8px;font-weight:400"> PTS</small></span
                  >
                </button>`;
              })
              .join('')}
          </div>
          <div class="inline-actions">
            ${button(
              icon('users') + ' Substitute player',
              'substitution',
              l.final ? 'disabled' : '',
              'btn-light btn-small',
            )}<span class="subtle">Time follows the on-court lineup.</span>
          </div>
        </div>
      </div>
      <aside>
        <div class="panel">
          <div class="admin-eyebrow">Selected player</div>
          <h3 style="font-size:18px;margin-bottom:6px">${selected.name}</h3>
          <div class="subtle">
            #${selected.number} ·
            ${team(selected.team).name}${l.players[selected.id]?.onCourt
              ? ' · On court'
              : ' · Bench'}
          </div>
          <div class="score-actions">
            ${[1, 2, 3]
              .map(
                (n) =>
                  /* HTML */ `<button
                    data-action="points"
                    data-points="${n}"
                    ${l.final || !l.players[selected.id]?.onCourt ? 'disabled' : ''}
                  >
                    +${n}<small
                      >${n === 1 ? 'FREE THROW' : n === 2 ? 'TWO POINTS' : 'THREE POINTS'}</small
                    >
                  </button>`,
              )
              .join('')}
          </div>
          <div class="inline-actions">
            ${button(
              'Record foul',
              'foul',
              l.final ? 'disabled' : '',
              'btn-light btn-small',
            )}${button(
              icon('undo') + ' Undo',
              'undo-score',
              !l.events.length || l.final ? 'disabled' : '',
              'btn-light btn-small',
            )}
          </div>
          <p class="settings-note">
            ${l.players[selected.id]?.fouls || 0} personal fouls ·
            ${l.players[selected.id]?.participated
              ? 'Appearance recorded'
              : 'Has not entered the game'}
          </p>
        </div>
        <div class="panel mt">
          <h3>Game activity</h3>
          ${l.events
            .slice(-6)
            .reverse()
            .map(
              (e) =>
                /* HTML */ `<div class="scorer-event">
                  <span>${esc(e.label)}</span><small>${e.at}</small>
                </div>`,
            )
            .join('') ||
          '<p class="subtle">The sample starts at 32–28. New actions will appear here.</p>'}
          <p class="settings-note">
            Concept saving is browser-local. The production design saves game events and minutes to
            the database.
          </p>
        </div>
      </aside>
    </div>`;
}
function settings() {
  return /* HTML */ `${adminTitle(
      'Identity & league controls',
      'Your league. Your way.',
      'A shared platform with a school identity that feels like yours.',
      /* HTML */ `<a class="btn btn-light" href="#home"
        >Preview public site ${icon('external')}</a
      >`,
    )}
    <div class="settings-grid">
      <div>
        <section class="panel">
          <h3>School identity</h3>
          <div class="person" style="margin:23px 0">
            <img class="school-logo" src="assets/alhadi-logo.png" alt="Al-Hadi school logo" />
            <div><b>Al-Hadi School</b><small>Intramural basketball · Inaugural season</small></div>
          </div>
          <div class="field">Accent color</div>
          <div class="swatches">
            ${['#96062d', '#275766', '#315844']
              .map(
                (c) =>
                  `<button aria-label="${c === '#96062d' ? 'School burgundy' : c === '#275766' ? 'Slate blue' : 'Forest green'} accent" class="swatch ${state.config.color === c ? 'active' : ''}" style="background:${c}" data-action="color" data-color="${c}"></button>`,
              )
              .join('')}
          </div>
          <p class="settings-note">
            Burgundy is drawn from the school logo. Accent changes demonstrate how another league
            could bring its own identity.
          </p>
        </section>
        <section class="panel mt">
          <h3>Public navigation & sections</h3>
          ${[
            ['stats', 'Statistics', 'Player totals, appearances, and scoring averages'],
            ['awards', 'Awards', 'Weekly recognition and season awards'],
            ['openGym', 'Open gym notice', 'Scouting-session information on league pages'],
          ]
            .map(
              ([key, t, d]) =>
                /* HTML */ `<div class="setting-row">
                  <div><b>${t}</b><small>${d}</small></div>
                  <button
                    class="switch ${state.config[key] ? 'on' : ''}"
                    role="switch"
                    aria-checked="${state.config[key]}"
                    aria-label="Show ${t}"
                    data-action="toggle"
                    data-key="${key}"
                  ></button>
                </div>`,
            )
            .join('')}
          <p class="settings-note">
            Changes update this demo immediately. Core pages remain easy to find: home, schedule,
            teams, standings, and league info.
          </p>
        </section>
        <section class="panel mt">
          <h3>Who can do what</h3>
          ${[
            ['Commissioner', 'Configure, approve, draft, and finalize'],
            ['Captain', 'View the approved draft pool and team roster'],
            ['Scorekeeper', 'Record events for assigned games'],
          ]
            .map(
              ([t, d]) =>
                /* HTML */ `<div class="setting-row">
                  <div><b>${t}</b><small>${d}</small></div>
                  ${icon('shield')}
                </div>`,
            )
            .join('')}
          <p class="settings-note">
            Role descriptions are part of the concept. Production authentication and permissions are
            not implemented in this prototype.
          </p>
        </section>
      </div>
      <div>
        <section class="panel">
          <div class="panel-heading">
            <h2>Public site preview</h2>
            ${badge('School theme', 'wine')}
          </div>
          <div class="preview-mini">
            <div class="preview-mini-top">
              <span>AL-HADI</span
              ><img
                src="assets/alhadi-logo.png"
                alt="School logo"
                style="width:24px;border-radius:50%"
              />
            </div>
            <div class="preview-mini-tabs">
              ${publicNav()
                .map(([, n]) => /* HTML */ `<span>${n}</span>`)
                .join('')}
            </div>
            <div class="preview-mini-hero">
              <h3>AL-HADI<br />BASKETBALL</h3>
            </div>
          </div>
          <a class="btn btn-light wide-button mt" href="#home"
            >Open full preview ${icon('arrow')}</a
          >
        </section>
        <section class="panel mt">
          <h3>The school pilot</h3>
          ${[
            ['Sport', 'Basketball'],
            ['Eligibility', 'Grades 9–12'],
            ['Teams', '4'],
            ['Roster size', '6–7 per team'],
            ['Registration', 'Individual · paid at application'],
            ['Verification', 'Manual school approval'],
            ['Draft', 'One host · captains on a call'],
          ]
            .map(
              ([t, v]) =>
                /* HTML */ `<div class="setting-row">
                  <span class="subtle">${t}</span
                  ><b style="font-size:10px;text-align:right">${v}</b>
                </div>`,
            )
            .join('')}
        </section>
        <div class="info-banner mt">
          ${icon('info')}Dates, rules, exact fee, and refund policy remain configurable decisions
          for the school. The sample is not an approved school program.
        </div>
      </div>
    </div>`;
}

export { adminLayout, overview, registrations, draft, adminSchedule, scoring, settings };
