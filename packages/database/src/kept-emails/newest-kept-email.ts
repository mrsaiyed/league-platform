// The newest email kept on the test copy for one address (step 2.204, record 075 option
// 5), read as the tables' owner: the migration login's own session, which only
// scripts/read-kept-emails.mjs opens (openLeagueMakingTarget's `login`). The app's role
// cannot run it: it has no grant on kept_emails. A platform table, not a league's. The
// address is looked up in the form it is kept in (kept_emails.kept_form, migration 0023).
import type { SqlSession } from '../migrations/migration-driver.ts';

export type KeptEmailRead = {
  /** What it carries: a code to type or a link to follow. */
  readonly kind: 'code' | 'link';
  readonly subject: string;
  readonly text: string;
  readonly keptAt: Date;
};

export async function newestKeptEmail(
  session: SqlSession,
  to: string,
): Promise<KeptEmailRead | null> {
  const { rows } = await session.query<{
    kind: 'code' | 'link';
    subject: string;
    body_text: string;
    kept_at: Date;
  }>(
    `select kind, subject, body_text, kept_at from kept_emails.emails
     where to_address = kept_emails.kept_form($1) order by id desc limit 1`,
    [to],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    kind: row.kind,
    subject: row.subject,
    text: row.body_text,
    keptAt: new Date(row.kept_at),
  };
}
