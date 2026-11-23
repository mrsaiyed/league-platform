-- 0022: how level teams were ordered, kept on each of their standings rows (step 2.198;
-- P7 §1 and §6, S-9, S-74; T3 §9; the numbers audit's M4).
--
-- Until now a standings row kept one reason for its place (`decided_by`): the last
-- tiebreaker that made the team a place of its own. Among three or more level teams
-- that is not what placed them: a team put below two others by head-to-head and then
-- above the fourth by point difference was told only "point difference", and the page
-- could only list the season's tiebreakers. The engine (packages/sports/src/standings)
-- now also says, for a set of level teams, which teams they are and each tiebreaker it
-- tried on them, with each team's place, figure and head-to-head record; it is written
-- here on each of their rows, by the same rebuild that writes the rest of the row:
--
--   level: empty for a team its record alone placed (level with nobody). Otherwise a
--     versioned document (T-44, T-50):
--       {"version": 1,
--        "teamIds": [the level teams, in the table's order],
--        "steps": [{"tiebreaker": "head-to-head", "applied": true,
--                   "teams": [{"teamId": ..., "place": 1, "value": null,
--                              "record": {"wins": 1, "losses": 0, "ties": 0}}, ...]},
--                  ...]}
--     The same on every row of the set. Core reads it and writes the note under the
--     table from it; a document it cannot read gives the note it gave before.
--
-- Nothing is moved: a row saved before this migration has no document, and the page
-- writes its note as before until the season's standings are worked out again (by the
-- next result decided or reopened in it, or the standings module's rebuild command),
-- which fills it.
--
-- The column is calculated like the rest of the row: never typed by hand (A-12, S-9).
-- A document is at most 256 KiB, room for several hundred level teams; only a team
-- with a tiebreaker reason can have one.
--
-- A column of public.standings_rows, so behind its league's fence already (0010). Nothing
-- is dropped (T-183).

alter table public.standings_rows add column level jsonb;

alter table public.standings_rows add constraint standings_rows_level_document check (
  level is null or public.is_versioned_document(level)
);

alter table public.standings_rows add constraint standings_rows_level_size check (
  level is null or octet_length(level::text) <= 262144
);

-- A team its record alone placed is level with nobody.
alter table public.standings_rows add constraint standings_rows_level_needs_reason check (
  level is null or decided_by is not null
);

comment on column public.standings_rows.level is
  'How the teams level with this one were ordered (step 2.198, S-74): the level teams and each tiebreaker tried on them, a versioned document written by the standings rebuild. Empty for a team level with nobody, and on rows saved before 0022 until the season is worked out again.';
