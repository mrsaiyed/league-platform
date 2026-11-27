-- 0033: a known device's code and rows (step 2.234, T-504, T-510).
--
-- 1. sign_in.codes says which known device asked for the address's code, if one did
--    (T-510): while that code works, an unknown device's ask does not replace it and
--    another's typing does not spend its attempts. Codes asked before this step were
--    asked by no known device (null).
-- 2. erase_account also removes the rows a known device's tries left under the address
--    ('known-device <id> <address>'), so no row in the sign-in store holds an erased
--    address (T-504, T-52). Otherwise as in 0012; its grants are unchanged.

alter table sign_in.codes add column known_device text;
alter table sign_in.codes add constraint codes_known_device_length
  check (known_device is null or length(known_device) between 16 and 128);

comment on column sign_in.codes.known_device is
  'The known device that asked for the code (T-510), or null: only its own typing spends it, and an unknown device''s ask does not replace it while it works.';

-- Erasing an account (T-52, T-220, record 007): only the account set for this
-- transaction, as its own request. Its row stays, emptied in place, so history keeps
-- valid links. Its profiles go: its own and those it acts for as a guardian that no
-- other account reaches; one another account still reaches stays with that account.
-- Its grants in every league end now; its game assignments and the scoring sessions
-- it holds go; the invitations it accepted keep its placeholder address instead of
-- the one they were sent to. Its rows in the sign-in store go, the address's code
-- requests, guesses and locks with them, a known device's for the address too (T-504,
-- 0033). It refuses,
-- changing nothing, while the account owns a league (the league would have no one
-- to run it) or while one of its profiles is still linked to a league's person:
-- each league treats its person first, inside its own fence (T-52, T-63). Ending the
-- person's user at the sign-in service is the caller's. It answers 'erased',
-- 'owns-a-league' or 'profile-in-a-league', so a refusal leaves the transaction
-- usable.
create or replace function public.erase_account() returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  me uuid;
  link text;
  address text;
  going uuid[];
begin
  perform public.require_view_of_every_league();
  me := public.current_account_id();
  if me is null then
    raise exception 'no account is set for this transaction'
      using errcode = 'insufficient_privilege';
  end if;
  select a.sign_in_id, a.email into link, address from public.accounts a where a.id = me for update;
  if not found then
    raise exception 'the account set for this transaction does not exist'
      using errcode = 'foreign_key_violation';
  end if;
  if exists (select 1 from public.leagues l where l.owner_account_id = me) then
    return 'owns-a-league';
  end if;

  select coalesce(array_agg(mine.profile_id), '{}') into going
  from public.profile_access mine
  where mine.account_id = me
    and not exists (
      select 1 from public.profile_access other
      where other.profile_id = mine.profile_id and other.account_id <> me
    );
  if exists (select 1 from public.people p where p.profile_id = any (going)) then
    return 'profile-in-a-league';
  end if;

  delete from public.profile_access pa where pa.account_id = me;
  delete from public.profiles pr where pr.id = any (going);

  -- A grant made by a transaction that began after this one is dated later than
  -- now(); it still ends no earlier than it began (role_grants_revoked_after_granted).
  update public.role_grants g
  set revoked_at = greatest(now(), g.created_at), revoked_by_account_id = me
  where g.account_id = me and g.revoked_at is null;
  delete from public.game_assignments ga where ga.account_id = me;
  delete from public.scoring_sessions ss where ss.account_id = me;

  if link is not null then
    delete from sign_in.sessions s where s.user_id = link;
    delete from sign_in.devices d where d.user_id = link;
    delete from sign_in.users u where u.user_id = link;
    delete from sign_in.proofs p where p.user_id = link;
  end if;
  delete from sign_in.codes c where lower(c.email) = lower(address);
  delete from sign_in.proofs p where lower(p.email) = lower(address);
  -- The address's own counts, and a known device's: 'known-device <id> <address>'.
  delete from sign_in.code_requests r
  where r.scope = 'email'
    and (lower(r.subject) = lower(address)
      or (left(r.subject, 13) = 'known-device '
        and right(lower(r.subject), length(address) + 1) = ' ' || lower(address)));
  delete from sign_in.guesses g
  where g.scope = 'email'
    and (lower(g.subject) = lower(address)
      or (left(g.subject, 13) = 'known-device '
        and right(lower(g.subject), length(address) + 1) = ' ' || lower(address)));
  delete from sign_in.guess_locks l
  where l.scope = 'email'
    and (lower(l.subject) = lower(address)
      or (left(l.subject, 13) = 'known-device '
        and right(lower(l.subject), length(address) + 1) = ' ' || lower(address)));

  update public.accounts a
  set email = me::text || '@erased.invalid',
      display_name = null,
      phone = null,
      last_seen_at = null,
      sign_in_id = null
  where a.id = me;
  -- After the account row, which check_invitation_email_fixed reads.
  update public.invitations i
  set email = me::text || '@erased.invalid'
  where i.accepted_by_account_id = me;
  return 'erased';
end
$$;

comment on function public.erase_account() is
  'Erases the account set for this transaction, at its own request: the row emptied in place, its profiles, grants, game assignments, scoring sessions and sign-in rows gone, its accepted invitations'' email emptied (record 052, T-52, T-220).';
