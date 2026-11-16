// publishSiteDesign on a stand-in store (step 2.187, record 073); the same command against
// the real database is in packages/database/src/stores/leagues-commands.test.ts, the
// two-league harness and the role matrix.
import { startingDesign, startingDesignWith } from '@srleagues/contracts';
import { describe, expect, it } from 'vitest';
import type { Grant, Role } from '../../access/index.ts';
import { leagueId, memoryLeagues, ownerId } from '../memory-leagues.test-helper.ts';
import { publishSiteDesign } from './publish-site-design.ts';

const owner = { leagueId, accountId: ownerId, requestId: 'request-1' };
const crestInRed = startingDesignWith('crest', { primary: '#b00020' });

function setUp(...grants: { accountId: string; role: Role }[]) {
  const { db, deps } = memoryLeagues();
  db.state.grants = grants.map(
    ({ accountId, role }): Grant => ({
      id: `grant-${role}`,
      accountId,
      role,
      scope: { type: 'league' },
      grantedByAccountId: ownerId,
      revokedAt: null,
    }),
  );
  return { db, deps };
}

/** Text that would end a style rule, close the style element, or fetch from elsewhere. */
const hostile = [
  'red; } body { display:none',
  '#96062d; } body { display:none',
  '</style><script>alert(1)</script>',
  'url(http://example.test/x.png)',
  `#${'a'.repeat(100_000)}`,
];

describe('publishSiteDesign', () => {
  it('publishes the first release, points the site at it, and logs who did it (A-6)', async () => {
    const { db, deps } = setUp();
    expect(
      await publishSiteDesign(
        owner,
        { startingDesign: 'crest', design: crestInRed, sinceRelease: 0 },
        deps,
      ),
    ).toEqual({ ok: true, value: { number: 1 } });
    const [release] = db.state.siteReleases;
    expect(release).toMatchObject({
      number: 1,
      startingDesign: 'crest',
      design: crestInRed,
      publishedByAccountId: ownerId,
    });
    expect(db.state.site).toEqual({
      startingDesign: 'crest',
      designDraft: crestInRed,
      publishedReleaseId: release?.id,
    });
    expect(db.state.activity).toEqual([
      {
        actorAccountId: ownerId,
        action: 'leagues.publish_site_design',
        targetType: 'site_release',
        targetId: release?.id,
        summary: 'activity.leagues.publish_site_design',
        details: { number: 1, startingDesign: 'crest' },
      },
    ]);
  });

  it('publishes a new release each time, never changing one (T-96)', async () => {
    const { db, deps } = setUp();
    await publishSiteDesign(
      owner,
      { startingDesign: 'crest', design: crestInRed, sinceRelease: 0 },
      deps,
    );
    const neutral = startingDesign('clean-court');
    expect(
      await publishSiteDesign(
        owner,
        { startingDesign: 'clean-court', design: neutral, sinceRelease: 1 },
        deps,
      ),
    ).toEqual({ ok: true, value: { number: 2 } });
    expect(db.state.siteReleases.map((r) => [r.number, r.design])).toEqual([
      [1, crestInRed],
      [2, neutral],
    ]);
    expect(db.state.site?.publishedReleaseId).toBe(db.state.siteReleases[1]?.id);
  });

  it('refuses a save started from an older release, and a second first release (T-46)', async () => {
    const { db, deps } = setUp();
    const first = { startingDesign: 'crest' as const, design: crestInRed, sinceRelease: 0 };
    await publishSiteDesign(owner, first, deps);
    for (const sinceRelease of [0, 2]) {
      expect(await publishSiteDesign(owner, { ...first, sinceRelease }, deps)).toEqual({
        ok: false,
        error: { code: 'changed-since-read' },
      });
    }
    expect(db.state.siteReleases).toHaveLength(1);
    expect(db.state.activity).toHaveLength(1);
  });

  it('refuses when another publish took the number first, writing nothing', async () => {
    const { db, deps } = setUp();
    db.state.takenReleaseNumbers = [1];
    expect(
      await publishSiteDesign(
        owner,
        { startingDesign: 'crest', design: crestInRed, sinceRelease: 0 },
        deps,
      ),
    ).toEqual({ ok: false, error: { code: 'changed-since-read' } });
    expect(db.state.siteReleases).toEqual([]);
    expect(db.state.activity).toEqual([]);
  });

  it('refuses any value the written schema does not allow, storing nothing', async () => {
    const { db, deps } = setUp();
    const design = startingDesign('crest');
    const inputs: unknown[] = [
      ...hostile.flatMap((value) =>
        (['background', 'panel', 'text', 'primary', 'accent', 'highlight'] as const).map(
          (color) => ({ ...design, colors: { ...design.colors, [color]: value } }),
        ),
      ),
      { ...design, fonts: { ...design.fonts, heading: "x'; } body { display:none" } },
      { ...design, corners: '0; } body { display:none' },
      { ...design, cards: 'url(http://example.test)' },
      { ...design, spacing: '</style>' },
      { ...design, base: 'dark; color: red' },
      { ...design, version: 2 },
      'crest',
    ];
    for (const input of inputs) {
      expect(
        await publishSiteDesign(
          owner,
          { startingDesign: 'crest', design: input, sinceRelease: 0 },
          deps,
        ),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
    for (const startingDesign of ['</style>', 'no-such-design', 'toString']) {
      expect(
        await publishSiteDesign(owner, { startingDesign, design, sinceRelease: 0 }, deps),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
    expect(db.state.siteReleases).toEqual([]);
  });

  it('stores only the values the schema knows', async () => {
    const { db, deps } = setUp();
    await publishSiteDesign(
      owner,
      {
        startingDesign: 'crest',
        design: { ...crestInRed, css: '</style><script>' },
        sinceRelease: 0,
      },
      deps,
    );
    expect(db.state.siteReleases[0]?.design).toEqual(crestInRed);
  });

  it('lets the owner, admins and editors publish, and no other role (P4 §4)', async () => {
    const admin = '01900000-0000-7000-8000-0000000000a2';
    const editor = '01900000-0000-7000-8000-0000000000a3';
    const scheduler = '01900000-0000-7000-8000-0000000000a4';
    const { deps } = setUp(
      { accountId: admin, role: 'admin' },
      { accountId: editor, role: 'editor' },
      { accountId: scheduler, role: 'scheduler' },
    );
    const input = (sinceRelease: number) => ({
      startingDesign: 'crest',
      design: crestInRed,
      sinceRelease,
    });
    expect(
      await publishSiteDesign({ ...owner, accountId: scheduler }, input(0), deps),
    ).toMatchObject({ error: { code: 'not-allowed' } });
    for (const [n, accountId] of [ownerId, admin, editor].entries()) {
      expect(await publishSiteDesign({ ...owner, accountId }, input(n), deps)).toMatchObject({
        ok: true,
      });
    }
  });

  it('refuses anyone with no role, a visitor, and another league', async () => {
    const { db, deps } = setUp();
    const input = { startingDesign: 'crest', design: crestInRed, sinceRelease: 0 };
    for (const accountId of ['someone-else', null]) {
      expect(await publishSiteDesign({ ...owner, accountId }, input, deps)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      });
    }
    const otherLeague = { ...owner, leagueId: '01900000-0000-7000-8000-000000000002' };
    expect(await publishSiteDesign(otherLeague, input, deps)).toMatchObject({
      error: { code: 'not-allowed' },
    });
    expect(db.state.siteReleases).toEqual([]);
  });

  it('refuses while the league is archived or suspended, which are read-only (U-9)', async () => {
    for (const status of ['archived', 'suspended'] as const) {
      const { db, deps } = setUp();
      if (db.state.league !== undefined) db.state.league = { ...db.state.league, status };
      expect(
        await publishSiteDesign(
          owner,
          { startingDesign: 'crest', design: crestInRed, sinceRelease: 0 },
          deps,
        ),
      ).toMatchObject({ error: { code: 'not-allowed' } });
      expect(db.state.siteReleases).toEqual([]);
    }
  });
});
