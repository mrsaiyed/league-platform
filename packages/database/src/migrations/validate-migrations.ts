// The rules every list of migrations must meet before any of it runs. The loader
// checks them on what it reads, and the runner checks them again on whatever it
// is given, so neither can be handed a list that is out of order or has a gap.
import { migrationChecksum } from './checksum.ts';
import type { Migration, MigrationError } from './migration-types.ts';
import { topLevelStatements } from './sql-statements.ts';

/** Four digits, an underscore, then a lower-case snake_case name. */
export const migrationFileName = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

// Each file already runs in one transaction; its own BEGIN or COMMIT would end that
// early and leave the file half applied and unrecorded.
const transactionControl =
  /^(?:BEGIN|COMMIT|ROLLBACK|END|ABORT|SAVEPOINT|RELEASE|START\s+TRANSACTION|PREPARE\s+TRANSACTION)\b/i;

/** The first problem with `migrations`, or undefined when there is none. */
export function validateMigrations(migrations: readonly Migration[]): MigrationError | undefined {
  for (const [index, migration] of migrations.entries()) {
    const { name, version } = migration;
    const match = migrationFileName.exec(name);
    if (!match || Number(match[1]) !== version) {
      return {
        code: 'bad_file_name',
        file: name,
        message: `${name} is not named NNNN_lower_snake_name.sql (for example 0002_leagues.sql), or its number is not ${version}.`,
      };
    }
    if (migrationChecksum(migration.sql) !== migration.checksum) {
      return {
        code: 'bad_checksum',
        file: name,
        message: `${name} was given with a checksum that does not match its text.`,
      };
    }
    const statements = topLevelStatements(migration.sql);
    if (!statements.length) {
      return {
        code: 'empty_file',
        file: name,
        message: `${name} has nothing to run (it is empty or only comments).`,
      };
    }
    const control = statements.find((s) => transactionControl.test(s.code));
    if (control) {
      const word = control.code.split(/\s+/)[0]?.toUpperCase() ?? '';
      return {
        code: 'transaction_control',
        file: name,
        message:
          `${name} line ${control.line} has ${word}. Each migration already runs in one ` +
          'transaction, so it may not begin, end or split one: remove it.',
      };
    }
    const previous = migrations[index - 1];
    if (previous && previous.version === version) {
      return {
        code: 'duplicate_version',
        file: name,
        message: `${previous.name} and ${name} have the same number. Renumber the newer one.`,
      };
    }
    if (version !== index + 1) {
      return {
        code: 'version_gap',
        file: name,
        message:
          `${name} should be number ${String(index + 1).padStart(4, '0')}: migrations run ` +
          '0001, 0002, ... in order, without a gap.',
      };
    }
  }
  return undefined;
}
