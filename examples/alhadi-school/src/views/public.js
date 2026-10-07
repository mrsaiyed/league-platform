import { D, state, ui, esc, team, player, initials, clock } from '@demo/context';
import {
  icon,
  crest,
  badge,
  button,
  stats,
  standings,
  statsTable,
  standingsTable,
  matchCard,
} from '@demo/components';
function publicNav() {
  return [
    ['home', 'Home'],
    ['schedule', 'Schedule'],
    ['teams', 'Teams'],
    ['standings', 'Standings'],
    ...(state.config.stats ? [['stats', 'Stats']] : []),
    ...(state.config.awards ? [['awards', 'Awards']] : []),
    ['about', 'League info'],
  ];
}
const publicHeader = () =>
  /* HTML */ `<header class="public-head">
    <div class="public-top">
      <a href="#home" class="wordmark"
        ><img
          class="school-logo"
          src="assets/alhadi-logo.png"
          alt="Al-Hadi School of Accelerative Learning"
        />
        <div>
          <div class="wordmark-title">AL-HADI</div>
          <small>Intramural basketball</small>
        </div></a
      >
      <div class="public-top-right">
        <a class="account-link" href="#my-league" aria-label="My league and notifications"
          >${icon('mail')}<span>My league</span
          ><i
            >${(state.registration ? 1 : 3) -
            (state.readNotifications || []).filter((id) =>
              (state.registration ? ['registration'] : ['n1', 'n2', 'n3']).includes(id),
            ).length}</i
          ></a
        >
        <div class="season-pill">INAUGURAL SEASON ${icon('down')}</div>
        <a class="top-join" href="#register">Student registration ${icon('arrow')}</a>
      </div>
    </div>
    <nav class="public-nav" aria-label="League">
      ${publicNav()
        .map(([id, n]) => `<a class="${ui.route === id ? 'active' : ''}" href="#${id}">${n}</a>`)
        .join('')}
    </nav>
  </header>`;
const footer = () =>
  /* HTML */ `<footer class="public-footer">
    <div>
      <b>AL-HADI BASKETBALL</b>
      <p>A place to play. A school to play for.</p>
    </div>
    <div>
      School league concept · All names, results, and teams are fictional.<br />Dates, rules, fee,
      and policies are subject to school approval.
    </div>
    <a href="#admin">Commissioner workspace ${icon('external')}</a>
  </footer>`;
const intro = (kicker, title, desc = '') =>
  /* HTML */ `<div class="page-intro">
    <div class="eyebrow">${kicker}</div>
    <h1>${title}</h1>
    ${desc ? /* HTML */ `<p>${desc}</p>` : ''}
  </div>`;
const sectionHeading = (label, title, link = '', url = '') =>
  /* HTML */ `<div class="section-heading">
    <div>
      <div class="eyebrow">${label}</div>
      <h2>${title}</h2>
    </div>
    ${link ? `<a class="section-link" href="#${url}">${link} ${icon('arrow')}</a>` : ''}
  </div>`;
function home() {
  return /* HTML */ `<section class="hero">
      <img
        class="hero-bg"
        src="assets/gym-hero.png"
        alt="Illustrative empty basketball gym with a ball on the hardwood"
      />
      <div class="hero-inner">
        <div class="eyebrow">One school. Four teams. A new tradition.</div>
        <h1>AL-HADI<br /><em>BASKETBALL</em></h1>
        <p class="hero-copy">
          Your teammates. Your biggest moments.<br />A league that brings our school together.
        </p>
        <div class="hero-actions">
          <a class="btn btn-gold" href="#schedule">Explore the season ${icon('arrow')}</a
          ><a class="btn btn-ghost" href="#register">Join the league</a>
        </div>
      </div>
      <div class="hero-seal">THE INAUGURAL SEASON · GRADES 9–12</div>
      <div class="hero-note">Illustrative court · Concept photography</div>
    </section>
    <div class="number-strip">
      <div><strong>04</strong><span>School teams</span></div>
      <div><strong>6–7</strong><span>Players per team</span></div>
      <div><strong>9–12</strong><span>Student grades</span></div>
      <div><strong>01</strong><span>School community</span></div>
    </div>
    <div class="public-content">
      ${sectionHeading('On the court', 'The next matchups', 'Full schedule', 'schedule')}
      <div class="matchups">
        ${D.games
          .filter((g) => g.week === 3)
          .map(matchCard)
          .join('')}
      </div>
      <div class="two-col">
        <div>
          ${sectionHeading('Season preview', 'The standings', 'View all', 'standings')}
          <div class="panel" style="padding:6px 10px">${standingsTable()}</div>
        </div>
        <div>
          ${sectionHeading('Around the league', 'The noticeboard')}
          <div class="news-item">
            <time>Commissioner announcement</time>
            <h4>
              ${state.announcement ? esc(state.announcement.title) : 'A new tradition starts here.'}
            </h4>
            <p>
              ${state.announcement
                ? esc(state.announcement.body)
                : 'Individual signup. School-appointed captains. Four teams, one shared season.'}
            </p>
          </div>
          <div class="news-item">
            <time>${state.config.openGym ? 'Before the draft' : 'League information'}</time>
            <h4>
              ${state.config.openGym
                ? 'Meet us at open gym.'
                : 'A league built around our students.'}
            </h4>
            <p>
              ${state.config.openGym
                ? 'Get on the court before teams are selected. Session details will be announced by the school.'
                : 'Follow games, check your team, and celebrate the season in one place.'}
            </p>
          </div>
        </div>
      </div>
      ${state.config.stats
        ? /* HTML */ `<div style="margin-top:44px">
            ${sectionHeading(
              'Individual effort. Team success.',
              'Leading the way',
              'All player stats',
              'stats',
            )}
            <div class="leader-grid">
              ${stats()
                .slice(0, 3)
                .map(
                  (p, i) =>
                    /* HTML */ `<a class="leader ${i === 0 ? 'featured' : ''}" href="#stats"
                      ><div class="position-tag">
                        ${String(i + 1).padStart(2, '0')} / SCORING LEADERS
                      </div>
                      ${crest(p.team)}
                      <div class="big-stat">${p.ppg.toFixed(1)} <small>PPG</small></div>
                      <h3>${p.name}</h3>
                      <p>${team(p.team).name} · ${p.gp} games played</p></a
                    >`,
                )
                .join('')}
            </div>
          </div>`
        : ''}
      <div class="banner-cta">
        <div>
          <h2>Every season starts with showing up.</h2>
          <p>Student signup for grades 9–12. School approval required.</p>
        </div>
        <a class="btn btn-gold" href="#register">Preview registration ${icon('arrow')}</a>
      </div>
    </div>`;
}
function schedule() {
  const gs = D.games.filter(
    (g) =>
      (ui.scheduleWeek === 'all' || g.week === Number(ui.scheduleWeek)) &&
      (ui.scheduleTeam === 'all' || [g.home, g.away].includes(ui.scheduleTeam)),
  );
  return /* HTML */ `<div class="public-content">
    ${intro(
      'The season, at a glance',
      'Game day starts here.',
      'Find your team. Plan your week. Sample times shown below; the school will set official dates.',
    )}
    <div class="filters">
      ${['all', 1, 2, 3, 4, 5, 6]
        .map(
          (w) =>
            `<button class="filter ${String(ui.scheduleWeek) === String(w) ? 'active' : ''}" data-action="week" data-week="${w}">${w === 'all' ? 'All weeks' : 'Week ' + w}</button>`,
        )
        .join('')}<select class="dark-select" id="schedule-team" aria-label="Filter by team">
        <option value="all">All teams</option>
        ${D.teams
          .map(
            (t) =>
              `<option value="${t.id}" ${ui.scheduleTeam === t.id ? 'selected' : ''}>${t.name}</option>`,
          )
          .join('')}
      </select>
    </div>
    ${[...new Set(gs.map((g) => g.week))]
      .map(
        (w) =>
          /* HTML */ `<div class="week-label">
              Week ${w} <span style="color:#856b79">/</span> ${w < 3
                ? 'Completed · sample results'
                : 'Upcoming · date TBD'}
            </div>
            <div class="matchups">
              ${gs
                .filter((g) => g.week === w)
                .map(matchCard)
                .join('')}
            </div>`,
      )
      .join('')}
    <p class="caption">
      Illustrative schedule · Times are local to the school. All games shown at the school gym.
    </p>
  </div>`;
}
function teams() {
  return /* HTML */ `<div class="public-content">
    ${intro(
      'Different jerseys. Same school.',
      'Meet the teams.',
      'Four teams, each led by a commissioner-appointed captain. Names, colors, and rosters below are examples.',
    )}
    <div class="team-grid">
      ${D.teams
        .map(
          (t) =>
            /* HTML */ `<a class="team-card" style="--team-color:${t.color}" href="#team/${t.id}"
              >${crest(t.id, 'large')}
              <h2>${t.name}</h2>
              <p>${t.motto}</p>
              <div class="team-card-foot"><span>6 players</span><span>View roster →</span></div></a
            >`,
        )
        .join('')}
    </div>
    <div class="banner-cta">
      <div>
        <h2>More than a name on a roster.</h2>
        <p>Every player gets a team, a schedule, and a place in the season’s story.</p>
      </div>
      <a class="btn btn-ghost" href="#about">How the league works ${icon('arrow')}</a>
    </div>
  </div>`;
}
function teamPage(id) {
  const t = team(id) || D.teams[0],
    s = standings().find((x) => x.id === t.id);
  return /* HTML */ `<div class="public-content">
    <a class="section-link" href="#teams">← All teams</a>
    <div class="roster-head">
      ${crest(t.id, 'large')}
      <div>
        <div class="eyebrow">Al-Hadi basketball</div>
        <h1>${t.name}</h1>
        <p class="subtle">${s.wins} wins · ${s.losses} losses · ${t.motto}</p>
      </div>
    </div>
    <div class="panel">
      <h3>The roster</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Player</th>
              <th>Role</th>
              <th>GP</th>
              <th>PPG</th>
            </tr>
          </thead>
          <tbody>
            ${stats()
              .filter((p) => p.team === t.id)
              .map(
                (p) =>
                  /* HTML */ `<tr>
                    <td class="rank">${p.number}</td>
                    <td><b>${p.name}</b></td>
                    <td>${p.captain ? badge('Captain', 'wine') : 'Player'}</td>
                    <td>${p.gp}</td>
                    <td>${p.ppg === null ? '—' : p.ppg.toFixed(1)}</td>
                  </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="mt">
      ${sectionHeading('Next on the schedule', 'Upcoming games')}
      <div class="matchups">
        ${D.games
          .filter((g) => g.week === 3 && [g.home, g.away].includes(t.id))
          .map(matchCard)
          .join('')}
      </div>
    </div>
    <p class="caption">
      Public roster preview · Registration, grade verification, and contact details stay in the
      commissioner workspace.
    </p>
  </div>`;
}
function statsPage() {
  const p = stats()[0];
  return /* HTML */ `<div class="public-content">
    ${intro(
      'Every contribution counts',
      'The numbers tell a story.',
      'Season points, appearances, and scoring averages. Official totals are based on finalized games.',
    )}
    <div class="leader-grid">
      <div class="leader featured">
        <div class="position-tag">SCORING LEADER</div>
        ${crest(p.team)}
        <div class="big-stat">${p.ppg.toFixed(1)} <small>PPG</small></div>
        <h3>${p.name}</h3>
        <p>${team(p.team).name} · ${p.points} season points</p>
      </div>
      <div class="leader">
        <div class="position-tag">THE SEASON SO FAR</div>
        <div class="big-stat">04 <small>GAMES</small></div>
        <h3>Every game recorded.</h3>
        <p>Final scores and individual contributions.</p>
      </div>
      <div class="leader">
        <div class="position-tag">MORE THAN SCORING</div>
        <div class="big-stat">24 <small>PLAYERS</small></div>
        <h3>Every appearance matters.</h3>
        <p>Zero points still counts as a game played.</p>
      </div>
    </div>
    <div class="panel" style="padding:8px 10px">${statsTable()}</div>
    <p class="caption">
      GP = games played · PTS = season points · PPG = points per game · MIN = total minutes:seconds.
      Fictional sample season.
    </p>
  </div>`;
}
function about() {
  return /* HTML */ `<div class="public-content">
    ${intro(
      'Built for our school',
      'A place to play. A reason to belong.',
      'An intramural basketball season for Al-Hadi students in grades 9–12, organized by the school and led on the court by student captains.',
    )}
    <div class="rules-grid">
      <div>
        <div class="info-list">
          <div><span>WHO CAN JOIN</span><strong>Grades 9–12</strong></div>
          <div><span>LEAGUE SIZE</span><strong>4 teams · 6–7 players</strong></div>
          <div><span>TEAM FORMATION</span><strong>Captain draft, hosted by staff</strong></div>
          <div><span>PARTICIPATION FEE</span><strong>$50 proposed · paid at signup</strong></div>
        </div>
        <div class="panel">
          <h3>The school sets the rules.</h3>
          <p style="color:#bda7b4;font-size:12px;line-height:1.9">
            Game length, season dates, playoffs, roster limits, and refund policies will be approved
            by the school before registration opens. The commissioner can publish those decisions
            here.
          </p>
        </div>
      </div>
      <div class="panel">
        <h3>Your ui.route to game day</h3>
        ${[
          [
            'Sign up & pay',
            'Submit your student details and the participation fee. A paid waitlist is available when places fill.',
          ],
          ['School approval', 'Staff verify eligibility and confirm your registration status.'],
          [
            'Open gym & team draft',
            'Meet the captains. The commissioner hosts the draft and publishes teams.',
          ],
          [
            'Show up & play',
            'Follow your schedule, game results, standings, and individual progress.',
          ],
        ]
          .map(
            ([t, d], i) =>
              /* HTML */ `<div class="step-row">
                <span class="step-number">0${i + 1}</span>
                <div>
                  <h3>${t}</h3>
                  <p>${d}</p>
                </div>
              </div>`,
          )
          .join('')}
      </div>
    </div>
    ${state.config.openGym
      ? /* HTML */ `<div class="banner-cta">
          <div>
            <div class="eyebrow">Before the season</div>
            <h2 style="margin-top:12px">Open gym. Open possibilities.</h2>
            <p>
              Date and time to be announced by the school. Approved players will receive details.
            </p>
          </div>
          <a href="#register" class="btn btn-gold">Preview signup ${icon('arrow')}</a>
        </div>`
      : ''}
  </div>`;
}

function myLeague() {
  const applicant = state.registration;
  const name = applicant ? applicant.name : 'Adam Rahman';
  const notices = applicant
    ? [
        {
          id: 'registration',
          title: 'Your application is in.',
          body: 'Demo payment received. School review is pending and you are on the paid waitlist.',
          label: 'Registration',
          url: 'register',
          link: 'View application',
        },
      ]
    : [
        {
          id: 'n1',
          title: 'Your next game is coming up.',
          body: 'Falcons vs Eagles · Week 3 · 4:00 PM. The school will confirm the date.',
          label: 'Game reminder',
          url: 'game/g5',
          link: 'View matchup',
        },
        {
          id: 'n2',
          title: 'Your last-game report is ready.',
          body: 'Falcons 51–45 Knights. You recorded 16 points and 30:00 on court in this sample game.',
          label: 'Final result',
          url: 'game/g3',
          link: 'View game report',
        },
        {
          id: 'n3',
          title: 'Welcome to the Falcons.',
          body: 'Your captain is assigned. Your team roster and season schedule are ready to explore.',
          label: 'Team assignment',
          url: 'team/falcons',
          link: 'Meet your team',
        },
      ];
  return (
    '<div class="public-content">' +
    intro(
      'Personal player view · Demo',
      'Your league, in one place.',
      'Welcome, ' + esc(name) + '. Your application, your team, and your updates stay connected.',
    ) +
    '<div class="personal-layout"><div><section class="panel"><div class="panel-heading"><h2 style="font:25px var(--serif)">Your inbox</h2><button class="section-link" style="color:var(--gold)" data-action="read-all">Mark all read</button></div>' +
    notices
      .map(
        (n) =>
          '<article class="inbox-item ' +
          ((state.readNotifications || []).includes(n.id) ? 'is-read' : '') +
          '"><div class="inbox-dot"></div><div><span class="position-tag">' +
          n.label +
          '</span><h3>' +
          n.title +
          '</h3><p>' +
          n.body +
          '</p><div class="inline-actions mt"><a class="section-link" href="#' +
          n.url +
          '">' +
          n.link +
          ' ' +
          icon('arrow') +
          '</a>' +
          (!(state.readNotifications || []).includes(n.id)
            ? '<button class="plain-button" style="color:#b896a6" data-action="read-notification" data-id="' +
              n.id +
              '">Mark read</button>'
            : '<span class="subtle">Read</span>') +
          '</div></div></article>',
      )
      .join('') +
    '</section></div><aside><section class="panel"><div class="eyebrow">My profile</div><div class="personal-profile"><span class="avatar">' +
    esc(initials(name)) +
    '</span><div><h3>' +
    esc(name) +
    '</h3><p>' +
    (applicant ? 'Application pending · No team yet' : 'Falcons · #3 · Sample player') +
    '</p></div></div><div class="personal-summary">' +
    (applicant
      ? '<div><strong>Paid</strong><small>Simulated $50</small></div><div><strong>Waitlist</strong><small>School review pending</small></div>'
      : '<div><strong>17.0</strong><small>Season PPG</small></div><div><strong>02</strong><small>Games played</small></div>') +
    '</div><button class="btn btn-ghost wide-button mt" data-action="preferences">' +
    icon('mail') +
    ' Update preferences</button></section><section class="panel mt"><h3>A useful account from day one.</h3><p class="subtle" style="line-height:1.9">Signup creates or reuses your account. In the full product, email verification secures access to your personal information and notifications.</p><p class="caption">This view is a fictional account preview. It does not implement sign-in or access control.</p></section></aside></div></div>'
  );
}

function awards() {
  return /* HTML */ `<div class="public-content">
    ${intro(
      'Recognizing the moments that matter',
      'A season worth celebrating.',
      'An optional space for weekly recognition and end-of-season awards. These are illustrative award categories.',
    )}
    <div class="award-grid">
      ${[
        ['01', 'Player of the week', 'Effort that elevates a team.'],
        ['02', 'Sportsmanship', 'How we play matters.'],
        ['03', 'League champions', 'A place in the school’s story.'],
      ]
        .map(
          ([n, t, d]) =>
            /* HTML */ `<div class="award-card">
              <div class="position-tag">SEASON RECOGNITION / ${n}</div>
              <div class="award-mark">
                ${icon('trophy').replace(
                  'class="icon"',
                  'class="icon" style="width:65px;height:65px;stroke-width:1"',
                )}
              </div>
              <h2>${t}</h2>
              <p>${d}</p>
              <div style="margin-top:24px">${badge('To be announced')}</div>
            </div>`,
        )
        .join('')}
    </div>
    <p class="caption">
      The commissioner chooses which award categories to publish. This tab can be hidden entirely.
    </p>
  </div>`;
}
function registration() {
  if (state.registration) return registrationStatus();
  return /* HTML */ `<div class="public-content">
    ${intro(
      'Your season starts here',
      'Find your place on the court.',
      'Individual registration for students in grades 9–12. This is a practice signup; use the fictional details provided.',
    )}
    <div class="registration-layout">
      <form class="registration-form" id="registration-form">
        <h2 class="form-section-title">Student details</h2>
        <div class="form-grid">
          <label class="field"
            >Student name<input
              name="name"
              value="Demo Student"
              required
              maxlength="60"
              autocomplete="off" /></label
          ><label class="field"
            >Grade<select name="grade" required>
              <option value="">Select grade</option>
              ${[9, 10, 11, 12].map((n) => `<option value="${n}">Grade ${n}</option>`).join('')}
            </select></label
          ><label class="field full"
            >Student contact email<input
              type="email"
              name="email"
              value="demo@example.com"
              required
              maxlength="120"
              autocomplete="off"
          /></label>
        </div>
        <p class="form-help">
          The school verifies eligibility before confirming a playing place. Contact details are not
          shown on the public league site.
        </p>
        <h2 class="form-section-title" style="margin-top:29px">Payment & placement</h2>
        <div class="info-banner">
          ${icon('info')}This sample league has 28 reserved or confirmed places. New applications
          join the paid waitlist.
        </div>
        <label class="check-row"
          ><input type="checkbox" name="consent" required /><span
            >I understand this is a simulated $50 payment at application, including the waitlist.
            Payment does not guarantee a playing place. The school’s final fee and refund policy are
            still to be agreed.</span
          ></label
        ><button type="submit" class="btn wide-button">
          Continue to demo payment ${icon('arrow')}
        </button>
        <p class="form-help" style="text-align:center">
          No real payment details are requested or collected.
        </p>
      </form>
      <aside>
        <div class="price-box">
          <div class="eyebrow">Inaugural season</div>
          <div class="price">$50 <small>/ student</small></div>
          <p>Illustrative participation fee.<br />School approval required.</p>
          <ul>
            <li>Individual student registration</li>
            <li>Commissioner-hosted team draft</li>
            <li>Team schedule and season results</li>
            <li>Public stats and league updates</li>
          </ul>
          <div class="private-note">
            ${icon('shield')}Registration and contact details stay private in the planned product.
          </div>
        </div>
        <p class="caption">
          Waitlisted applicants pay at signup. Refunds can be issued after the season starts; exact
          rules remain a school decision.
        </p>
      </aside>
    </div>
  </div>`;
}
function registrationStatus() {
  const r = state.registration;
  return /* HTML */ `<div class="public-content">
    ${intro(
      'Your registration',
      'You’re on the list.',
      'A simple status page keeps students informed after signup.',
    )}
    <div class="registration-form" style="max-width:800px;margin:auto">
      <div class="result-success">
        <div class="success-icon">${icon('check')}</div>
        <h2>Application received, ${esc(r.name.split(' ')[0])}.</h2>
        <p class="form-help">
          Demo payment complete. The school reviews eligibility before a place is confirmed.
        </p>
        <div class="status-cards">
          <div>PAYMENT<strong>$50 · Simulated paid</strong></div>
          <div>SCHOOL REVIEW<strong>Pending approval</strong></div>
          <div>PLACEMENT<strong>Paid waitlist</strong></div>
        </div>
        <p class="form-help">
          In the full product, a confirmation email and future updates would be sent to your
          verified contact. This concept sends no emails.
        </p>
        <div class="inline-actions" style="justify-content:center;margin-top:25px">
          <a class="btn" href="#home">Back to league</a>${button(
            'Try signup again',
            'clear-registration',
            '',
            'btn-light',
          )}
        </div>
      </div>
    </div>
  </div>`;
}
function gamePage(id) {
  const g = D.games.find((x) => x.id === id) || D.games[4];
  return /* HTML */ `<div class="public-content">
    <a href="#schedule" class="section-link">← Back to schedule</a>
    <div class="page-intro">
      <div class="eyebrow">
        Week ${g.week} · ${g.status === 'final' ? 'Final result' : 'Upcoming game'}
      </div>
    </div>
    <div class="game-scoreboard">
      ${badge(
        g.status === 'final' ? 'Final · sample result' : 'Date to be confirmed',
        g.status === 'final' ? 'green' : 'neutral',
      )}
      <div class="match-teams">
        <div class="match-team">${crest(g.home, 'large')}<b>${team(g.home).name}</b></div>
        <div class="match-score">
          ${g.status === 'final' ? g.homeScore + ' : ' + g.awayScore : 'VS'}
        </div>
        <div class="match-team">${crest(g.away, 'large')}<b>${team(g.away).name}</b></div>
      </div>
      <div class="subtle">${icon('pin')} School gym · ${g.time}</div>
    </div>
    ${g.status === 'final'
      ? /* HTML */ `<div class="public-box">
          ${[g.home, g.away]
            .map(
              (t) =>
                /* HTML */ `<div class="panel">
                  <h3>${team(t).name} · Box score</h3>
                  <div class="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>PTS</th>
                          <th>MIN</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${D.box
                          .filter((b) => b.gameId === g.id && b.team === t)
                          .map(
                            (b) =>
                              /* HTML */ `<tr>
                                <td>${player(b.playerId).name}</td>
                                <td>${b.participated ? b.points : '—'}</td>
                                <td>${b.participated ? clock(b.seconds) : 'DNP'}</td>
                              </tr>`,
                          )
                          .join('')}
                      </tbody>
                    </table>
                  </div>
                </div>`,
            )
            .join('')}
        </div>`
      : /* HTML */ `<div class="banner-cta">
          <div>
            <h2>The court is almost yours.</h2>
            <p>Live scores and the box score will appear here once the game starts.</p>
          </div>
          <a class="btn btn-ghost" href="#admin/scoring"
            >See live-scoring concept ${icon('arrow')}</a
          >
        </div>`}
  </div>`;
}

export {
  publicNav,
  publicHeader,
  footer,
  intro,
  sectionHeading,
  home,
  schedule,
  teams,
  teamPage,
  statsPage,
  about,
  awards,
  registration,
  myLeague,
  gamePage,
};
