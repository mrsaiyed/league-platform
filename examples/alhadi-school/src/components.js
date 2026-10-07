import { D, M, esc, team, clock } from '@demo/context';
const paths = {
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  down: 'm6 9 6 6 6-6',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M18 6 6 18',
  home: 'm3 10 9-7 9 7v10H3V10m6 10v-7h6v7',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-4M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0m5-3a4 4 0 0 1 0 8',
  calendar: 'M4 5h16v16H4V5m3-3v6m10-6v6M4 11h16',
  chart: 'M4 20V10m8 10V4m8 16v-8M2 21h20',
  shield: 'm12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4m-4 10 3 3 5-6',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',
  draft: 'M4 3h6v6H4V3m10 12h6v6h-6v-6M7 9v9h7m3-15v8m-3-3 3 3 3-3',
  ball: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3v18M5.5 5.5c8 2 5 8 13 13M18.5 5.5c-8 2-5 8-13 13',
  mail: 'M3 5h18v14H3V5m0 1 9 7 9-7',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m-2 4 6 6',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-9-5v5l3 2',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  money: 'M3 5h18v14H3V5m11 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0M6 8h1m10 8h1',
  undo: 'M4 9h10a6 6 0 0 1 0 12m-6-8L4 9l4-4',
  play: 'm8 4 12 8-12 8V4',
  pause: 'M8 4v16m8-16v16',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6m0-10v1',
  pin: 'M18 9c0 5-6 12-6 12S6 14 6 9a6 6 0 1 1 12 0m-4 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  external: 'M14 3h7v7m0-7L11 13M10 3H3v18h18v-7',
  plus: 'M12 4v16M4 12h16',
  trophy: 'M7 3h10v6a5 5 0 0 1-10 0V3M7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 2v6m-5 1h10',
};
const icon = (name) =>
  /* HTML */ `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="${paths[name] || paths.ball}" />
  </svg>`;
const crest = (id, size = '') => {
  const t = team(id);
  return `<svg class="crest ${size}" viewBox="0 0 60 70" role="img" aria-label="${t.name} concept crest"><path d="M4 3h52v38c0 13-26 26-26 26S4 54 4 41Z" fill="${t.color}22" stroke="${t.color}" stroke-width="1.4"/><path d="M9 8h42v31c0 10-21 21-21 21S9 49 9 39Z" fill="${t.color}12" stroke="${t.color}" stroke-width=".5"/><path d="M18 14h24M21 51h18" stroke="${t.color}"/><text x="30" y="43" fill="${t.color}" text-anchor="middle" font-family="Georgia,serif" font-size="29">${t.letter}</text></svg>`;
};
const badge = (text, type = 'neutral') => `<span class="badge ${type}">${esc(text)}</span>`;
const button = (text, action, extra = '', cls = '') =>
  `<button class="btn ${cls}" data-action="${action}" ${extra}>${text}</button>`;
const stats = () => M.playerStats(D.players, D.box);
const standings = () => M.standings(D.teams, D.games);
const statsTable = (rows = stats()) =>
  /* HTML */ `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Player</th>
          <th>Team</th>
          <th>GP</th>
          <th>PTS</th>
          <th>PPG</th>
          <th>MIN</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (p, i) =>
              /* HTML */ `<tr>
                <td class="rank">${i + 1}</td>
                <td><b>${esc(p.name)}</b>${p.captain ? ' <span class="subtle">· C</span>' : ''}</td>
                <td>${team(p.team).name}</td>
                <td>${p.gp}</td>
                <td>${p.points}</td>
                <td><strong>${p.ppg === null ? '—' : p.ppg.toFixed(1)}</strong></td>
                <td>${clock(p.seconds)}</td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
function standingsTable(full = false) {
  return /* HTML */ `<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th>W</th>
          <th>L</th>
          ${full ? '<th>PF</th><th>PA</th>' : ''}
          <th>+/−</th>
        </tr>
      </thead>
      <tbody>
        ${standings()
          .map(
            (t, i) =>
              /* HTML */ `<tr>
                <td class="rank">${i + 1}</td>
                <td>
                  <a class="team-cell" href="#team/${t.id}">${crest(t.id, 'small')}${t.name}</a>
                </td>
                <td><b>${t.wins}</b></td>
                <td>${t.losses}</td>
                ${full
                  ? /* HTML */ `<td>${t.pf}</td>
                      <td>${t.pa}</td>`
                  : ''}
                <td class="${t.diff > 0 ? 'stat-positive' : ''}">
                  ${t.diff > 0 ? '+' : ''}${t.diff}
                </td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
function matchCard(g) {
  return /* HTML */ `<a class="match-card" href="#game/${g.id}"
    ><div class="match-top">
      <span>Week ${g.week} · ${g.status === 'final' ? 'Result' : 'Next up'}</span
      ><span>${g.status === 'final' ? 'Final' : g.time}</span>
    </div>
    <div class="match-teams">
      <div class="match-team">${crest(g.home)}<b>${team(g.home).name}</b></div>
      <div class="${g.status === 'final' ? 'match-score' : 'versus'}">
        ${g.status === 'final'
          ? g.homeScore + ' <span style="color:#8c707d">:</span> ' + g.awayScore
          : 'VS'}
      </div>
      <div class="match-team">${crest(g.away)}<b>${team(g.away).name}</b></div>
    </div>
    <div class="match-foot">
      ${icon('pin')} School gym <span>·</span> ${g.status === 'final'
        ? 'View box score'
        : 'Date to be confirmed'}
    </div></a
  >`;
}

export { icon, crest, badge, button, stats, standings, statsTable, standingsTable, matchCard };
