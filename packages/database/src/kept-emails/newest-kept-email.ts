// The newest email kept on the test copy for one address (step 2.204, record 075 option
// 5), read as the tables' owner: the migration login's own session, which only
// scripts/read-kept-emails.mjs opens (openLeagueMakingTarget's `login`). The app's role
// cannot run it: it has no grant on kept_emails. A platform table, not a league's.
import type { SqlSession } from '../migrations/migration-driver.ts';

export type KeptEmailRead = {
  readonly subject: string;
  readonly text: string;
  readonly keptAt: Date;
};

export async function newestKeptEmail(
  session: SqlSession,
  to: string,
): Promise<KeptEmailRead | null> {
  const { rows } = await session.query<{ subject: string; body_text: string; kept_at: Date }>(
    `select subject, body_text, kept_at from kept_emails.emails
     where to_address = lower(btrim($1)) order by id desc limit 1`,
    [to],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return { subject: row.subject, text: row.body_text, keptAt: new Date(row.kept_at) };
}
