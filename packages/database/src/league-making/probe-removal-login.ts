// What the migration login must also be able to do to remove a league made by mistake
// (step 2.150, record 063), asked with probeLogins (the maker's own probes) before
// the plan is shown and again before anything is removed. Anything not there yet (a
// database without migration 0017) is left to the migration check that follows.
import type { SqlSession } from '../migrations/index.ts';

/** True when the migration login may run the removal and write the platform log. */
export async function migrationLoginMayRemove(session: SqlSession): Promise<boolean> {
  const { rows } = await session.query<{ may: boolean | null }>(
    `select case
       when to_regprocedure('public.remove_draft_league(uuid,text,uuid)') is null
         or to_regprocedure('public.league_removal_problems(uuid)') is null
         or to_regprocedure('public.league_rows(uuid)') is null
         or not exists (select 1 from pg_catalog.pg_namespace where nspname = 'platform')
         then true
       when not has_schema_privilege('platform', 'usage') then false
       when to_regclass('platform.activity_log') is null then true
       -- Each on its own: a list of privileges answers true when ANY one is held.
       else has_function_privilege('public.remove_draft_league(uuid,text,uuid)', 'execute')
         and has_function_privilege('public.league_removal_problems(uuid)', 'execute')
         and has_function_privilege('public.league_rows(uuid)', 'execute')
         and has_table_privilege('platform.activity_log', 'select')
         and has_table_privilege('platform.activity_log', 'insert')
         and has_table_privilege('public.leagues', 'delete')
         and has_table_privilege('public.programs', 'delete')
         and has_table_privilege('public.seasons', 'delete')
         and has_table_privilege('public.activity_log', 'delete') end as may`,
  );
  return rows[0]?.may === true;
}
