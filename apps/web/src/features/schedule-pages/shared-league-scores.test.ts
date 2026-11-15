// One connection per page to a league's live scores (2.85 review, L2): the home page's two
// lists of games share it, and it closes when the last one stops listening.
import type { LeagueScoreMessage } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import { sharedLeagueScores } from './shared-league-scores.ts';

const league = '01900000-0000-7000-8000-000000000001';
const other = '01900000-0000-7000-8000-000000000002';
const message = (gameId: string): LeagueScoreMessage =>
  ({ gameId, sequence: 1, status: 'live', score: { home: 2, away: 0 } }) as LeagueScoreMessage;

function world() {
  const opened: { leagueId: string; send: (m: LeagueScoreMessage) => void; closed: boolean }[] = [];
  const shared = sharedLeagueScores((leagueId, onMessage) => {
    const connection = { leagueId, send: onMessage, closed: false };
    opened.push(connection);
    return { close: () => void (connection.closed = true) };
  });
  return { opened, shared };
}

describe('the live scores of a league, shared by the lists of a page', () => {
  it('opens one connection for two lists, and both hear every message', () => {
    const { opened, shared } = world();
    const first: string[] = [];
    const second: string[] = [];
    shared.listen(league, (m) => first.push(m.gameId));
    shared.listen(league, (m) => second.push(m.gameId));
    expect(opened).toHaveLength(1);
    opened[0]?.send(message('g1'));
    expect(first).toEqual(['g1']);
    expect(second).toEqual(['g1']);
  });

  it('keeps the connection while one list still listens, and closes it with the last', () => {
    const { opened, shared } = world();
    const heard: string[] = [];
    const stopFirst = shared.listen(league, () => heard.push('first'));
    const stopSecond = shared.listen(league, () => heard.push('second'));
    stopFirst();
    expect(opened[0]?.closed).toBe(false);
    opened[0]?.send(message('g1'));
    expect(heard).toEqual(['second']);
    stopSecond();
    expect(opened[0]?.closed).toBe(true);
    // Stopping twice does nothing more.
    stopSecond();
    stopFirst();
    expect(opened).toHaveLength(1);
  });

  it('opens again for a list that starts after the last one stopped, and one a league', () => {
    const { opened, shared } = world();
    shared.listen(league, () => {})();
    shared.listen(league, () => {});
    expect(opened).toHaveLength(2);
    expect(opened[1]?.closed).toBe(false);
    shared.listen(other, () => {});
    expect(opened.map((o) => o.leagueId)).toEqual([league, league, other]);
  });
});
