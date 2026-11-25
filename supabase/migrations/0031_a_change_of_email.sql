-- 0031: a change of email (step 2.128, T-73, T-455, T-458).
--
-- A waiting change of email is ours, never the sign-in service's (T-455): the service is
-- told nothing until our own check of the code has passed, and then only to set the
-- address of that one account. So:
--
-- 1. sign_in.email_changes keeps at most one waiting change per sign-in user: the new
--    address, the code only as its hash, its attempts left and its end. Asking again
--    replaces the row, so an older code is dead. It is the sign-in store's, as every
--    table of schema sign_in (0012): reached by sign_in_store only, one policy, and gone
--    with the user (on delete cascade, so erase_account needs no change).
-- 2. Our own account's address follows a confirmed change through two owner-run
--    functions, for the account set in the transaction only (record 008's rules, the
--    reviewed list in packages/database/src/schema/app-role.test.ts). They are the only
--    way accounts.email changes (T-256): app_user still has no update of that column.
--    Each takes the address's lock, the same one account_for_sign_in takes (0012), so a
--    first sign-in and a change of email to one address cannot pass each other.
--
-- Accounts made before this step have no waiting change; nothing reads one that is not there.

create table sign_in.email_changes (
  user_id text primary key references sign_in.users (user_id) on delete cascade,
  new_email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts_left integer not null,
  constraint email_changes_new_email_length check (length(new_email) between 1 and 320),
  constraint email_changes_code_hash_length check (length(code_hash) between 1 and 200),
  constraint email_changes_attempts_left check (attempts_left >= 0)
);

comment on table sign_in.email_changes is
  'A waiting change of email, one per sign-in user, the code only hashed (T-455).';

grant select, insert, update, delete on sign_in.email_changes to sign_in_store;
alter table sign_in.email_changes enable row level security;
alter table sign_in.email_changes force row level security;
create policy email_changes_store_only on sign_in.email_changes
  to sign_in_store using (true) with check (true);

-- Supabase's API roles get nothing here either (T-64), as 0012 does for every sign_in table.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on sign_in.email_changes from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on sign_in.email_changes from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on sign_in.email_changes from service_role;
  end if;
end
$$;

-- Whether no other account holds the address (compared by lower(), as accounts_email_key
-- is). Answers for the account set only, and never says whose the address is: a yes or a
-- no, which the web app answers the person with in exactly the same words either way.
create or replace function public.email_free_for_own_account(given_email text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  me uuid;
begin
  perform public.require_view_of_every_league();
  me := public.current_account_id();
  if me is null then
    raise exception 'no account is set for this transaction'
      using errcode = 'insufficient_privilege';
  end if;
  if given_email is null then
    raise exception 'an email is needed' using errcode = 'null_value_not_allowed';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account_email:' || lower(given_email), 0));
  return not exists (
    select 1 from public.accounts a where lower(a.email) = lower(given_email) and a.id <> me
  );
end
$$;

comment on function public.email_free_for_own_account(text) is
  'Whether no account but the one set holds the address (T-458). A yes or a no, never whose.';

-- Moves the address of the account set, once the sign-in service has confirmed the change
-- (T-73): 'changed', or 'taken' (another account holds it; nothing changes). An address on
-- .invalid, or one the accounts' email format refuses, is refused as account_for_sign_in
-- refuses it.
create or replace function public.change_own_email(given_email text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  me uuid;
begin
  perform public.require_view_of_every_league();
  me := public.current_account_id();
  if me is null then
    raise exception 'no account is set for this transaction'
      using errcode = 'insufficient_privilege';
  end if;
  if given_email is null then
    raise exception 'an email is needed' using errcode = 'null_value_not_allowed';
  end if;
  if lower(given_email) like '%.invalid' then
    raise exception 'an address on the .invalid domain cannot be an account''s'
      using errcode = 'check_violation', constraint = 'accounts_email_format';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account_email:' || lower(given_email), 0));
  if exists (
    select 1 from public.accounts a where lower(a.email) = lower(given_email) and a.id <> me
  ) then
    return 'taken';
  end if;
  update public.accounts set email = given_email where id = me;
  if not found then
    raise exception 'the account set for this transaction does not exist'
      using errcode = 'no_data_found';
  end if;
  return 'changed';
end
$$;

comment on function public.change_own_email(text) is
  'Moves the address of the account set after a confirmed change of email (T-73, T-458): changed or taken.';

revoke all on function public.email_free_for_own_account(text) from public;
revoke all on function public.change_own_email(text) from public;
grant execute on function public.email_free_for_own_account(text) to app_user;
grant execute on function public.change_own_email(text) to app_user;
