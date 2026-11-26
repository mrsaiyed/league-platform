// T-482: the schemas an outside library owns, not the migrations. The start-up guard's
// check of relations no migration made (T-476) lets only an ordinary table without a league
// column be in one of these, for every login; any view, materialized view or foreign table
// here is refused whatever its columns, by revoking the login's reading of it, and the
// guard never tells anyone to drop a table here. Adding a line here is a review, as in
// reviewed-definers.ts.
//
// None today. The job queue's schema `pgboss` was the one entry until step 2.112 (T-490)
// gave the queue its own owner: the website's login can no longer read it, and its rule is
// now the worker's alone (FenceRoles.queueSchema, given by checkWorkerLoginRole).

/** The schema's name, and the reviewed reason its relations are let be. */
export const librarySchemas: ReadonlyMap<string, string> = new Map<string, string>([]);
