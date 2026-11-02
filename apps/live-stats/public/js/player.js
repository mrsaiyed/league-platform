// One player's game log: a line for every final game of their team, and totals.
import { formatMinutes } from '/js/engine.js';
import { api, esc, fmtDay, gameTypeLabel, getSession, siteHeader } from '/js/common.js';

const playerId = location.pathname.split('/')[2];
const $ = (id) => document.getElementById(id);

function logTable(games, totals) {
  if (!games.length)
    return '<p class="hint">No final games yet. Each one appears here once it is ended in the tracker.</p>';
  const rows = [...games].reverse().map((g) => {
    const when = g.startsAt ? esc(fmtDay(g.startsAt)) : 'TBD';
    const opponent = `<a href="/game/${esc(g.gameId)}">${g.home ? 'vs' : '@'} ${esc(g.opponent.name)}</a>${g.gameType === 'regular_season' ? '' : ` <span class="tag tag-ex">${esc(gameTypeLabel(g.gameType))}</span>`}`;
    const cells = g.played
      ? `<td>${formatMinutes(g.ms)}</td><td><b>${g.points}</b></td><td>${g.fg3}</td><td>${g.fg2}</td><td>${g.fg1}</td><td>${g.fouls}</td>`
      : '<td colspan="6" class="dnp-cell">DNP</td>';
    return `<tr${g.played ? '' : ' class="dnp"'}><td class="name">${when}</td><td class="name">${opponent}</td><td>${esc(g.result)} ${g.score}–${g.opponentScore}</td><td class="num">${esc(g.jersey)}</td>${cells}</tr>`;
  });
  const t = totals;
  return `<table class="stats">
    <thead><tr><th class="name">Date</th><th class="name">Opponent</th><th>Result</th><th class="num" title="Jersey worn">#</th><th title="Minutes">MIN</th><th title="Points">PTS</th><th title="3-pointers made">3PM</th><th title="2-pointers made">2PM</th><th title="Free throws made">FTM</th><th title="Personal fouls">PF</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
    <tfoot><tr><td class="name">Season</td><td class="name">${t.gp} ${t.gp === 1 ? 'game' : 'games'} played</td><td></td><td></td><td>${formatMinutes(t.ms)}</td><td>${t.points}</td><td>${t.fg3}</td><td>${t.fg2}</td><td>${t.fg1}</td><td>${t.fouls}</td></tr></tfoot>
  </table>`;
}

async function start() {
  const session = await getSession();
  let data;
  try {
    data = await api(`/api/players/${playerId}`);
  } catch (err) {
    $('player-name').textContent = err.message;
    return;
  }
  const { player, team, games, totals } = data;
  const schedule = team?.tracked ? null : await api('/api/schedule').catch(() => null);
  const trackedId = team?.tracked ? team.id : schedule?.team?.id;
  $('site-header').innerHTML = siteHeader(team?.tracked ? 'team' : '', trackedId, session);
  const name = player.name || `#${player.jersey}`;
  document.title = `${name} · Game log`;
  $('player-name').textContent =
    `${player.jersey && player.name ? `#${player.jersey} ` : ''}${name}`;
  $('player-sub').textContent =
    `${team?.name ?? ''}${player.active ? '' : ' · removed from the roster'}`;
  if (team) {
    $('back').href = `/team/${team.id}`;
    $('back').textContent = `← ${team.name} roster & stats`;
  }
  const per = (v) => (totals.gp ? (v / totals.gp).toFixed(1) : '–');
  $('totals').innerHTML =
    `<div><b>${totals.gp}</b><span>Games</span></div><div><b>${per(totals.points)}</b><span>Points per game</span></div><div><b>${totals.gp ? formatMinutes(totals.ms / totals.gp) : '–'}</b><span>Minutes per game</span></div>`;
  $('log').innerHTML = logTable(games, totals);
}
$('site-header').innerHTML = siteHeader('');
void start();
