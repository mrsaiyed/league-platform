-- 0028: who recorded a game's result by hand (step 2.177; P7 §5.5, S-52, S-36).
--
-- Whoever recorded a final score, a box score or a forfeit by hand may reopen it
-- themselves, with a reason, within the league's reopen minutes, as they may a game they
-- ended in the tracker (step 2.120). The game already keeps when it was decided
-- (`finalized_at`, 0009, stamped by the database); this adds who: `finalized_by`, the
-- account that decided it by hand. Empty for a game its tracker ended (its end event
-- names who, 0010), a game decided before 0028, a game not decided, and one decided with
-- no account. Written with every change of a result, as `finalized_at` is, so it never
-- outlives the result it names. Nothing is moved or dropped.

alter table public.games
  add column finalized_by uuid references public.accounts (id);

alter table public.games
  add constraint games_finalized_by_when_decided check (
    finalized_by is null or finalized_at is not null
  );

create index games_finalized_by_lookup on public.games (finalized_by)
  where finalized_by is not null;

comment on column public.games.finalized_by is
  'The account that decided the game by hand (P7 §5.5, S-52): a final score, box score or forfeit typed in, or a score an import carried. Empty when its tracker ended it, before 0028, when not decided, or with no account.';
