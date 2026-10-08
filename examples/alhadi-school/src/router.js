import { D, state, ui, $ } from '@demo/context';
import { icon, stats, standings, standingsTable, matchCard } from '@demo/components';
import {
  media,
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
} from '@demo/public';
import {
  adminLayout,
  overview,
  registrations,
  draft,
  adminSchedule,
  scoring,
  settings,
} from '@demo/commissioner';
function toolbar(admin) {
  return /* HTML */ `<div class="demo-bar">
    <div class="demo-label">
      <span class="demo-dot"></span><b>AL-HADI CONCEPT</b
      ><span>Fictional data · No real charges</span>
    </div>
    <div class="demo-tools">
      <a href="#home" class="${!admin ? 'selected' : ''}">Public site</a
      ><a href="#admin" class="${admin ? 'selected' : ''}">Commissioner</a
      ><button class="guide-btn" data-action="guide">
        Meeting guide
        ${icon('arrow').replace('class="icon"', 'class="icon" style="width:12px;height:12px"')}</button
      ><button data-action="reset" aria-label="Reset demonstration" title="Reset demonstration">
        ${icon('undo').replace('class="icon"', 'class="icon" style="width:13px;height:13px"')}
      </button>
    </div>
  </div>`;
}
function render(scroll = false) {
  ui.route = location.hash.replace(/^#/, '') || 'home';
  document.documentElement.style.setProperty('--wine', state.config.color);
  const admin = ui.route.startsWith('admin');
  let body = '';
  if (admin) {
    const pages = {
      admin: overview,
      'admin/registrations': registrations,
      'admin/draft': draft,
      'admin/schedule': adminSchedule,
      'admin/scoring': scoring,
      'admin/settings': settings,
    };
    body = (pages[ui.route] || overview)();
    $('#app').innerHTML =
      toolbar(true) + /* HTML */ `<div class="admin">${adminLayout(body)}</div>`;
  } else {
    const pages = {
      home,
      media,
      schedule,
      teams,
      'my-league': myLeague,
      stats: state.config.stats ? statsPage : home,
      standings: () =>
        /* HTML */ `<div class="public-content">
          ${intro(
            'The race to the top',
            'The standings.',
            'Sample season standings after two game weeks. Wins, losses, and point differential update from finalized results.',
          )}
          <div class="panel" style="padding:10px">${standingsTable(true)}</div>
          <p class="caption">
            Sample ordering: wins, then point differential. The school will confirm official
            tiebreak rules.
          </p>
          <div class="mt">
            ${sectionHeading('How we got here', 'Latest results')}
            <div class="matchups">
              ${D.games
                .filter((g) => g.week === 2)
                .map(matchCard)
                .join('')}
            </div>
          </div>
        </div>`,
      about,
      awards: state.config.awards ? awards : home,
      register: registration,
    };
    body = ui.route.startsWith('team/')
      ? teamPage(ui.route.split('/')[1])
      : ui.route.startsWith('game/')
        ? gamePage(ui.route.split('/')[1])
        : (pages[ui.route] || home)();
    $('#app').innerHTML =
      toolbar(false) +
      /* HTML */ `<div class="public">
        ${publicHeader()}
        <main id="main" tabindex="-1">${body}</main>
        ${footer()}
      </div>`;
  }
  document.title = (admin ? 'Commissioner workspace' : 'Al-Hadi Basketball') + ' · Concept';
  if (scroll) window.scrollTo(0, 0);
}

export { render };
