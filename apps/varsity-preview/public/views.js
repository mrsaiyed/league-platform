export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const orderedPlayers = (state) =>
  Object.values(state.players).sort(
    (a, b) =>
      a.side.localeCompare(b.side) * -1 ||
      Number(a.jersey) - Number(b.jersey) ||
      a.jersey.localeCompare(b.jersey) ||
      a.id.localeCompare(b.id),
  );
export const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const minutes = (ms) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
export const period = (state) =>
  state.period <= state.rules.periods
    ? `${state.rules.periods === 2 ? 'Half' : 'Period'} ${state.period}`
    : `OT ${state.period - state.rules.periods}`;
export const names = (game) => ({
  [game.trackedSide]: 'Al-Hadi',
  [game.trackedSide === 'home' ? 'away' : 'home']: game.opponent,
});
export const badge = (g) =>
  `<span class="badge ${g.practice ? 'practice' : g.status === 'live' ? 'live' : ''}">${g.practice ? 'PRACTICE · ' : ''}${g.status === 'ready' ? 'PRE-GAME' : g.status.toUpperCase()}</span>`;
const when = (date) =>
  date
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(date))
    : 'Date to be entered';
const title = (eye, heading, description, action = '') =>
  `<div class="page-title"><div><div class="eyebrow">${eye}</div><h1>${heading}</h1><p>${description}</p></div><div class="actions">${action}</div></div>`;
const empty = (heading, text, action = '') =>
  `<div class="empty"><h3>${heading}</h3><p>${text}</p>${action ? `<div class="actions">${action}</div>` : ''}</div>`;
export function gameRow(g) {
  const team = g[g.trackedSide].score,
    opponent = g[g.trackedSide === 'home' ? 'away' : 'home'].score;
  return `<div class="game-row"><div><strong>Al-Hadi <span class="muted">vs</span> ${esc(g.opponent)}</strong><small>${g.practice ? 'Practice game · excluded from team totals' : `${esc(when(g.scheduledAt))} · ${g.trackedSide === 'home' ? 'Home' : 'Away'}`}</small></div><div class="actions">${g.status !== 'ready' ? `<strong>${team} – ${opponent}</strong>` : ''}${badge(g)}<a class="button small" href="#game/${g.id}">${g.status === 'final' ? 'Box score' : g.status === 'live' ? 'Resume tracker' : 'Open game'}</a></div></div>`;
}
export function overview(d) {
  const real = d.games.filter((g) => !g.practice),
    finals = real.filter((g) => g.status === 'final');
  const wins = finals.filter(
    (g) => g[g.trackedSide].score > g[g.trackedSide === 'home' ? 'away' : 'home'].score,
  ).length;
  const losses = finals.filter(
    (g) => g[g.trackedSide].score < g[g.trackedSide === 'home' ? 'away' : 'home'].score,
  ).length;
  return `${title('Al-Hadi Lions / Team workspace', 'Our season, one game at a time.', 'A home for the varsity roster, game-day records and every player’s season totals.', '<button data-action="new-game" class="primary">+ Add game</button>')}
    <section class="hero"><div class="hero-copy"><div class="eyebrow">From the bench to the box score</div><h2>Ready when<br>the ball goes up.</h2><p>Set the lineups. Keep the game. Every saved basket, substitution and foul becomes part of the team’s record.</p><div class="actions"><button class="primary" data-action="practice">Try a practice game →</button><a class="button" href="#roster">Set up roster</a></div></div><img src="/team.png" alt="Al-Hadi Lions team in matching black tracksuits" /></section>
    <div class="metrics"><div class="metric"><small>Team record</small><strong>${wins}–${losses}</strong><span>Finalized team records only</span></div><div class="metric"><small>Roster</small><strong>${d.roster.players.length}</strong><span>Players entered</span></div><div class="metric"><small>Games recorded</small><strong>${finals.length}</strong><span>Practice games excluded</span></div><div class="metric"><small>Points per game</small><strong>${finals.length ? (finals.reduce((n, g) => n + g[g.trackedSide].score, 0) / finals.length).toFixed(1) : '—'}</strong><span>Al-Hadi team scoring</span></div></div>
    <div class="grid-two"><section class="panel"><div class="panel-head"><h2>Game day</h2><a class="link" href="#games">All games →</a></div>${real.length ? real.slice(0, 4).map(gameRow).join('') : empty('Your fixtures will live here', 'Add the confirmed opponent, date and venue when they’re ready. No dates or scores have been invented.', '<button data-action="new-game">Add a game</button>')}</section><section class="panel"><div class="panel-head"><h2>Before the first game</h2></div><div class="panel-body"><ol class="steps"><li><span class="step-num">1</span><div><h3>Save the varsity roster</h3><p>Names and jersey numbers stay ready for the next game.</p></div></li><li><span class="step-num">2</span><div><h3>Enter the opponent’s numbers</h3><p>Names are optional. Their roster belongs to that game.</p></div></li><li><span class="step-num">3</span><div><h3>Choose lineups and keep stats</h3><p>Review the final box score, then add it to the season record.</p></div></li></ol></div></section></div>
    ${
      d.games.some((g) => g.practice)
        ? `<section class="panel section-space"><div class="panel-head"><h2>Practice workspace</h2><small>Separate from team statistics</small></div>${d.games
            .filter((g) => g.practice)
            .slice(0, 3)
            .map(gameRow)
            .join('')}</section>`
        : ''
    }`;
}
export function rosterRow(p = {}) {
  const key = p.id || crypto.randomUUID();
  return `<div class="roster-edit-row" data-player-id="${esc(p.id || '')}"><label for="jersey-${key}">Number<input id="jersey-${key}" name="jersey" value="${esc(p.jersey || '')}" required pattern="(?:00|0|[1-9][0-9]?)" maxlength="2" inputmode="numeric" /></label><label for="name-${key}">Player name<input id="name-${key}" name="name" value="${esc(p.name || '')}" maxlength="100" required autocomplete="off" /></label><button type="button" data-action="remove-roster-row" class="small danger" aria-label="Remove player row">Remove</button></div>`;
}
export function roster(d) {
  return `${title('Team / Roster', 'The varsity roster.', 'Enter the names and jersey numbers when ready. Existing game rosters remain snapshots of who played that day.')}
    <section class="panel"><div class="panel-head"><h2>Al-Hadi players</h2><small>${d.roster.players.length} saved · up to 30</small></div><form id="roster-form" class="panel-body" data-revision="${d.roster.revision}"><div id="roster-rows">${(d.roster.players.length ? d.roster.players : [{}]).map(rosterRow).join('')}</div><div class="form-actions"><button type="button" data-action="add-roster-row">+ Add player</button><button class="primary" type="submit">Save roster</button></div></form></section><p class="muted section-space">Numbers 0 and 00 are distinct. Save roster changes before preparing the next game.</p>`;
}
export function games(d) {
  const real = d.games.filter((g) => !g.practice),
    practice = d.games.filter((g) => g.practice);
  return `${title('Team / Games', 'The schedule. The record.', 'Confirmed fixtures and Al-Hadi’s own game records. These do not replace TCSAAL’s official results.', '<button class="primary" data-action="new-game">+ Add game</button>')}<section class="panel"><div class="panel-head"><h2>Varsity games</h2><a class="link" href="https://texascharter.org/league-schedules/" target="_blank" rel="noopener noreferrer">TCSAAL schedule ↗</a></div>${real.length ? real.map(gameRow).join('') : empty('No fixtures entered yet', 'The team schedule can be entered later. Use practice to test the game-day workflow now.')}</section><section class="panel section-space"><div class="panel-head"><h2>Practice games</h2><button class="small" data-action="practice">New practice</button></div>${practice.length ? practice.map(gameRow).join('') : empty('A place to rehearse', 'Practice players and results never enter Al-Hadi’s season statistics.')}</section>`;
}
export function stats(d) {
  return `${title('Team / Season statistics', 'Every game adds up.', 'Finalized Al-Hadi records update this table automatically. Reopening a result removes it until the correction is finalized.')}<section class="panel"><div class="panel-head"><h2>Player season totals</h2><small>Practice and live games excluded</small></div>${d.stats.length ? `<div class="table-wrap"><table><thead><tr><th>Player</th><th>GP</th><th>PTS</th><th>PPG</th><th>1s</th><th>2s</th><th>3s</th><th>PF</th><th>MIN</th></tr></thead><tbody>${d.stats.map((p) => `<tr><td><span class="player-name"><span class="jersey">${esc(p.jersey)}</span>${esc(p.name)}</span></td><td>${p.gp}</td><td><b>${p.points}</b></td><td>${(p.points / p.gp).toFixed(1)}</td><td>${p.ones}</td><td>${p.twos}</td><td>${p.threes}</td><td>${p.fouls}</td><td>${p.minutesGames === p.gp ? minutes(p.milliseconds) : `${minutes(p.milliseconds)}*`}</td></tr>`).join('')}</tbody></table></div><div class="panel-body muted"><small>1s / 2s / 3s are made baskets, not attempts. * Minutes cover only games with an unadjusted tracked clock; affected games need review. A zero-point appearance counts toward GP; a player who never entered does not.</small></div>` : empty('The first box score starts the story', 'Once a real team game is finalized, player appearances, points, made baskets, fouls and tracked minutes appear here.')}</section>`;
}
export function describe(event, state) {
  const e = event.input,
    name = e.playerId ? state.players[e.playerId]?.name || 'Player' : '';
  const text = {
    score: `${name} +${e.points}`,
    foul: `${name} · foul`,
    lineup: `${e.side} lineup set`,
    start: 'Clock started',
    pause: 'Clock paused',
    substitute: `${state.players[e.inId]?.name || 'Player'} in for ${state.players[e.outId]?.name || 'player'}`,
    undo: 'Basket / foul taken back',
    clock: `Clock corrected · ${e.reason}`,
    'next-period': 'Next period',
    finalize: 'Result finalized',
    reopen: `Result reopened · ${e.reason}`,
  };
  return text[e.type] || e.type;
}
export function scorer(g, selectedId) {
  const s = g.state,
    teamNames = names(g),
    selected = s.players[selectedId],
    active = selected && s.lineups[selected.side].includes(selected.id);
  const last = [...s.events]
    .reverse()
    .find((e) => !e.reversed && ['score', 'foul'].includes(e.input.type));
  const final = s.status === 'final';
  const controls = `<a class="button small" href="/api/games/${g.id}/export">Export game</a>${final ? '<button class="small" data-action="reopen">Reopen to correct</button>' : '<button class="small" data-action="finalize">Review & finalize</button>'}`;
  const sideCard = (side) =>
    `<div class="score-side"><div><h2>${esc(teamNames[side])}</h2><small>${side === 'home' ? 'HOME' : 'AWAY'} · ${g[side].periodFouls} fouls this period</small></div><div class="score-value">${g[side].score}</div></div>`;
  const panels = ['home', 'away']
    .map(
      (side) =>
        `<section class="team-panel"><div class="panel-head"><div><h3>${esc(teamNames[side])}</h3><small>${s.lineups[side].length} on court</small></div><button class="small" data-action="lineup" data-side="${side}" ${s.running || final ? 'disabled' : ''}>Set lineup</button></div><div class="tiles">${orderedPlayers(
          s,
        )
          .filter((p) => p.side === side)
          .map(
            (p) =>
              `<button class="player-tile ${s.lineups[side].includes(p.id) ? 'on-court' : ''} ${p.id === selectedId ? 'selected' : ''}" data-action="select-player" data-id="${p.id}" aria-pressed="${p.id === selectedId}"><strong>#${esc(p.jersey)}</strong><span>${esc(p.name)}</span><small>${p.points} PTS · ${p.fouls} PF · ${s.lineups[side].includes(p.id) ? 'On court' : 'Bench'}</small></button>`,
          )
          .join(
            '',
          )}</div><div class="roster-key">Green dot = on court · select a player to record</div></section>`,
    )
    .join('');
  return `${title(g.practice ? 'Practice / Game tracker' : 'Al-Hadi varsity / Game tracker', `${esc(teamNames.home)} <span class="muted">vs</span> ${esc(teamNames.away)}`, g.practice ? 'Rehearsal only. These players and results are excluded from your season totals.' : `${esc(when(g.scheduledAt))} · ${esc(g.venue || 'Venue to be entered')} · Team-maintained record`, controls)}
    <div id="pending-area"></div>
    <div class="scoreboard">${sideCard('home')}<div class="clock-area"><div class="period">${final ? 'FINAL' : period(s)}</div><div class="clock" id="game-clock">${clock(s.remainingMs)}</div><button class="${s.running ? '' : 'primary'} small" data-action="clock-toggle" ${final ? 'disabled' : ''}>${s.running ? 'Pause clock' : 'Start clock'}</button></div>${sideCard('away')}</div>
    ${s.minutesQuality === 'review-required' ? '<div class="note">The clock was manually corrected. Points and fouls remain recorded; minutes need review and are excluded from verified season-minute totals.</div>' : ''}
    <div class="actions"><span>${badge(g)}</span><button class="small" data-action="clock-adjust" ${s.running || final ? 'disabled' : ''}>Correct clock</button><button class="small" data-action="next-period" ${s.running || final || s.remainingMs > 0 || s.status !== 'live' ? 'disabled' : ''}>Next period</button><small class="muted">${s.rules.periods} × ${s.rules.periodSeconds / 60} min · OT ${s.rules.overtimeSeconds / 60} min · No automatic bonus ruling</small></div>
    <div class="scorer-grid section-space"><div class="teams-grid">${panels}</div><section class="panel control-panel"><div class="selected-player"><span class="eyebrow">Record a play</span>${selected ? `<div class="jersey">${esc(selected.jersey)}</div><h3>${esc(selected.name)}</h3><p>${esc(teamNames[selected.side])} · ${active ? 'On court' : 'On the bench'} · ${selected.points} points</p>` : '<h3>Select a player</h3><p>Choose a jersey from either team.</p>'}</div><div class="score-actions">${[1, 2, 3].map((points) => `<button data-action="score" data-points="${points}" ${!active || s.status !== 'live' ? 'disabled' : ''}>+${points}</button>`).join('')}</div><div class="secondary-actions"><button data-action="foul" ${!active || s.status !== 'live' ? 'disabled' : ''}>+ Foul</button><button data-action="undo" data-id="${last?.id || ''}" ${!last || final ? 'disabled' : ''}>Undo last stat</button></div><div class="sub-form"><label for="sub-player">Substitute selected player</label><select id="sub-player" ${!active || final ? 'disabled' : ''}><option value="">Choose a bench player</option>${
      selected
        ? orderedPlayers(s)
            .filter((p) => p.side === selected.side && !s.lineups[p.side].includes(p.id))
            .map((p) => `<option value="${p.id}">#${esc(p.jersey)} ${esc(p.name)}</option>`)
            .join('')
        : ''
    }</select><button data-action="substitute" ${!active || s.status !== 'live' ? 'disabled' : ''}>Make substitution</button><p class="muted"><small>Keys: 1 / 2 / 3 = basket · F = foul · Space = clock. Pause before changing full lineups.</small></p></div></section></div>
    <div class="scorer-bottom"><section class="panel"><div class="panel-head"><h2>Box score</h2><small>${final ? 'Finalized record' : 'Live team record'}</small></div><div class="table-wrap"><table><thead><tr><th>Player</th><th>PTS</th><th>1s</th><th>2s</th><th>3s</th><th>PF</th><th>MIN</th></tr></thead><tbody>${orderedPlayers(
      s,
    )
      .map(
        (p) =>
          `<tr><td><span class="player-name"><span class="jersey">${esc(p.jersey)}</span><span>${esc(p.name)}<br><small class="muted">${esc(teamNames[p.side])}</small></span></span></td><td><b>${p.points}</b></td><td>${p.ones}</td><td>${p.twos}</td><td>${p.threes}</td><td>${p.fouls}</td><td>${p.appeared ? `${minutes(p.milliseconds)}${s.minutesQuality === 'review-required' ? '*' : ''}` : final ? 'DNP' : '—'}</td></tr>`,
      )
      .join(
        '',
      )}</tbody></table></div></section><section class="panel"><div class="panel-head"><h2>Play log</h2><small>${s.events.length} saved actions</small></div><div class="play-log">${
      s.events.length
        ? [...s.events]
            .reverse()
            .slice(0, 40)
            .map(
              (e) =>
                `<div class="play ${e.reversed ? 'reversed' : ''}"><time>P${e.period} ${clock(e.remainingMs)}</time><b>${esc(describe(e, s))}</b></div>`,
            )
            .join('')
        : empty('Waiting for tip-off', 'Set the on-court players and start the clock.')
    }</div></section></div>`;
}
