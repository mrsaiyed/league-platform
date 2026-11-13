# T5 — The customization engine

[Spec home](../README.md) · Decisions T-90 to T-104

How "an admin can change anything by arranging parts we built" ([P5](../product/P5-site-customization.md)) works underneath. Four mechanisms cover all of it: **design values**, **page documents**, **defined settings**, and **features**.

## 1. Design values

A league's design is a small JSON document, checked against a schema.

```json
{
  "version": 1,
  "base": "dark",
  "colors": {
    "background": "#0b2233",
    "panel": "#0f2c40",
    "text": "#f3ead2",
    "primary": "#c8a84b",
    "accent": "#2fa89a"
  },
  "fonts": { "heading": "cinzel", "body": "jost" },
  "corners": "soft",
  "cards": "outlined",
  "spacing": "roomy",
  "logo": "asset:7f3c…",
  "icon": "asset:91ab…"
}
```

- **T-90:** the league layout turns this into CSS variables (`--color-primary` and so on) once per page. Every component is styled in terms of those variables. There is no per-league stylesheet and no generated CSS file.
- Fonts come from a fixed list we host ourselves. The document stores a font's key, never a web address.
- A **starting design** is simply a stored copy of such a document plus default page layouts.
- On save we compute contrast between text and background colors and return warnings (C-1, section 8 of P5).
- Division and team colors live on their own rows (`divisions.color`, `teams.color`) and reach components the same way.

## 2. Page documents

A page is a JSON document: an ordered list of sections, each with a type and options.

```json
{
  "version": 1,
  "sections": [
    {
      "id": "s1",
      "type": "banner",
      "options": { "badge": "Fall 2026", "headline": "Faraj League", "image": "asset:…" }
    },
    {
      "id": "s2",
      "type": "headline-numbers",
      "options": { "show": ["teams", "players", "divisions", "rounds-played"] }
    },
    { "id": "s3", "type": "recent-results", "options": { "count": 3, "style": "banded-card" } },
    { "id": "s4", "type": "standings", "options": { "layout": "compact", "division": "all" } },
    { "id": "s5", "type": "awards", "options": { "cadence": "round", "latest": true } },
    {
      "id": "s6",
      "type": "trophy",
      "options": { "style": "3d", "title": "Faraj League Champions" }
    }
  ]
}
```

- **T-91:** the document is validated when saved and again when published: known section types only, each section's options against that section's own schema, and size limits (sections per page, text lengths, images per gallery).
- **T-92:** a section's options hold arrangement and wording, never league data. `standings` says "compact, all divisions"; the teams and records come from the database at display time. This is why restoring an old page never rolls back results (C-3).

## 3. The section registry

Every section type is defined once, in its own folder ([T2](T2-repo-and-code-structure.md) section 5), by the same five things:

```ts
defineSection({
  type: 'standings',
  name: 'Standings',
  feature: null,                    // or 'awards', 'draft'... if it belongs to an optional feature
  options: StandingsOptions,        // Zod schema with defaults and limits
  load: (ctx, options) => …,        // fetches public data for this league and season
  View,                             // React component that draws it
  Editor                            // its options panel in Edit site
});
```

- **T-93: a section can only load data through public queries.** `load` receives a context that can read what the public may see (T-81) and nothing else, so no section can leak a private field however it is configured.
- The page renderer walks the document, runs every section's `load` in parallel, and renders each `View` on the server.
- Sections whose `feature` is switched off are skipped on the site and hidden from the "add section" list.
- **T-94:** adding a new section type touches only its folder and one registry line. Existing leagues are unaffected until an admin adds it.

## 4. Drawing and caching a page

1. A request for `/farajleague/standings` finds the league and its current published release.
2. The renderer draws the page from the release's design, menu and page document.
3. The result is cached at Cloudflare and in the app, labeled with what it depends on: the release number, and data labels such as `league:{id}:standings`.
4. When something changes, only the matching labels are cleared: publishing the site clears the release label; finalizing a game clears `standings`, `results` and `stats` for that season.

Clearing by label is a Cloudflare feature, and which plans include it is checked when stage 1 starts. The fallback is clearing by address prefix (everything under `/farajleague/`), which is coarser but just as correct.

**T-95:** personal additions (the bell, "my next game", my team highlighted) are loaded separately after the cached page, with the visitor's session. The cached page is identical for everyone.

## 5. Draft, preview, publish, restore

- Edits change `sites.design_draft`, `sites.menu_draft` and `pages.draft`. They save automatically a moment after each change, with the version check of T-46.
- **Preview** draws the drafts with the same renderer. It is available only to that league's admins.
- **Publish** validates everything, then in one transaction writes a new `site_releases` row containing the design, the menu and every page document, and points the site at it. Cache labels are cleared after the transaction commits.
- **T-96: a release is never changed after it is written.** Restoring version 12 creates version 31 with version 12's content.
- **T-97:** the editor is the public renderer plus overlays, not a separate imitation of the site. What the admin sees while editing is what will be published.

## 6. Defined settings

Every setting in the product (reminder timing, whether player pages exist) is declared once in code. Rules that change results, such as the tiebreaker order, are not settings: they are season rules (S-1, [decision record 019](../../../architecture/decisions/019-where-setting-values-are-stored.md)). A declaration looks like this:

```ts
defineSetting({
  key: 'notifications.reminderLeadHours',
  type: z.number().int().min(1).max(72),
  default: 24,
  levels: ['league', 'season'], // where it can be set
  permission: 'league.settings',
  label: 'Send game reminders this many hours before the game',
});
```

- **T-98:** the admin screens for settings are generated from these declarations, so a setting cannot exist without a default, limits, a label and a permission.
- A value is looked up from most specific to least: season, then program, then league, then our default. The values an admin sets are kept in `setting_values`, one row per key and place ([T3](T3-data-model.md) section 4, T-231).
- **Wording** (U-4) is the same idea for labels: components ask for `word('division')` and get "Conference" in Faraj.
- Settings that affect results (season rules) are versioned and locked as described in S-1.

## 7. Features

An optional feature (awards, draft, sponsors, media, news, registration fees, player pages) is declared with its key, what it depends on, whether it has to be part of the league's agreement with us, and what it brings: section types, standard pages, an admin area, notification types.

- **T-99:** switching a feature off hides all of that and stops its jobs. Its tables and data are untouched, so switching it back on restores everything.
- **T-100:** three separate questions are never mixed: does the league's **agreement** with us include it, has the league **switched it on**, and have **we** released it yet (a rollout flag we control). A feature shows only when all three are yes.

## 8. Sports

A sport is declared the same way: its key, period presets, its list of statistics (key, label, abbreviation, whether tracked live or derived), default standings rules, and optionally a live engine.

- Basketball is the only sport with a live engine at first (`packages/sports/basketball`, already built and tested).
- **T-101:** a sport without a live engine still works everywhere else (B-6), because schedules, final scores and standings do not depend on the engine.

## 9. The 3D trophy

- It is the `trophy` section with `style: "3d"`.
- Its data is a list the platform already has: each completed season's champion team, captain and roster.
- Faraj's existing layout logic (which plate goes where, how names are engraved) is pure code with tests and moves across nearly unchanged. Its 3D drawing code becomes the section's `View`.
- **T-102:** the 3D code is downloaded only on pages that use that style, so no other league's pages get slower because the trophy exists.
- Its options (title, metal color, name layout) are the section's schema. Faraj's values are one configuration of it.
- A league's own trophy (C-5, later) is a further style with its own model or picture. Its uploads follow T-80.

## 10. Proving "exactly as it is" for Faraj

- **T-103 (changed with C-7):** the acceptance test for Faraj is the feature list in [P9](../product/P9-faraj-and-tcsaal.md) section 1.1, demonstrated row by row, plus the founder's side-by-side review. Stored screenshots of the current site are the reference for that review, not an automatic gate. Once the founder has signed off, screenshots of the new Faraj pages become an automatic check on every change, so later work on the platform cannot quietly alter Faraj's site.
- Where matching needs a look the platform lacks (for example the banded game card), we add it as a named style option of the relevant section, available to every league.

## 11. Changing formats later

- **T-104:** every document (design, page, form, season rules) carries a version. When a format changes, an upgrade function converts old to new at the moment a document is read. Published releases are therefore never rewritten in bulk and never break.
- Retiring a section type or option follows the same route: the upgrader maps it to its replacement.
