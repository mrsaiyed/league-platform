// T-482: the schemas an outside library owns, not the migrations. The start-up guard's
// check of relations no migration made (T-476) lets a relation in one of these be, when it
// has no league column and no view in it reads a league table; one that does is still
// refused, by revoking the login's reading of it, and the guard never tells anyone to drop
// a table here. Adding a line here is a review, as in reviewed-definers.ts.

/** The schema's name, and the reviewed reason its relations are let be. */
export const librarySchemas: ReadonlyMap<string, string> = new Map([
  [
    'pgboss',
    'the job queue library pg-boss makes and upgrades its own tables here when the worker starts (T-257, record 053); they hold job ids and their data, not a league column, and the release makes the schema; step 2.112 gives the queue its own owner and takes the login’s reading of it away; this entry goes then',
  ],
]);
