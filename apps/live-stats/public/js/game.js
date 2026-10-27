// A game as fans and coaches follow it: live score and clock, box scores and the
// play-by-play, updating as each play is saved.
import {
  bonusLabel,
  clockAt,
  derive,
  describePlay,
  formatClock,
  formatMinutes,
  periodLabel,
  runningScores,
  SIDES,
} from '/js/engine.js';
import {
  api,
  esc,
  fmtLongDate,
  fmtTime,
  gameClockText,
  gameTypeLabel,
  getSession,
  playerLabel,
  serverClock,
  siteHeader,
  sortPlayers,
  subscribe,
} from '/js/common.js';

const gameId = location.pathname.split('/')[2];
const $ = (id) => document.getElementById(id);
let game = null;
let canScore = false;
let session = null;

/** The clock reading for the header, with the period derived from the plays. */
function clockText(d, now) {
  if (game.status === 'scheduled') return game.startsAt ? fmtTime(game.startsAt) : 'Not started';
  if (game.status === 'final') return '';
  return gameClockText(
    { ...game, period: d.period, periods: game.state.rules.periods, clock: game.state.clock },
    now,
  );
}

function teamBlock(side, d) {
  const t = d.teams[side];
  const live = game.status === 'live';
  const notes = [side === 'home' ? 'Home' : 'Away'];
  if (live && t.periodFouls)
    notes.push(`${t.periodFouls} team foul${t.periodFouls === 1 ? '' : 's'}`);
  return `<div class="sb-team">
    <span class="sb-name">${esc(game[side].name)}</span>
    <span class="sb-score">${t.score}</span>
    <span class="sb-sub">${esc(notes.join(' · '))}</span>
    ${live && t.bonus ? `<span class="sb-bonus">${esc(bonusLabel(t.bonus))}</span>` : ''}
  </div>`;
}

function boxScore(side, d) {
  const teamId = game[side].id;
  const final = game.status === 'final';
  const onCourt = game.status === 'live' ? d.teams[side].onCourt : [];
  const roster = sortPlayers(
    game.players.filter((p) => p.teamId === teamId && (p.active || d.players[p.id])),
  );
  const total = { points: 0, fg3: 0, fg2: 0, fg1: 0, fouls: 0 };
  const rows = roster.map((p) => {
    const l = d.players[p.id];
    if (l) for (const k of Object.keys(total)) total[k] += l[k];
    const played = l?.appeared;
    const cells = played
      ? `<td data-min="${esc(p.id)}">${formatMinutes(l.ms)}</td><td><b>${l.points}</b></td><td>${l.fg3}</td><td>${l.fg2}</td><td>${l.fg1}</td><td>${l.fouls}</td>`
      : `<td colspan="6" class="dnp-cell">${final ? 'DNP' : '—'}</td>`;
    return `<tr class="${played ? '' : 'dnp'}${onCourt.includes(p.id) ? ' on-court' : ''}"><td class="num">${esc(p.jersey)}</td><td class="name">${esc(p.name || `#${p.jersey}`)}</td>${cells}</tr>`;
  });
  return `<section class="panel">
    <h2>${esc(game[side].name)}</h2>
    <div class="table-wrap"><table class="stats">
      <thead><tr><th class="num">#</th><th class="name">Player</th><th title="Minutes">MIN</th><th title="Points">PTS</th><th title="3-pointers made">3PM</th><th title="2-pointers made">2PM</th><th title="Free throws made">FTM</th><th title="Personal fouls">PF</th></tr></thead>
      <tbody>${rows.join('') || '<tr><td colspan="8" class="name">No players entered yet.</td></tr>'}</tbody>
      <tfoot><tr><td></td><td class="name">Team</td><td></td><td>${total.points}</td><td>${total.fg3}</td><td>${total.fg2}</td><td>${total.fg1}</td><td>${total.fouls}</td></tr></tfoot>
    </table></div>
  </section>`;
}

function playByPlay() {
  const plays = game.state.plays;
  const scores = runningScores(plays);
  const periods = game.state.rules.periods;
  const nameOf = (id) => playerLabel(game.players.find((p) => p.id === id));
  const items = plays.map((play, i) => {
    if (play.type === 'period')
      return `<li class="is-period"><span class="when">${esc(periodLabel(play.period, periods))}</span><span class="what">Start of ${esc(periodLabel(play.period, periods))}</span><span></span></li>`;
    const team = game[play.side].name;
    const what = describePlay(play, nameOf, () => team, periods);
    const s = scores[i];
    return `<li class="${play.type === 'score' ? 'is-score' : ''}"><span class="when">${esc(periodLabel(play.period, periods))} ${esc(formatClock(play.clockMs))}</span><span class="what">${play.type === 'lineup' ? '' : `<span class="team-tag">${esc(team)}</span> `}${esc(what)}</span><span class="running">${play.type === 'score' ? `${s.home}–${s.away}` : ''}</span></li>`;
  });
  return (
    items.reverse().join('') ||
    '<li class="empty">No plays yet. They appear here as the game is scored.</li>'
  );
}

function render() {
  const now = serverClock.now();
  const clock = clockAt(game.state, now);
  const d = derive(game.state, clock.elapsedMs);
  const status = game.status === 'live' ? 'Live' : game.status === 'final' ? 'Final' : 'Scheduled';
  document.title = `${game.away.name} ${d.teams.away.score}, ${game.home.name} ${d.teams.home.score} · ${status}`;
  $('scoreboard').innerHTML = `${teamBlock('home', d)}
    <div class="sb-mid"><span class="sb-status${game.status === 'live' ? ' is-live' : ''}">${status}</span><span class="sb-clock" data-clock>${esc(clockText(d, now))}</span></div>
    ${teamBlock('away', d)}`;
  const rules = game.state.rules;
  const info = [
    game.startsAt ? `${fmtLongDate(game.startsAt)} · ${fmtTime(game.startsAt)}` : 'Date to be set',
    gameTypeLabel(game.gameType),
    [game.venue, game.venueAddress].filter(Boolean).join(', '),
    `${rules.periods === 4 ? '4 quarters' : '2 halves'} of ${rules.periodSeconds / 60} min`,
  ];
  const links = [
    game.sourceUrl
      ? `<a href="${esc(game.sourceUrl)}" rel="noopener noreferrer">${esc(game.source)} game ${esc(game.sourceRef?.split(':')[1] ?? '')} ↗</a>`
      : '',
    canScore
      ? `<a class="btn${game.status === 'final' ? '' : ' btn-primary'}" href="/game/${esc(game.id)}/track">${game.status === 'final' ? 'Correct stats' : game.status === 'live' ? 'Open the tracker' : 'Track live stats'}</a>`
      : '',
  ];
  $('game-info').innerHTML =
    `<span>${info.map(esc).join(' · ')}</span><span>${links.join(' ')}</span>`;
  $('box').innerHTML = SIDES.map((side) => boxScore(side, d)).join('');
  $('pbp').innerHTML = playByPlay();
}

/** Each second while the clock runs: the clock and minutes, not the whole page. */
setInterval(() => {
  if (!game?.state.clock.running) return;
  const now = serverClock.now();
  const d = derive(game.state, clockAt(game.state, now).elapsedMs);
  const clockEl = document.querySelector('[data-clock]');
  if (clockEl) clockEl.textContent = clockText(d, now);
  for (const el of document.querySelectorAll('[data-min]'))
    el.textContent = formatMinutes(d.players[el.dataset.min]?.ms ?? 0);
}, 500);

function adopt(payload) {
  if (game && payload.revision < game.revision) return;
  game = payload;
  serverClock.sync(payload.serverTime);
  render();
}

async function start() {
  session = await getSession();
  canScore = session.canScore;
  try {
    adopt(await api(`/api/games/${gameId}`));
  } catch (err) {
    $('scoreboard').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    return;
  }
  const tracked = [game.home, game.away].find((t) => t.tracked);
  $('site-header').innerHTML = siteHeader('', tracked?.id, session);
  subscribe(`?game=${gameId}`, { game: adopt }, (connected) => {
    $('notice').hidden = connected;
    $('notice').textContent =
      'Reconnecting to the stats server — the score will catch up when it is back.';
  });
}
$('site-header').innerHTML = siteHeader('');
void start();
