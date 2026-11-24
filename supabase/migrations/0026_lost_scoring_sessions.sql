-- 0026: what the server keeps of a scoring session another took the game from (step
-- 2.148, fix round; S-43, T-335). (Becomes 0027 if another lane's 0026 lands first.)
--
-- "Send these plays" lets a scorekeeper whose device lost the game send the plays it
-- kept, when nothing was recorded since they were made. The server must not believe
-- the device about where they were made: it keeps it itself.
--
-- `heard_seq`: the game's sequence when the server last answered this session while it
-- held the game (when it began, then every batch it answered to it). `lost_at`: when
-- the game was taken from it, by a takeover or by a lapse given away; the row is kept
-- then, holding nothing (only a row with no `lost_at` is the game's session), so the
-- server still knows whose it was and where it was last heard. `sent_seq`: the game's
-- sequence after the last batch of its kept plays the server took, so a long list sent
-- in several batches does not count its own earlier batches as "something recorded".
-- A session that ends any other way (released, a game marked not started) still goes.
--
-- Nothing is moved or dropped but the one-per-game rule, which now holds for the rows
-- that hold a game.

alter table public.scoring_sessions
  add column heard_seq integer not null default 0,
  add column lost_at timestamptz,
  add column sent_seq integer,
  add constraint scoring_sessions_heard_seq_not_negative check (heard_seq >= 0),
  add constraint scoring_sessions_sent_only_when_lost check (
    sent_seq is null or (lost_at is not null and sent_seq >= heard_seq)
  );

alter table public.scoring_sessions drop constraint scoring_sessions_one_per_game;

create unique index scoring_sessions_one_per_game on public.scoring_sessions (league_id, game_id)
  where lost_at is null;

comment on column public.scoring_sessions.heard_seq is
  'The game''s sequence when the server last answered this session while it held the game: when it began, then each batch (T-335).';
comment on column public.scoring_sessions.lost_at is
  'When the game was taken from this session (a takeover, or a lapse given away); empty while it holds the game (T-335).';
comment on column public.scoring_sessions.sent_seq is
  'The game''s sequence after the last batch of this lost session''s kept plays the server took ("Send these plays", T-335).';
