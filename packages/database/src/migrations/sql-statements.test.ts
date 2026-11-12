import { describe, expect, it } from 'vitest';
import { topLevelStatements } from './sql-statements.ts';

const firstWords = (sql: string) =>
  topLevelStatements(sql).map((s) => `${s.line}:${s.code.split(/\s+/)[0]}`);

describe('topLevelStatements', () => {
  it('splits on top-level semicolons and gives each statement its first line', () => {
    expect(firstWords('create table a (id int);\n\n  insert into a values (1);\nselect 1')).toEqual(
      ['1:create', '3:insert', '4:select'],
    );
  });

  it('ignores semicolons and keywords in comments, strings, names and bodies', () => {
    const sql = [
      '-- commit; begin;',
      "/* rollback; /* nested; */ end; */ comment on table a is 'x; commit; y';",
      'create table "odd;name" (id int);',
      "insert into a values (E'it\\'s; commit');",
      'create function f() returns int language plpgsql as $body$ begin commit; return 1; end $body$;',
      "do $$ begin raise notice 'it''s; end'; end $$;",
    ].join('\n');
    expect(firstWords(sql)).toEqual(['2:comment', '3:create', '4:insert', '5:create', '6:do']);
  });

  it('keeps a BEGIN ATOMIC body with its CREATE', () => {
    const sql =
      'create function g() returns int language sql begin atomic select 1; select 2; end;\nselect 3;';
    expect(firstWords(sql)).toEqual(['1:create', '2:select']);
  });

  it('finds nothing in a file of only comments and semicolons', () => {
    expect(topLevelStatements('-- a\n/* b */\n;\n ; ')).toEqual([]);
  });
});
