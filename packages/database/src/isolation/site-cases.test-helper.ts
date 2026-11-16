// The two-league harness's cases for a league's site (step 2.187, record 073, T-65): the
// read of its published design, the write of a release, and the commands that publish
// one. Each league of the pair has one release (number 1) and its site, its design
// carrying its marker. Imported by isolation-cases.test-helper.ts.
import { createLeague, publishSiteDesign } from '@srleagues/core';
import { startingDesignWith } from '@srleagues/contracts';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { transactionOf } from '../db/transaction-scope.ts';
import { findPublishedDesign, insertSiteRelease } from '../queries/index.ts';
import {
  harnessTx,
  inFreshLeague,
  registerCommandCase,
  runAsApp,
} from './command-cases.test-helper.ts';
import { registerIsolationCase } from './isolation-registry.test-helper.ts';

registerIsolationCase({
  subject: findPublishedDesign,
  name: "read the scope's league's published design, with a later release of the target's beside it",
  run: async (scope, target) => {
    // A release of the target's numbered past every other (99) is written for the read
    // and taken away again before the run ends (a savepoint), so a read that lost its
    // `where league_id` would meet it first, its design carrying the target's marker.
    // Where the fence refuses the write (every run but the control and code-only),
    // nothing is written and the read goes on.
    const trx = transactionOf(scope);
    await sql`savepoint later_target_release`.execute(trx);
    try {
      await trx
        .insertInto('site_releases')
        .values({
          league_id: target.leagueId,
          number: 99,
          starting_design: 'crest',
          design: { version: 1, mark: target.marker },
          published_by_account_id: target.ownerId,
        })
        .execute();
    } catch {
      await sql`rollback to savepoint later_target_release`.execute(trx);
      return findPublishedDesign(scope);
    }
    const read = await findPublishedDesign(scope);
    await sql`rollback to savepoint later_target_release`.execute(trx);
    return read;
  },
});

registerIsolationCase({
  subject: insertSiteRelease,
  name: "publish release 2 of the scope's league, pointing its site at it",
  run: (scope) =>
    insertSiteRelease(scope, {
      number: 2,
      startingDesign: 'crest-light',
      design: { version: 1, base: 'light' },
      publishedByAccountId: scope.accountId ?? randomUUID(),
    }),
});

registerCommandCase(publishSiteDesign, harnessTx, {
  name: "publish a design for the league's site as its owner, after its first release",
  input: () => ({
    startingDesign: 'midnight-gold',
    design: startingDesignWith('midnight-gold', { primary: '#123456' }),
    sinceRelease: 1,
  }),
});

registerIsolationCase({
  subject: createLeague,
  name: 'create a league with its first site release, in a fresh league id',
  run: (scope) =>
    inFreshLeague(scope, (fresh) =>
      runAsApp(createLeague, harnessTx, fresh, {
        slug: 'harness-site-league',
        name: 'Harness league with a site',
        timeZone: 'America/Chicago',
        audience: 'adult',
        ownerAccountId: scope.accountId ?? randomUUID(),
        sportKey: 'basketball',
        design: { startingDesign: 'crest', colors: { accent: '#445566' } },
      }),
    ),
});
