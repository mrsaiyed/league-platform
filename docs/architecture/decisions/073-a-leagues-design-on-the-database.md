# 073 — A league's own design is kept on the database

Date: 2026-11-16. Step 2.187 (T-277); follows records 055, 069 and 070. Serves T3 §10, T5 §1 and §5, P5 §2 and §5, A-9, C-3, C-16, T-45, T-90, T-96. Decided by the builder of step 2.187 for the lead, to be confirmed when the step lands.

**Not verified against a real PostgreSQL server or Supabase.** Everything below runs on the made-up database (PGlite) only.

## Problem

Nothing in the database kept a league's design, so every league on the database was drawn in the neutral starting design (clean-court, record 070): the founder's first online test copy would have shown every league in the same blue. The seed's leagues carried their starting design only as seed data, and `npm run league:make` gave a new league none.

## What

- **T3's two tables, migration 0020.** `site_releases`: one published version of a league's whole site, never changed or removed (history, `refuse_history_change`; app_user may only add and read): its `number` in the league (1 or more, once each: `site_releases_number_key`), `starting_design` (a starting design's key), `design` (the design document of T5 §1), `menu` and `pages` (empty documents, `{"version": 1}`, until the design editor), `published_by_account_id`, `published_at`. `sites`: the draft, one per league: `starting_design`, `design_draft`, `menu_draft`, `published_release_id` (a link to its own league's release, `(league_id, published_release_id)`), with a `version` (T-46). Both have the league fence of every league table: a `league_id` in every key and link, row-level security on and forced, one policy keyed to the league. The database checks what it can: each document an object naming its format version, within a size; a key a short lower-case word. T3 named the publisher `published_by`; the column is `published_by_account_id`, as every link to an account is named, and T3 is corrected.
- **Leagues that already exist get no rows.** A league with no release is drawn in the neutral design, exactly as every league is drawn today, until a design is published for it. A migration does not write one for them: a release is history that can never be taken back, and a design the migration chose would be one the league never published.
- **One written schema, kept in packages/contracts.** The design document's schema and the starting designs moved from packages/site to `packages/contracts/src/site-design.ts`, unchanged; packages/site re-exports them, and its font list takes its keys from there. Core may not import packages/site (T-21), and it must check a design by the very schema the site draws by, so the schema sits where both may read it, beside the season rules' (T2 §2: contracts holds "the written shape of stored documents").
- **The command `leagues.publish_site_design`** (core's leagues module, as the step names; T2's `site` module comes with the editor). Input: the starting design's key, the whole design document, and the release it started from (`sinceRelease`, 0 for none). It needs `site.publish` (owner, admins, editors: P4 §4), is refused in an archived or suspended league, refuses a stale `sinceRelease` and a number taken by a publish at the same moment (`changed-since-read`, T-46), and refuses any value the schema does not allow (`invalid-input`) before anything is written; only the values the schema knows are stored. It writes release n+1, points the site at it with the draft set to the same design, and logs `leagues.publish_site_design` with the number and the key.
- **A new league's first release is made with it.** `leagues.create` takes an optional `design` (a starting design's key and the main, accent and highlight colors chosen in place of its own): the site and release 1 are written in the league's own transaction, published by our staff, and the `leagues.create` entry names the key (no entry of its own, so the draft-league removal's activity rule is unchanged). `npm run league:make` passes `--design` (default: clean-court, the neutral one), `--main-color`, `--accent-color`, `--highlight-color`, each checked before anything is made. The seed publishes each seed league's own design through `leagues.publish_site_design` as its owner: Lakeside in crest, Maple Street now in midnight-gold, so the two differ and neither is the neutral one.
- **The draft-league removal and the purge keep up.** 0020 replaces 0017's `league_rows` (both tables counted), `league_removal_problems` (a league may hold the one site and first release the tool makes, by the same staff account, never changed since; anything else is `site-changed`) and `remove_draft_league` (the site, then the release under the history rule's one-league setting), and 0010's `purge_league_history` (the site, then its releases).
- **The read, and what is drawn.** `findPublishedDesign` reads the league's latest release by number, with `where league_id`, inside the fence; `leagueSites` on the database reads it with the name in the page's one read-only snapshot (record 070). Its design is checked against the schema again before it is drawn: a document that does not pass (an older shape, or one written past the command) is drawn in the neutral design and reported in the server's log, the league's id and the release's number only, once an hour per release. So a value that could break out of the page's `<style>` element (`red; } body {…}`, `</style><script>`, `url(…)`, a very long string) is refused when published and, were it in the database, never drawn; `designToCssVariables` checks every value a third time.

## Considered

- **Only the starting design's key and the changed colors.** A release would then change when a starting design changes in code, and T-96 says a release never changes. The whole document is kept.
- **The key inside the design document.** It would add a field to the schema the site draws by; a column beside it is plainer (T-44: names are columns).
- **Letting packages/database import packages/site.** It would change T-21 for one schema; contracts is where stored documents' shapes already live.
- **The tool publishing through `leagues.publish_site_design`.** Our staff hold no role in the league, and nothing is ever done as the owner (record 057); the first release belongs in the league's own transaction.
- **A design written for every league by the migration.** See above: history that cannot be taken back.

## Left for the design editor's step

Saving drafts (`sites.design_draft`, `menu_draft`, `pages`) with the version check, preview, the history of releases and restoring one (T-96: a restore is a new release), choosing another starting design, the contrast warnings on save (`contrastWarnings`, P5 §8), the menu and pages documents, logo and icon uploads, cache labels cleared on publish (T5 §4), and moving the command into T2's `site` module.

## Revisit if

- A design's format changes (T-104): an upgrade on read, before the check, instead of the neutral design.
- The editor arrives: the public read stays on the latest release; drafts are read only by the editor and preview.
