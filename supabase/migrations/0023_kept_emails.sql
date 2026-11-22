-- 0023: the test copy's kept emails (step 2.204, record 075 option 5, record 098; T-140,
-- T-201, T4 §10).
--
-- Outside production no email leaves the building (T-140): every email is captured. On
-- the test copy ("staging") the capture was the web server's memory, lost at every
-- restart and readable by nobody, so a new address could not finish signing up there.
-- Here the capture keeps a copy of each email to a made-up address, and the lead reads
-- one code or link with `node scripts/read-kept-emails.mjs --hosted --to <address>`, as
-- the tables' owner, at a terminal, in a session the founder started.
--
--   kept_emails.emails: one row per email kept, newest last (its id): who it was to (in
--     the form the check sees, kept_emails.kept_form), what it carries (`code` or `link`,
--     so the script prints the right one), its subject and its plain words (every email
--     has them, T7 §6; the HTML is never kept). Only an address on a name kept for
--     made-up mail (record 075's list: .test, .example, .invalid, .localhost,
--     example.com, .net and .org), checked here again whatever the app checked. At most
--     the newest 300, none older than 3 days.
--   public.keep_email(to, kind, subject, text): the one way in, owner-run. It refuses an
--     unknown kind (invalid_parameter_value), an email too long for the table
--     (string_data_right_truncation) and an address that is not made up
--     (check_violation), none of these errors carrying a value; adds the row and removes
--     every row past the newest 300 or older than 3 days. It returns nothing.
--
-- Who reaches what. The app's login (app_login, acting as app_user) may run keep_email
-- and nothing else here: it cannot read, change or remove a row, nor use the schema. The
-- tables' owner reads (the script). Supabase's API roles get nothing (T-64). The app
-- calls keep_email only in staging; in production it sends real email (Resend) and its
-- writer refuses to be made (packages/providers, keptEmailSender), so the table stays
-- empty there.
--
-- A platform table, not a league's: no league_id and no league fence, like the sign-in
-- store's (0012). Its rows are made-up addresses and the codes sent to them. Nothing is
-- dropped (T-183).

create schema kept_emails;
revoke all on schema kept_emails from public;

comment on schema kept_emails is
  'The test copy''s kept emails (record 075 option 5, step 2.204). Only the tables'' owner reads it; the app may only add through public.keep_email.';

-- What JavaScript's trim() removes, and its \s matches: tab to carriage return, the space,
-- the no-break space, U+1680, U+2000 to U+200A, the line and paragraph separators, U+202F,
-- U+205F, the full-width space and U+FEFF. The address trimmed of it at both ends.
create function kept_emails.trimmed(value text) returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select regexp_replace(
    value,
    '^[\u0009-\u000d    -     　﻿]+|[\u0009-\u000d    -     　﻿]+$',
    '', 'g'
  )
$$;

revoke all on function kept_emails.trimmed(text) from public;

-- Record 075's list, the same rule as isMadeUpAddress (packages/providers), held to the
-- same answers by one shared list of spellings (made-up-address-cases.json): the address
-- trimmed, no whitespace left inside; the part after its last "@", which must not be its
-- first character, one final dot dropped; A to Z, digits, dots and hyphens only, tested
-- before lowercasing (lowercased A to Z only, whatever the database's locale).
create function kept_emails.is_made_up_address(address text) returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((
    select d ~ '^[A-Za-z0-9.-]+$'
      and (
        n ~ '\.(test|example|invalid|localhost)$'
        or n in ('example.com', 'example.net', 'example.org')
        or n ~ '\.example\.(com|net|org)$'
      )
    from (
      select d, translate(d, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') as n
      from (
        select regexp_replace(substr(w, length(w) - strpos(reverse(w), '@') + 2), '\.$', '') as d
        from (select kept_emails.trimmed(address) as w) as whole
        where w !~ '[\u0009-\u000d    -     　﻿]'
          and strpos(reverse(w), '@') between 1 and length(w) - 1
      ) as found
    ) as domain
  ), false)
$$;

revoke all on function kept_emails.is_made_up_address(text) from public;

-- The form an address is kept and looked up in: the form the check sees, trimmed, one
-- final dot dropped, A to Z in small letters (so `A@X.test.` and `a@x.test` are one).
-- The same as keptAddressOf (packages/providers), which the script gives its --to.
create function kept_emails.kept_form(address text) returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select translate(
    regexp_replace(kept_emails.trimmed(address), '\.$', ''),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'
  )
$$;

revoke all on function kept_emails.kept_form(text) from public;

comment on function kept_emails.is_made_up_address(text) is
  'Whether an address is on a name kept for made-up mail (record 075): the same list as isMadeUpAddress in packages/providers.';

create table kept_emails.emails (
  id bigint generated always as identity primary key,
  kept_at timestamptz not null default now(),
  to_address text not null,
  kind text not null,
  subject text not null,
  body_text text not null,
  constraint emails_to_made_up check (kept_emails.is_made_up_address(to_address)),
  constraint emails_to_kept_form check (to_address = kept_emails.kept_form(to_address)),
  constraint emails_kind check (kind in ('code', 'link')),
  constraint emails_to_size check (length(to_address) <= 320),
  constraint emails_subject_size check (length(subject) <= 1000),
  constraint emails_text_size check (length(body_text) <= 100000)
);

create index emails_by_address on kept_emails.emails (to_address, id desc);

comment on table kept_emails.emails is
  'One email captured on the test copy to a made-up address, the newest 300, none older than 3 days (step 2.204). Written only by public.keep_email; read only by the tables'' owner.';

-- The fence on, with no policy: any role but the owner given a grant here by mistake
-- still sees and changes nothing.
alter table kept_emails.emails enable row level security;
revoke all on table kept_emails.emails from public;

-- The one way in. How many of the newest stay, and for how long: a few days of a test
-- copy's sign-ups and invitations (record 098).
create function public.keep_email(
  given_to text, given_kind text, given_subject text, given_text text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  -- Record 098: how many of the newest stay, and for how many days at most.
  keep_count constant integer := 300;
  keep_days constant integer := 3;
begin
  if given_to is null or given_kind is null or given_subject is null or given_text is null then
    raise exception 'an address, a kind, a subject and the plain words are all needed'
      using errcode = 'null_value_not_allowed';
  end if;
  -- What the email carries, checked here too: a refused row's DETAIL would hold its values.
  if given_kind not in ('code', 'link') then
    raise exception 'a kept email carries a code or a link (record 098)'
      using errcode = 'invalid_parameter_value';
  end if;
  -- The table's size limits, checked before the insert: a refused row would put its
  -- values (a code among them) in the error's DETAIL line, which the server's log keeps.
  -- This error carries no value.
  if length(given_to) > 320 or length(given_subject) > 1000 or length(given_text) > 100000 then
    raise exception 'an email too long to keep (record 098)'
      using errcode = 'string_data_right_truncation';
  end if;
  -- Checked here again, whatever the app checked; the address is not repeated.
  if not kept_emails.is_made_up_address(given_to) then
    raise exception 'only an email to a made-up address is kept (record 075)'
      using errcode = 'check_violation';
  end if;
  insert into kept_emails.emails (to_address, kind, subject, body_text)
  values (kept_emails.kept_form(given_to), given_kind, given_subject, given_text);
  -- Only the newest 300 stay, and none older than 3 days: codes and invitation links do
  -- not wait at rest for newer emails to push them out.
  delete from kept_emails.emails
  where id <= (select e.id from kept_emails.emails e order by e.id desc offset keep_count limit 1)
     or kept_at < now() - make_interval(days => keep_days);
end
$$;

revoke all on function public.keep_email(text, text, text, text) from public;
grant execute on function public.keep_email(text, text, text, text) to app_user;

comment on function public.keep_email(text, text, text, text) is
  'Keeps one email to a made-up address on the test copy, the newest 300 only, none older than 3 days (step 2.204, record 075). The app''s only way into kept_emails: it cannot read, change or remove a row.';

-- Supabase's API roles get nothing here (T-64), where they exist.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema kept_emails from anon;
    revoke all on schema kept_emails from anon;
    revoke all on function public.keep_email(text, text, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema kept_emails from authenticated;
    revoke all on schema kept_emails from authenticated;
    revoke all on function public.keep_email(text, text, text, text) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke all on all tables in schema kept_emails from service_role;
    revoke all on schema kept_emails from service_role;
    revoke all on function public.keep_email(text, text, text, text) from service_role;
  end if;
end
$$;
