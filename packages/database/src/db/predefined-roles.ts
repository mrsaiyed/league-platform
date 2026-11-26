// T-491 (step 2.112): PostgreSQL's predefined roles (their names begin `pg_`) give rights
// that no grant list shows: pg_write_all_data writes every table in every schema, the job
// queue's included, and neither the schema's nor a table's ACL names it. Seen on PGlite: the
// website's login holding it wrote queued jobs, and its start passed. So neither login, the
// website's nor the worker's, may be a member of any of them, at any depth: each named here
// is refused with the reason, and a `pg_` role not named here (a later PostgreSQL's) is
// refused too, until someone reads what it gives. None is let be: neither service needs one.
// The mending is `revoke <role> from <the role that holds it>`.

/** Each predefined role this check knows, and why a login must not hold it. */
export const predefinedRoles: ReadonlyMap<string, string> = new Map([
  ['pg_checkpoint', 'may force a checkpoint at any time'],
  ['pg_create_subscription', 'may copy another server’s rows into this database'],
  ['pg_database_owner', 'holds the database owner’s rights'],
  ['pg_execute_server_program', 'may run programs on the database server, as its owner'],
  ['pg_maintain', 'may lock, vacuum, reindex and refresh every table'],
  ['pg_monitor', 'reads every session’s queries, which may hold a league’s rows'],
  ['pg_read_all_data', 'reads every table in every schema, the job queue’s included'],
  ['pg_read_all_settings', 'reads every setting of the server'],
  ['pg_read_all_stats', 'reads every session’s queries, which may hold a league’s rows'],
  ['pg_read_server_files', 'reads any file on the database server'],
  ['pg_signal_autovacuum_worker', 'may stop the server’s own upkeep'],
  ['pg_signal_backend', 'may cancel or end other sessions'],
  ['pg_stat_scan_tables', 'may lock tables through the monitoring functions'],
  ['pg_use_reserved_connections', 'takes the connections kept back for upkeep'],
  ['pg_write_all_data', 'writes every table in every schema, the job queue’s included'],
  ['pg_write_server_files', 'writes any file on the database server'],
]);

/** A role PostgreSQL itself made: its name begins `pg_`, which no other role may take. */
export const isPredefinedRole = (name: string): boolean => name.startsWith('pg_');

/**
 * The refusal for each predefined role the login reaches, by the way there (`paths`: the
 * login first, the role last). Only the first predefined role on a way is named: revoking
 * it takes away those it holds (pg_monitor holds pg_read_all_stats).
 */
export function predefinedRoleProblems(
  login: string,
  paths: readonly (readonly string[])[],
): string[] {
  return paths
    .filter((path) => path.length > 1 && isPredefinedRole(path.at(-1) ?? ''))
    .filter((path) => !isPredefinedRole(path.at(-2) ?? ''))
    .map((path) => {
      const role = path.at(-1) ?? '';
      const through = path.length > 2 ? ` through ${path.slice(1, -1).join(', then ')}` : '';
      const why =
        predefinedRoles.get(role) ??
        'is a predefined role this check does not know, so what it gives has not been read';
      return (
        `${login} is a member of ${role}${through}, which ${why}, past every grant the ` +
        `check reads (T-491): revoke ${role} from ${path.at(-2) ?? login}`
      );
    });
}
