// Who may run the Al-Hadi transfer (step 2.58): the owner or a league-wide admin of a
// league that is not read-only; a scorekeeper, a program admin, someone with no grant
// in this league (another league's admin) and a visitor may not.
import { describe, expect, it } from 'vitest';
import type { Grant, PermissionsTx } from '../access/index.ts';
import { mayTransferTrackerGames } from './may-transfer-tracker-games.ts';

const me = '01900000-0000-7000-8000-0000000000a1';
const owner = '01900000-0000-7000-8000-0000000000a9';
const program = { type: 'program', id: '01900000-0000-7000-8000-0000000000c1' } as const;
const context = { leagueId: 'l', accountId: me, requestId: 'r' };

const grant = (role: Grant['role'], scope: Grant['scope'] = { type: 'league' }): Grant => ({
  id: `g-${role}`,
  accountId: me,
  role,
  scope,
  grantedByAccountId: null,
  revokedAt: null,
});

const txWith = (grants: readonly Grant[], status = 'live', ownerId = owner): PermissionsTx => ({
  jobs: { enqueue: async () => {} },
  access: {
    ownerAccountId: async () => ownerId,
    leagueStatus: async () => status,
    activeGrantsOf: async () => grants,
  },
});

describe('mayTransferTrackerGames', () => {
  it('lets the owner and a league-wide admin run it', async () => {
    expect(await mayTransferTrackerGames(context, txWith([], 'live', me))).toBe(true);
    expect(await mayTransferTrackerGames(context, txWith([grant('admin')]))).toBe(true);
    expect(await mayTransferTrackerGames(context, txWith([grant('admin')], 'draft'))).toBe(true);
  });

  it('refuses anyone without every permission for the whole league', async () => {
    expect(await mayTransferTrackerGames(context, txWith([]))).toBe(false);
    expect(await mayTransferTrackerGames(context, txWith([grant('scorekeeper')]))).toBe(false);
    expect(await mayTransferTrackerGames(context, txWith([grant('admin', program)]))).toBe(false);
    expect(
      await mayTransferTrackerGames(context, txWith([{ ...grant('admin'), revokedAt: 'now' }])),
    ).toBe(false);
    expect(
      await mayTransferTrackerGames({ ...context, accountId: null }, txWith([grant('admin')])),
    ).toBe(false);
  });

  it('refuses in an archived or suspended league, and one in the bin', async () => {
    expect(await mayTransferTrackerGames(context, txWith([grant('admin')], 'archived'))).toBe(
      false,
    );
    expect(await mayTransferTrackerGames(context, txWith([grant('admin')], 'suspended'))).toBe(
      false,
    );
    const binned: PermissionsTx = {
      jobs: { enqueue: async () => {} },
      access: {
        ownerAccountId: async () => undefined,
        leagueStatus: async () => undefined,
        activeGrantsOf: async () => [grant('admin')],
      },
    };
    expect(await mayTransferTrackerGames(context, binned)).toBe(false);
  });
});
