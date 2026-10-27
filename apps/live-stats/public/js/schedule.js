// The season schedule. Live games show their score and clock as they are scored.
import {
  api,
  esc,
  fmtDay,
  fmtTime,
  gameClockText,
  gameTypeLabel,
  getSession,
  ourSide,
  serverClock,
  siteHeader,
  subscribe,
} from '/js/common.js';

const $ = (id) => document.getElementById(id);
let team = null;
let games = [];
let canScore = false;

function card(g) {
  const us = ourSide(g);
  const them = us === 'home' ? g.away : g.home;
  const mine = us === 'home' ? g.homeScore : g.awayScore;
  const theirs = us === 'home' ? g.awayScore : g.homeScore;
  const when = g.startsAt
    ? `<span class="day">${esc(fmtDay(g.startsAt))}</span><span class="time">${esc(fmtTime(g.startsAt))}</span>`
    : '<span class="day">Date TBD</span>';
  let status;
  if (g.status === 'final') {
    const result = mine > theirs ? 'win' : mine < theirs ? 'loss' : '';
    status = `<span class="score"><span class="result ${result}">${result === 'win' ? 'W' : result === 'loss' ? 'L' : 'T'}</span>${mine}–${theirs}</span><span class="clock">Final</span>`;
  } else if (g.status === 'live') {
    status = `<span class="live-pill">LIVE</span><span class="score">${mine}–${theirs}</span><span class="clock" data-clock="${esc(g.id)}">${esc(gameClockText(g, serverClock.now()))}</span>`;
  } else status = '<span class="status">Scheduled</span>';
  const track =
    canScore && g.status !== 'final'
      ? `<a class="btn btn-primary" href="/game/${esc(g.id)}/track">${g.status === 'live' ? 'Resume tracking' : 'Track live stats'}</a>`
      : '';
  return `<li class="game is-${esc(g.status)}">
    <a class="game-when" href="/game/${esc(g.id)}">${when}</a>
    <div class="game-main">
      <div class="game-title"><span class="ha">${us === 'home' ? 'vs' : '@'}</span>${esc(them.name)}</div>
      <div class="game-meta"><span class="tag">${us === 'home' ? 'Home' : 'Away'}</span>${g.gameType !== 'regular_season' ? `<span class="tag tag-ex">${esc(gameTypeLabel(g.gameType))}</span>` : ''}${esc(g.venue)}${g.venueAddress ? ` · ${esc(g.venueAddress)}` : ''}</div>
    </div>
    <div class="game-status">${status}</div>
    <div class="game-actions">${track}<a class="btn" href="/game/${esc(g.id)}">${g.status === 'scheduled' ? 'Game page' : g.status === 'live' ? 'Watch live' : 'Box score'}</a></div>
  </li>`;
}

function render() {
  $('site-header').innerHTML = siteHeader('schedule', team?.id);
  $('games').innerHTML = games.map(card).join('') || '<li class="empty">No games yet.</li>';
  const final = games.filter((g) => g.status === 'final');
  let wins = 0,
    losses = 0;
  for (const g of final) {
    const us = ourSide(g);
    const diff = us === 'home' ? g.homeScore - g.awayScore : g.awayScore - g.homeScore;
    if (diff > 0) wins++;
    else if (diff < 0) losses++;
  }
  const next = games.find((g) => g.status !== 'final');
  $('record').innerHTML =
    `<div><b>${wins}–${losses}</b><span>Record</span></div><div><b>${games.length - final.length}</b><span>To play</span></div>${
      next?.startsAt
        ? `<div><b>${esc(fmtDay(next.startsAt))}</b><span>Next · ${esc(fmtTime(next.startsAt))}</span></div>`
        : ''
    }`;
}

function tickClocks() {
  for (const el of document.querySelectorAll('[data-clock]')) {
    const g = games.find((x) => x.id === el.dataset.clock);
    if (g) el.textContent = gameClockText(g, serverClock.now());
  }
}

async function start() {
  canScore = (await getSession()).canScore;
  const data = await api('/api/schedule').catch((err) => {
    $('games').innerHTML = `<li class="empty">${esc(err.message)}</li>`;
    return null;
  });
  if (data) adopt(data);
  subscribe(
    '',
    {
      schedule: adopt,
      summary: (g) => {
        serverClock.sync(g.serverTime);
        games = games.map((x) => (x.id === g.id ? g : x));
        render();
      },
    },
    (connected) => {
      $('notice').hidden = connected;
      $('notice').textContent =
        'Reconnecting to the stats server — scores will update when it is back.';
    },
  );
  setInterval(tickClocks, 500);
}

function adopt(data) {
  serverClock.sync(data.serverTime);
  team = data.team;
  games = data.games;
  render();
}

void start();
