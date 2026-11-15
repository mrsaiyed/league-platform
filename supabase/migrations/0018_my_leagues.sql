-- 0018: the leagues a signed-in person belongs to (step 2.127, record 066, T-269; P2
-- lines 67, 71 and 141; U-9, U-11).
--
-- The front page and the account page list a person's leagues with their role in each.
-- Every league table is fenced to the one league a transaction is set to (0005, T-61),
-- so no fenced query can answer "which leagues is this account in?". This adds one
-- narrow function that runs as the tables' owner (record 008, T-221), the product's
-- first read across the league fence for an ordinary signed-in person:
--
--   my_leagues(): for the account set for this transaction (current_account_id()) and
--   no other, every league not in the bin in which that account owns the league, holds
--   a role in force (role_grants with no revoked_at), or has a current roster place
--   (roster_entries with no left_on, on a team and a person not in the bin, the person
--   linked to a profile the account reaches through profile_access). One row a league:
--   its id, short name, name and state, whether the account owns it, the roles it holds
--   there (any scope), the roles it holds for the whole league, and whether it is on a
--   roster there. Nothing about anyone else, no counts, and no league the account has
--   no part in.
--
-- It takes no argument: there is no way to ask it about another account. With no
-- account set, or a setting that is not an account id, it returns nothing. Which of
-- these leagues the person may see (U-9: a draft to its staff only, a suspended league
-- to its owner and admins only) is decided by core's myLeagues before any name reaches
-- a page; this function does not decide it, so the rule stays in one place.
--
-- SECURITY DEFINER, written as the account functions of 0012 are: a fixed search_path
-- (pg_catalog, pg_temp), every name schema-qualified, EXECUTE revoked from PUBLIC and
-- granted to app_user only, and revoked from Supabase's API roles. It first calls
-- require_view_of_every_league(): inside a SECURITY DEFINER function current_user is the
-- function's owner, so that check asks whether the owner sees past row-level security.
-- Owned by a fenced role, this function would see no league (none is set) and answer
-- "you belong to no league" for everyone: a wrong answer that looks right. The check
-- makes that a loud refusal instead (record 066).
--
-- Safe to run twice: the function is replaced and the grants are repeated. Nothing is
-- dropped or renamed (T-183).

create or replace function public.my_leagues()
returns table (
  league_id uuid,
  slug text,
  name text,
  status text,
  is_owner boolean,
  roles text[],
  league_wide_roles text[],
  on_roster boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  me uuid;
begin
  perform public.require_view_of_every_league();
  me := public.current_account_id();
  if me is null then
    return;
  end if;
  return query
  with granted as (
    select g.league_id,
           array_agg(distinct g.role order by g.role) as roles,
           coalesce(
             array_agg(distinct g.role order by g.role) filter (where g.scope_type = 'league'),
             '{}'
           ) as league_wide_roles
    from public.role_grants g
    where g.account_id = me and g.revoked_at is null
    group by g.league_id
  ),
  rostered as (
    select distinct r.league_id
    from public.roster_entries r
    join public.people p on p.league_id = r.league_id and p.id = r.person_id
    join public.teams t on t.league_id = r.league_id and t.id = r.team_id
    join public.profile_access pa on pa.profile_id = p.profile_id
    where pa.account_id = me
      and r.left_on is null
      and p.deleted_at is null
      and t.deleted_at is null
  )
  select l.id,
         l.slug,
         l.name,
         l.status,
         l.owner_account_id = me,
         coalesce(granted.roles, '{}'),
         coalesce(granted.league_wide_roles, '{}'),
         rostered.league_id is not null
  from public.leagues l
  left join granted on granted.league_id = l.id
  left join rostered on rostered.league_id = l.id
  where l.deleted_at is null
    and (l.owner_account_id = me or granted.league_id is not null or rostered.league_id is not null)
  order by l.id;
end
$$;

comment on function public.my_leagues() is
  'The leagues the account set for this transaction belongs to (owner, a role in force, or a current roster place), not in the bin: id, short name, name, state, is owner, roles, roles for the whole league, on a roster. No argument; nothing with no account set (step 2.127, record 066). Which of them the person may see is core''s rule (U-9).';

revoke all on function public.my_leagues() from public;
grant execute on function public.my_leagues() to app_user;

-- Supabase's API roles get none of it.
select migration_log.revoke_hosted_api_roles();
