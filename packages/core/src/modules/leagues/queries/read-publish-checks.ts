// The facts P3's "Must fix" list is judged on, read from the league's own rows, and the
// checks they give (rules/publish-checks.ts; step 2.240). Not a command: it changes
// nothing. The League settings screen draws it, and setLeagueStatus reads it again in its
// own transaction before it publishes.
import { publicNames } from '../settings/declarations.ts';
import type { LeaguesTx } from '../ports.ts';
import { publishChecks, type PublishCheck } from '../rules/publish-checks.ts';

export async function readPublishChecks(
  tx: Pick<LeaguesTx, 'leagues'>,
): Promise<readonly PublishCheck[]> {
  const stored = await tx.leagues.settingRows(publicNames.key, {});
  return publishChecks({
    contactEmail: await tx.leagues.leagueContactEmail(),
    audience: await tx.leagues.leagueAudience(),
    hasRecordedChild: await tx.leagues.hasRecordedChild(),
    namesChosen: stored.some((row) => row.level === 'league'),
  });
}
