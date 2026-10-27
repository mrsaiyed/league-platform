// A team's roster (names and jersey numbers, no limit) and its season totals.
import { formatMinutes } from '/js/engine.js';
import { api, esc, fmtDay, getSession, siteHeader } from '/js/common.js';
import { rosterEditor } from '/js/roster-editor.js';

const teamId = location.pathname.split('/')[2];
const $ = (id) => document.getElementById(id);

function statsTable(stats) {
  const rows = stats.map((s) => {
    const ppg = s.gp ? (s.points / s.gp).toFixed(1) : '–';
    const mpg = s.gp ? formatMinutes(s.ms / s.gp) : '–';
    return `<tr${s.gp ? '' : ' class="dnp"'}><td class="num">${esc(s.jersey)}</td><td class="name">${esc(s.name || `#${s.jersey}`)}${s.active ? '' : ' (removed)'}</td><td>${s.gp}</td><td>${mpg}</td><td><b>${s.points}</b></td><td>${ppg}</td><td>${s.fg3}</td><td>${s.fg2}</td><td>${s.fg1}</td><td>${s.fouls}</td></tr>`;
  });
  return `<table class="stats">
    <thead><tr><th class="num">#</th><th class="name">Player</th><th title="Games played">GP</th><th title="Minutes per game">MPG</th><th title="Points">PTS</th><th title="Points per game">PPG</th><th title="3-pointers made">3PM</th><th title="2-pointers made">2PM</th><th title="Free throws made">FTM</th><th title="Personal fouls">PF</th></tr></thead>
    <tbody>${rows.join('') || '<tr><td colspan="10" class="name">No players yet.</td></tr>'}</tbody>
  </table>`;
}

function resultsTable(games) {
  const rows = games.map((g) => {
    const us = g.home.id === teamId ? 'home' : 'away';
    const them = us === 'home' ? g.away : g.home;
    const mine = us === 'home' ? g.homeScore : g.awayScore;
    const theirs = us === 'home' ? g.awayScore : g.homeScore;
    const result =
      g.status === 'final'
        ? `${mine > theirs ? 'W' : mine < theirs ? 'L' : 'T'} ${mine}–${theirs}`
        : g.status === 'live'
          ? `Live ${mine}–${theirs}`
          : '';
    return `<tr><td class="name">${g.startsAt ? esc(fmtDay(g.startsAt)) : 'TBD'}</td><td class="name"><a href="/game/${esc(g.id)}">${us === 'home' ? 'vs' : '@'} ${esc(them.name)}</a></td><td>${esc(result)}</td></tr>`;
  });
  return `<table class="stats"><tbody>${rows.join('')}</tbody></table>`;
}

async function load() {
  return api(`/api/teams/${teamId}`);
}

async function start() {
  const session = await getSession();
  const canScore = session.canScore;
  let data;
  try {
    data = await load();
  } catch (err) {
    $('team-name').textContent = err.message;
    return;
  }
  const tracked = data.team.tracked ? data.team.id : null;
  $('site-header').innerHTML = siteHeader(tracked ? 'team' : '', tracked ?? undefined, session);
  if (!tracked) {
    const schedule = await api('/api/schedule').catch(() => null);
    if (schedule?.team) $('site-header').innerHTML = siteHeader('', schedule.team.id, session);
  }
  document.title = `${data.team.name} · Roster & stats`;
  $('team-name').textContent = `${data.team.name} · Roster & stats`;
  $('team-sub').textContent = data.team.tracked
    ? 'Varsity boys basketball · 2026–27'
    : `Opponent · ${data.team.school}`;
  $('record').innerHTML =
    `<div><b>${data.record.wins}–${data.record.losses}</b><span>Record</span></div><div><b>${data.players.length}</b><span>Players</span></div>`;
  const paint = (d) => {
    $('stats').innerHTML = statsTable(d.stats);
    $('results').innerHTML = resultsTable(d.games);
  };
  paint(data);
  if (canScore)
    rosterEditor($('roster'), {
      teamId,
      players: data.players,
      onChange: async () => {
        const fresh = await load().catch(() => null);
        if (!fresh) return;
        paint(fresh);
        $('record').querySelector('div:last-child b').textContent = String(fresh.players.length);
      },
    });
  else {
    $('roster-hint').innerHTML = session.signIn
      ? `<a href="/sign-in?next=${encodeURIComponent(location.pathname)}">Sign in</a> to edit the roster.`
      : 'Rosters are edited on the computer running the stats.';
    $('roster').innerHTML =
      `<ul>${data.players.map((p) => `<li>${esc(p.jersey ? `#${p.jersey} ` : '')}${esc(p.name)}</li>`).join('')}</ul>`;
  }
}
void start();
