-- 0029: a correction keeps the box score it replaces (step 2.229; A-5, S-27, T-220, T-365).
--
-- A reopen of a game entered by hand now keeps the game's box score lines in its
-- correction's `before` (ids and numbers only, never a name), so the save after it may
-- remove them (a final score only, a forfeit: S-27) or replace them, and "put the sheet
-- back as it was" restores them. The lines kept are a document, never rows of
-- player_game_stats, so they count in no total. A sheet is bigger than the 16 KB the
-- documents were given in 0009: the box score grid saves up to 200 lines of up to 40
-- counts each (about 450 KB at most), so `before` may now be up to 4 MB. `after` keeps
-- the result only and stays at 16 KB. A correction already written is not changed:
-- raising a limit passes every row it held. The guard of 0011 (a decided game's result
-- changes only alongside a correction written by the same transaction) is unchanged:
-- the put back writes its own correction.

alter table public.game_corrections
  drop constraint game_corrections_before_document;

alter table public.game_corrections
  add constraint game_corrections_before_document check (
    public.is_versioned_document(before) and octet_length(before::text) <= 4194304
  );

comment on column public.game_corrections.before is
  'The result before the correction, ids and numbers only (T-220); a reopen of a game entered by hand also keeps its box score lines under "sheet" (step 2.229, T-365), counted nowhere.';
