// T-403 (step 2.243): every save S-109 and T-402 guard takes the league's own row before
// it reads the people or the settings it decides on, so for one league they run one
// after another. The stores here write down their calls in order: before the lock, the
// guarded store is asked nothing but what the permission check itself reads.
import { describe, expect, it } from 'vitest';
import { recordingTransaction, testDeps } from '../../../command/testing/memory-transaction.ts';
import { memoryBin, ownerId as binOwner, teamId } from '../memory-bin.test-helper.ts';
import { memoryLeagues, ownerId as leaguesOwner } from '../memory-leagues.test-helper.ts';
import { restorePerson } from './restore-person.ts';
import { setLeagueProfile } from './set-league-profile.ts';
import { setSetting } from './set-setting.ts';

/** The calls made of one store, from the first up to and with its one lock. */
function upToTheLock(calls: readonly string[], store: string, lock: string): string[] {
  const own = calls.filter((call) => call.startsWith(`${store}.`));
  expect(
    own.filter((call) => call === lock),
    own.join(', '),
  ).toHaveLength(1);
  return own.slice(0, own.indexOf(lock) + 1);
}

const yes = {
  level: 'league',
  key: 'privacy.childrenInFullConfirmed',
  value: true,
  version: null,
  confirmed: true,
};

describe('the guarded saves take the league row first (T-403)', () => {
  it('a person back from the bin: the lock is the first thing the bin store is asked', async () => {
    const id = teamId(5);
    const child = {
      id,
      kind: 'person' as const,
      name: 'Kid',
      binnedAt: '2026-11-01T00:00:00.000Z',
      child: true,
    };
    const m = memoryBin({ things: [child], childrenInFull: true });
    const calls: string[] = [];
    const deps = testDeps(recordingTransaction(m.transaction, calls));
    expect(await restorePerson(m.as(binOwner), { personId: id }, deps)).toMatchObject({ ok: true });
    expect(upToTheLock(calls, 'bin', 'bin.firstChild.lockLeague')).toEqual([
      'bin.firstChild.lockLeague',
    ]);
  });

  it('a time zone change: the lock comes before the league is read in the save', async () => {
    const m = memoryLeagues();
    const owner = m.as(leaguesOwner);
    const calls: string[] = [];
    const input = {
      contactEmail: 'league@example.org',
      city: 'Springfield',
      timeZone: 'Europe/London',
      listed: true,
      version: 3,
    };
    const deps = testDeps(recordingTransaction(m.transaction, calls));
    expect(await setLeagueProfile(owner, input, deps)).toMatchObject({ ok: true });
    // The permission check reads the league twice (who may change it), then the save locks.
    expect(upToTheLock(calls, 'leagues', 'leagues.lockLeague')).toEqual([
      'leagues.currentLeague',
      'leagues.currentLeague',
      'leagues.lockLeague',
    ]);
  });

  it('a yes to "children in full": the lock comes before who is recorded is read', async () => {
    const m = memoryLeagues({ audience: 'adult', recordedChild: true });
    const calls: string[] = [];
    const deps = testDeps(recordingTransaction(m.transaction, calls));
    expect(await setSetting(m.as(leaguesOwner), yes, deps)).toMatchObject({ ok: true });
    // The permission check reads the league twice (who may change it), then the save locks.
    expect(upToTheLock(calls, 'leagues', 'leagues.lockLeague')).toEqual([
      'leagues.currentLeague',
      'leagues.currentLeague',
      'leagues.lockLeague',
    ]);
  });

  it('a no takes no lock: only the yes is guarded', async () => {
    const m = memoryLeagues({ audience: 'adult', recordedChild: false });
    const calls: string[] = [];
    const deps = testDeps(recordingTransaction(m.transaction, calls));
    const no = { ...yes, value: false, confirmed: undefined };
    expect(await setSetting(m.as(leaguesOwner), no, deps)).toMatchObject({ ok: true });
    expect(calls).not.toContain('leagues.lockLeague');
  });
});
