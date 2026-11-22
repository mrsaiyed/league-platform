// The release command's database part (scripts/release-run.mjs, step 2.95, record 101)
// on the throw-away PostgreSQL (step 2.202), through the migration login ALONE, its
// certificate checked against the made-up authority, as `npm run release -- --hosted`
// runs it at a person's terminal (the person's answer is given here):
//   - the harness applied every change with the same runner, so a release applies none
//     and names the commit, and so does the next one (an empty database is proved on
//     PGlite in packages/database: the tables' owner here may not make a database);
//   - a wrong answer to the question applies nothing and names no commit;
//   - a database holding the tracker's own schema is refused, whatever the address said;
//   - a wrong password says which of the start-up's sentences it is and never repeats
//     the password, the address or the certificate. Made-up data only (T-201).
import { describe, expect, it } from 'vitest';
import { runRelease } from '../../scripts/release-run.mjs';
import { ca, ownerSession, server } from './server.ts';

const database = new URL(server.ownerUrl).pathname.slice(1);
const commitId = '0123456789abcdef0123456789abcdef01234567';

type Ran = { code: number; out: string[]; err: string[]; asked: string[] };

async function release(url: string, answer: string = database): Promise<Ran> {
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const code = await runRelease({
    source: { kind: 'migration-login', migration: { url, ssl: 'verify', ca } },
    commit: () => ({ ok: true, id: commitId }),
    ask: async (question: string) => {
      asked.push(question);
      return answer;
    },
    say: (line: string) => out.push(line),
    warn: (line: string) => err.push(line),
  });
  return { code, out, err, asked };
}

describe('the release command on a real PostgreSQL', () => {
  it('shows where it connected, applies nothing new, names the commit, twice', async () => {
    for (let run = 0; run < 2; run += 1) {
      const ran = await release(server.ownerUrl);
      expect(ran.err).toEqual([]);
      expect(ran.code).toBe(0);
      expect(ran.asked).toHaveLength(1);
      expect(ran.out.join('\n')).toContain(`the database ${database} on `);
      expect(ran.out).toContain('Applied now: none.');
      expect(ran.out.at(-1)).toBe(
        `The database is ready. Deploy commit ${commitId} now, by hand on the host.`,
      );
    }
  });

  it('a wrong answer applies nothing and names no commit', async () => {
    const ran = await release(server.ownerUrl, 'yes');
    expect(ran.code).toBe(1);
    expect(ran.out.join('\n')).not.toContain('Deploy commit');
    expect(ran.out.at(-1)).toBe('Nothing was applied. Do not deploy.');
  });

  it('refuses a database that holds the tracker’s own schema', async () => {
    const owner = await ownerSession();
    try {
      await owner.query('create schema live_stats');
      const ran = await release(server.ownerUrl);
      expect(ran.code).toBe(1);
      expect(ran.asked).toEqual([]);
      expect(ran.err.join('\n')).toContain('the live_stats schema');
    } finally {
      await owner.query('drop schema if exists live_stats');
      await owner.close();
    }
  });

  it('a wrong password is the login sentence, and nothing secret is printed', async () => {
    const address = new URL(server.ownerUrl);
    const password = 'made-up-wrong-pw-5d1e';
    address.password = password;
    const ran = await release(address.toString());
    expect(ran.code).toBe(1);
    const said = [...ran.out, ...ran.err].join('\n');
    expect(said).toContain(
      'the database refused the password or login: check the migration login and its password in MIGRATION_DATABASE_URL',
    );
    expect(said).not.toContain(password);
    expect(said).not.toContain(address.host);
    expect(said).not.toContain(ca.split('\n')[1] ?? 'no line');
  });
});
