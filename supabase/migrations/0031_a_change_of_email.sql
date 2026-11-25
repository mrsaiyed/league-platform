-- 0031: a change of email (step 2.128, T-73, T-455, T-458).
--
-- The pending change itself is the sign-in service's (T-455): Supabase keeps the pending
-- address on its user, and the adapter's store keeps the code's attempts under the new
-- address as it does every code. So:
--
-- 1. sign_in.codes admits a fourth kind of check, email_change (Supabase's verify type for
--    a change of email). Every other condition of the table stays as 0012 made it.
-- 2. Our own account's address follows a confirmed change through two owner-run
--    functions, for the account set in the transaction only (record 008's rules, the
--    reviewed list in packages/database/src/schema/app-role.test.ts). They are the only
--    way accounts.email changes (T-256): app_user still has no update of that column.
--    Each takes the address's lock, the same one account_for_sign_in takes (0012), so a
--    first sign-in and a change of email to one address cannot pass each other.
--
-- Accounts made before this step have no pending change; nothing reads one that is not there.

alter table sign_in.codes drop constraint codes_verify_type;
alter table sign_in.codes add constraint codes_verify_type
  check (verify_type in ('signup', 'magiclink', 'recovery', 'email_change'));

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
