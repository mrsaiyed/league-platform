// What Admin → League settings draws (P4 §6, T5 §6): every league-level setting with its
// value, who plays in the league and whether a child is recorded (record 065), the league's
// state and the checks publishing is judged on (step 2.240), its profile (step 2.125) and
// what bringing children in would put back (S-96). It changes nothing, but runs in the shape
// of a command (record 014), so the check is made here, in core, not by the page (T-74).
//
// Since step 2.227 (T-474): `league.settings` for the WHOLE league, in any state of the
// league, so the owner and a league-wide admin read it as before and an admin limited to
// one program is refused it. Such an admin still opens Settings for the Admins page of
// their program (step 2.97), which reads nothing of this.
import { z } from 'zod';
import { defineCommand, ok, type Result } from '../../../command/index.ts';
import { readYouthResets, type YouthResets } from '../commands/set-league-audience.ts';
import { mayChangeLeagueSettings } from '../policy.ts';
import type { LeagueProfile, LeagueRecord, LeaguesTx } from '../ports.ts';
import { readPublishChecks } from '../queries/read-publish-checks.ts';
import type { PublishCheck } from '../rules/publish-checks.ts';
import { listLeagueSettings, type LeagueSettingRow } from './list-league-settings.ts';
import { readPrivacyFacts, type PrivacyFacts } from './read-privacy-facts.ts';

export type LeagueSettingsView = {
  readonly rows: readonly LeagueSettingRow[];
  readonly facts: PrivacyFacts;
  /** The league's state and version (the Publish part). */
  readonly league: LeagueRecord | undefined;
  readonly checks: readonly PublishCheck[];
  readonly profile: LeagueProfile | undefined;
  readonly resets: YouthResets;
};

export const readLeagueSettings = defineCommand({
  name: 'leagues.read_league_settings',
  permission: 'league.settings',
  input: z.object({}),
  // At the league's own scope (the default): a grant limited to one program does not cover it.
  allowed: (context, _input, tx: LeaguesTx) => mayChangeLeagueSettings(context, tx),
  run: async ({ tx }): Promise<Result<LeagueSettingsView, never>> =>
    ok({
      rows: await listLeagueSettings(tx),
      facts: await readPrivacyFacts(tx),
      league: await tx.leagues.currentLeague(),
      checks: await readPublishChecks(tx),
      profile: await tx.leagues.leagueProfile(),
      resets: await readYouthResets(tx),
    }),
});
