import assert from 'node:assert/strict';
// Credential arrives on hidden stdin only; never persist or log it.
const input = await new Promise((resolve, reject) => {
  let value = '';
  const tty = process.stdin.isTTY;
  if (tty) process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stderr.write('Ready for private Site verification JSON on stdin (input is hidden).\n');
  process.stdin.on('data', (chunk) => {
    value += chunk;
    if (value.includes('\n') || value.includes('\r')) {
      if (tty) process.stdin.setRawMode(false);
      process.stdin.pause();
      try {
        resolve(JSON.parse(value.trim()));
      } catch {
        reject(new Error('Invalid verification input'));
      }
    }
  });
});
const { origin, token } = input;
if (new URL(origin).origin !== origin || !origin.startsWith('https://'))
  throw new Error('Use exact HTTPS Site origin.');
const api = async (path, data) => {
  const response = await fetch(origin + path, {
    method: data ? 'POST' : 'GET',
    headers: {
      'OAI-Sites-Authorization': `Bearer ${token}`,
      ...(data ? { 'Content-Type': 'application/json', Origin: origin } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  if (!response.ok) throw new Error(`Hosted request ${path} failed with ${response.status}`);
  return response.json();
};
assert.equal((await api('/api/health')).mode, 'hosted-sql-pilot');
let game = await api('/api/practice', { commandId: crypto.randomUUID() });
const send = async (input) => {
  game = await api(`/api/games/${game.id}/commands`, {
    commandId: crypto.randomUUID(),
    expectedRevision: game.revision,
    input,
  });
};
for (const side of ['home', 'away'])
  await send({
    type: 'lineup',
    side,
    playerIds: Object.values(game.state.players)
      .filter((p) => p.side === side)
      .slice(0, 5)
      .map((p) => p.id),
  });
await send({ type: 'start' });
const scorer = game.state.lineups.home[0],
  action = {
    commandId: crypto.randomUUID(),
    expectedRevision: game.revision,
    input: { type: 'score', playerId: scorer, points: 2 },
  };
game = await api(`/api/games/${game.id}/commands`, action);
await api(`/api/games/${game.id}/commands`, action);
await send({ type: 'pause' });
const saved = await api(`/api/games/${game.id}`),
  exported = await api(`/api/games/${game.id}/export`),
  dashboard = await api('/api/dashboard');
assert.equal(saved.home.score, 2);
assert.equal(saved.state.players[scorer].points, 2);
assert.equal(saved.revision, 5);
assert.equal(exported.events.length, 5);
assert.equal(dashboard.stats.length, 0);
console.log(
  JSON.stringify({
    verified: true,
    origin,
    practiceGameId: game.id,
    persistedScore: saved.home.score,
    acceptedEvents: exported.events.length,
    realRosterPlayers: dashboard.roster.players.length,
  }),
);
