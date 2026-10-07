function standings(teams, games) {
  return teams
    .map((team) => {
      const gs = games.filter(
        (g) => g.status === 'final' && (g.home === team.id || g.away === team.id),
      );
      return gs.reduce(
        (r, g) => {
          const pf = g.home === team.id ? g.homeScore : g.awayScore,
            pa = g.home === team.id ? g.awayScore : g.homeScore;
          r.played++;
          r.wins += pf > pa ? 1 : 0;
          r.losses += pf < pa ? 1 : 0;
          r.pf += pf;
          r.pa += pa;
          r.diff = r.pf - r.pa;
          return r;
        },
        { ...team, played: 0, wins: 0, losses: 0, pf: 0, pa: 0, diff: 0 },
      );
    })
    .sort((a, b) => b.wins - a.wins || b.diff - a.diff);
}
function playerStats(players, box) {
  return players
    .map((p) => {
      const rows = box.filter((b) => b.playerId === p.id && b.participated);
      const points = rows.reduce((s, b) => s + b.points, 0);
      return {
        ...p,
        gp: rows.length,
        points,
        ppg: rows.length ? points / rows.length : null,
        seconds: rows.reduce((s, b) => s + (b.seconds || 0), 0),
      };
    })
    .sort((a, b) => (b.ppg ?? -1) - (a.ppg ?? -1) || b.points - a.points);
}
function draftTeam(pick, teams) {
  const round = Math.floor(pick / teams.length);
  const ix = pick % teams.length;
  return teams[round % 2 ? teams.length - 1 - ix : ix].id;
}
function draftPick(draft, playerId, players, teams, max = 7) {
  const p = players.find((p) => p.id === playerId);
  if (!p || p.captain || draft.picks.some((x) => x.playerId === playerId))
    throw Error('This player is not available.');
  const team = draftTeam(draft.picks.length, teams);
  const count = 1 + draft.picks.filter((x) => x.team === team).length;
  if (count >= max) throw Error('This roster is full.');
  return { ...draft, picks: [...draft.picks, { team, playerId, pick: draft.picks.length + 1 }] };
}
function roundRobin(teamIds, repetitions = 1) {
  const ids = [...teamIds];
  if (ids.length % 2) ids.push(null);
  const rounds = [];
  for (let r = 0; r < ids.length - 1; r++) {
    const games = [];
    for (let i = 0; i < ids.length / 2; i++) {
      const a = ids[i],
        b = ids[ids.length - 1 - i];
      if (a && b) games.push([a, b]);
    }
    rounds.push(games);
    ids.splice(1, 0, ids.pop());
  }
  return Array.from({ length: repetitions }, (_, rep) =>
    rounds.map((row) => row.map(([a, b]) => (rep % 2 ? [b, a] : [a, b]))),
  ).flat();
}
function initialLive(players) {
  const ids = players.filter((p) => ['falcons', 'eagles'].includes(p.team));
  const points = { falcons: [12, 8, 6, 4, 2, 0], eagles: [10, 8, 6, 4, 0, 0] };
  let seen = {};
  return {
    remaining: 504,
    running: false,
    final: false,
    players: Object.fromEntries(
      ids.map((p) => {
        const i = seen[p.team] || 0;
        seen[p.team] = i + 1;
        return [
          p.id,
          {
            points: points[p.team][i],
            fouls: 0,
            seconds: i < 5 ? 456 : 0,
            onCourt: i < 5,
            participated: i < 5,
          },
        ];
      }),
    ),
    events: [],
  };
}
function tickLive(live) {
  if (!live.running || live.final) return live;
  const left = Math.max(0, live.remaining - 1);
  return {
    ...live,
    remaining: left,
    running: left > 0,
    players: Object.fromEntries(
      Object.entries(live.players).map(([id, p]) => [
        id,
        {
          ...p,
          seconds: p.seconds + (p.onCourt ? 1 : 0),
          participated: p.participated || p.onCourt,
        },
      ]),
    ),
  };
}
export { standings, playerStats, draftTeam, draftPick, roundRobin, initialLive, tickLive };
