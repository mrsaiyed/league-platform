-- 0030: a season's rules document is not work done in a league (step 2.245, T-430).
--
-- Since step 2.245 a league made by the internal tool is given its game rules (the
-- clock and the mercy rule, S-106) in the one statement that makes its first season, so
-- that season holds a rules document from the start. 0020's guard refused every such
-- league ('season-changed'), because it also asked that the season's rules be the
-- column's starting document. This migration takes out ONLY that condition. The version
-- test stays exactly as it was (a just-made season is version 2 and current: made, then
-- made the current one), so a league whose admin later changed the season's rules, or
-- anything else of it, still moves the version and is still refused. Every other
-- condition of the guard is copied unchanged from 0020. A league made before this step
-- (its season with the starting document) passes exactly as before.

create or replace function public.league_removal_problems(wanted uuid) returns text[]
language plpgsql
stable
set search_path = pg_catalog, pg_temp
as $$
declare
  found_league public.leagues;
  problems text[] := '{}';
  maker uuid;
  counted record;
begin
  perform public.require_view_of_every_league();
  select * into found_league from public.leagues l where l.id = wanted;
  if not found then
    return array['not-found'];
  end if;

  -- The league itself: in draft, not in the bin, never changed since it was made
  -- (every change moves `version`, 0002), and with no agreement or wording of its own.
  if found_league.status <> 'draft' then
    problems := problems || ('state:' || found_league.status);
  end if;
  if found_league.deleted_at is not null then
    problems := problems || 'in-bin'::text;
  end if;
  if found_league.version <> 1
     or found_league.agreement is not null
     or found_league.wording <> '{"version": 1}'::jsonb then
    problems := problems || 'league-changed'::text;
  end if;

  -- Its one program: the default one createLeague made, never changed.
  if (select count(*) from public.programs p where p.league_id = wanted) <> 1
     or not exists (
       select 1 from public.programs p
       where p.league_id = wanted and p.is_default and p.deleted_at is null and p.version = 1
     ) then
    problems := problems || 'program-changed'::text;
  end if;

  -- At most one season: in draft, not in the bin, with the statistics it was made
  -- with, and exactly as the maker leaves it: made (its rules, if any, in the same
  -- statement, 0030), then made the current one (version 2 and current). A season
  -- changed in any other way, its rules included, even once, is refused.
  if (select count(*) from public.seasons s where s.league_id = wanted) > 1
     or exists (
       select 1 from public.seasons s
       where s.league_id = wanted
         and (s.status <> 'draft' or s.deleted_at is not null
              or not (s.version = 2 and s.is_current)
              or s.stat_keys <> '{}')
     ) then
    problems := problems || 'season-changed'::text;
  end if;

  -- The activity log: only what the maker writes. One `leagues.create`, at most one
  -- `leagues.create_season`, both by the same account, and nothing else at all.
  select g.actor_account_id into maker
  from public.activity_log g where g.league_id = wanted and g.action = 'leagues.create';
  if (select count(*) from public.activity_log g
      where g.league_id = wanted and g.action = 'leagues.create') <> 1
     or maker is null
     or (select count(*) from public.activity_log g
         where g.league_id = wanted and g.action = 'leagues.create_season') > 1
     or exists (
       select 1 from public.activity_log g
       where g.league_id = wanted
         and (g.action not in ('leagues.create', 'leagues.create_season')
              or g.actor_account_id is distinct from maker)
     ) then
    problems := problems || 'activity'::text;
  end if;

  -- Its site (0020): none, or exactly the one the maker gives a new league with it: a
  -- first release published by the maker, and the site pointing at it, never changed
  -- since (version 1). A second release, or any change to the draft, is refused.
  if (select count(*) from public.site_releases r where r.league_id = wanted) > 1
     or (select count(*) from public.sites s where s.league_id = wanted)
        <> (select count(*) from public.site_releases r where r.league_id = wanted)
     or exists (
       select 1 from public.site_releases r
       where r.league_id = wanted
         and (r.number <> 1 or r.published_by_account_id is distinct from maker)
     )
     or exists (
       select 1 from public.sites s
       where s.league_id = wanted
         and (s.version <> 1
              or s.published_release_id is null
              or not exists (
                select 1 from public.site_releases r
                where r.league_id = wanted and r.id = s.published_release_id
              ))
     ) then
    problems := problems || 'site-changed'::text;
  end if;

  -- Every other table with a league_id column: nothing at all. Grants (even ended
  -- ones), invitations, settings, people, teams, games, jobs, receipts, support
  -- visits, a former short name, anything in the bin, and any table added later.
  for counted in select * from public.league_rows(wanted) loop
    if counted.table_name in (
      'public.programs', 'public.seasons', 'public.activity_log',
      'public.sites', 'public.site_releases'
    ) then
      continue;
    end if;
    if counted.row_count > 0 then
      problems := problems || ('rows:' || counted.table_name || ':' || counted.row_count);
    end if;
  end loop;
  return problems;
end
$$;

revoke all on function public.league_removal_problems(uuid) from public;

comment on function public.league_removal_problems(uuid) is
  'Why a league is not exactly what the internal tool makes (step 2.150; since 0020, step 2.187: no site, or the one site and first release the tool gives it, published by its maker and never changed, else site-changed; since 0030, step 2.245: the rules document of the season is not work done, its version still is): empty when it may be removed. Reads only. Table owner only.';
