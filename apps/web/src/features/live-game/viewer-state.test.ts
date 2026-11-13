import type { GameSnapshot, LiveMessage } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import type { ViewerState } from './viewer-state.ts';
import {
  applyMessage,
  applySnapshot as adopt,
  playersAreCurrent,
  startViewing,
} from './viewer-state.ts';

const gameId = '0192f000-0000-7000-8000-000000000001';
const otherGame = '0192f000-0000-7000-8000-000000000002';

const message = (sequence: number, home = sequence * 2): LiveMessage => ({
  gameId,
  sequence,
  sentAt: 1_000_000 + sequence * 1000,
  status: 'live',
  score: { home, away: 0 },
  period: 1,
  clock: { state: 'stopped', remainingMs: 480_000 },
  teamFouls: { home: 0, away: 0 },
  latestPlay: null,
});

const snapshot = (sequence: number): GameSnapshot => ({
  ...message(sequence),
  periods: 4,
  teams: {
    home: { name: 'Home', statsVisible: true },
    away: { name: 'Away', statsVisible: true },
  },
  players: [],
});

const applySnapshot = (state: ViewerState, snap: GameSnapshot): ViewerState =>
  adopt(state, snap).state;

const viewing = (sequence: number) => applySnapshot(startViewing(gameId), snapshot(sequence));

describe('a viewer fed numbered messages', () => {
  it('waits for the first snapshot before applying anything', () => {
    const r = applyMessage(startViewing(gameId), message(1));
    expect(r.outcome).toBe('waiting');
    expect(r.state.game).toBeNull();
  });
  it('applies each next message in order', () => {
    let s = viewing(0);
    for (const n of [1, 2, 3]) {
      const r = applyMessage(s, message(n));
      expect(r.outcome).toBe('applied');
      s = r.state;
    }
    expect(s.game?.sequence).toBe(3);
    expect(s.game?.score.home).toBe(6);
  });
  it('keeps the snapshot details when a message is applied', () => {
    const r = applyMessage(viewing(0), message(1));
    expect(r.state.game?.teams?.home.name).toBe('Home');
  });
  it('ignores a message already seen, an older one and one for another game', () => {
    const s = viewing(5);
    expect(applyMessage(s, message(5)).outcome).toBe('ignored');
    expect(applyMessage(s, message(2)).outcome).toBe('ignored');
    expect(applyMessage(s, { ...message(6), gameId: otherGame }).outcome).toBe('ignored');
    expect(applyMessage(s, message(5)).state).toBe(s);
  });
  it('asks for a snapshot when one message is missing, and does not apply the later one', () => {
    let s = applyMessage(viewing(0), message(1)).state;
    const r = applyMessage(s, message(3));
    expect(r.outcome).toBe('ask-for-snapshot');
    expect(r.state.game?.sequence).toBe(1);
    expect(r.state.awaitingSnapshot).toBe(true);
    s = r.state;
    // Further messages while waiting do not ask a second time.
    expect(applyMessage(s, message(4)).outcome).toBe('waiting');
  });
  it('carries on from the snapshot once it arrives', () => {
    let s = applyMessage(viewing(0), message(1)).state;
    s = applyMessage(s, message(3)).state;
    s = applySnapshot(s, snapshot(3));
    expect(s.awaitingSnapshot).toBe(false);
    expect(s.game?.sequence).toBe(3);
    expect(applyMessage(s, message(4)).outcome).toBe('applied');
  });
  it('keeps waiting when the snapshot is an old cached copy', () => {
    let s = applyMessage(viewing(0), message(1)).state;
    s = applyMessage(s, message(4)).state;
    s = applySnapshot(s, snapshot(2));
    expect(s.awaitingSnapshot).toBe(true);
    s = applySnapshot(s, snapshot(4));
    expect(s.awaitingSnapshot).toBe(false);
  });
  it('never goes back to a snapshot older than what is shown', () => {
    const s = viewing(7);
    expect(adopt(s, snapshot(3)).state).toBe(s);
  });
  it('shows a game that ended', () => {
    const r = applyMessage(viewing(1), { ...message(2), status: 'final' });
    expect(r.state.game?.status).toBe('final');
  });
  it('tells the page to refetch when the snapshot is behind messages seen', () => {
    let s = applyMessage(viewing(0), message(1)).state;
    s = applyMessage(s, message(4)).state;
    expect(adopt(s, snapshot(2)).refetch).toBe(true);
    expect(adopt(s, snapshot(4)).refetch).toBe(false);
  });
  it('still applies in-order messages after an old snapshot, so it never freezes', () => {
    let s = applyMessage(viewing(0), message(1)).state;
    s = applyMessage(s, message(4)).state;
    s = applySnapshot(s, snapshot(2));
    const r = applyMessage(s, message(3));
    expect(r.outcome).toBe('applied');
    expect(r.state.awaitingSnapshot).toBe(true);
    const r2 = applyMessage(r.state, message(4));
    expect(r2.outcome).toBe('applied');
    expect(r2.state.awaitingSnapshot).toBe(false);
  });
  it('remembers messages heard before the first snapshot', () => {
    let s = applyMessage(startViewing(gameId), message(5)).state;
    s = applyMessage(s, message(3)).state;
    expect(s.seenSequence).toBe(5);
    const r = adopt(s, snapshot(2));
    expect(r.refetch).toBe(true);
    expect(r.state.awaitingSnapshot).toBe(true);
    expect(adopt(s, snapshot(5)).refetch).toBe(false);
  });
  it('does not show the snapshot players as current once a message is applied', () => {
    const s = viewing(0);
    expect(playersAreCurrent(s.game!)).toBe(true);
    const r = applyMessage(s, message(1));
    expect(playersAreCurrent(r.state.game!)).toBe(false);
  });
  it('ignores a snapshot for another game without a refetch', () => {
    expect(adopt(startViewing(gameId), { ...snapshot(1), gameId: otherGame }).refetch).toBe(false);
  });
});
