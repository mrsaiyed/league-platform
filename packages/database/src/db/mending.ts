// T-490, step 2.112's review: a printed mending must work as the database's owner runs it,
// and on a hosted database the owner is the only role anyone runs statements as. It is not
// a superuser: it may not act as a role it made (PostgreSQL 16 gives the maker ADMIN only),
// so a grant made by the worker's login, or by queue_owner, is not the owner's to revoke
// and a revoke of it changes nothing. These write the statement the way migration 0031
// does: the owner grants itself the role for that one statement, then takes it back.

/** `statement`, run as `role` (SET ROLE), by an owner that may grant itself `role`. */
export function asRole(role: string, statement: string, databaseOwner: string): string {
  if (role === databaseOwner) return statement;
  return (
    `grant ${role} to current_user with set true; set role ${role}; ${statement}; ` +
    `reset role; revoke ${role} from current_user`
  );
}

/**
 * `statements`, run by the owner holding `role`'s rights for a moment (INHERIT, for a
 * statement that needs the object's owner, and SET, for one that names `role` as the new
 * owner), then taken back.
 */
export function holdingRole(
  role: string,
  statements: readonly string[],
  databaseOwner: string,
): string {
  if (role === databaseOwner) return statements.join('; ');
  return [
    `grant ${role} to current_user with set true, inherit true`,
    ...statements,
    `revoke ${role} from current_user`,
  ].join('; ');
}
