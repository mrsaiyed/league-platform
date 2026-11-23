// Every database port's commands are given core's event handlers, from one place (step
// 2.93's last part; the chief of quality's trap of 2026-11-16: part 4's ports gave theirs
// an empty list, where the made-up world gives every command core's handlers). Three ways:
// every port the app is given that runs commands is walked, so a port added later is
// covered without being named here; each one's transaction is opened and must hold the
// stores the handlers use; and every database port's source is read, so a list written by
// hand (an empty one above all) fails even in a port no walk reaches.
import { eventHandlers } from '@srleagues/core';
import * as database from '@srleagues/database';
import { createLocalBotCheck, type SignInService } from '@srleagues/providers';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coreEventHandlers, isCoreEventHandlers } from './database-event-handlers.ts';
import { databasePorts, NotOnTheDatabaseYet } from './database-ports.ts';
import type { WebPorts } from './ports.ts';
import type { SignInMail } from './sign-in/sign-in-mail.ts';

let made: database.MadeUpDatabase;
let db: database.DatabaseHandle;
let ports: WebPorts;

beforeAll(async () => {
  made = await database.madeUpDatabase();
  db = database.createDatabase(made.source);
  ports = databasePorts({
    database,
    db,
    signIn: {} as SignInService,
    signInMail: {} as SignInMail,
    botCheck: createLocalBotCheck({ appEnv: 'test' }),
    log: () => {},
    warn: () => {},
  });
}, 120_000);

afterAll(async () => {
  await db.close();
  await made.close();
});

type AnyDeps = {
  readonly events: Parameters<typeof isCoreEventHandlers>[0];
  readonly transaction: <T>(
    context: { leagueId: string; accountId: string | null; requestId: string },
    work: (tx: Record<string, unknown>) => Promise<T>,
  ) => Promise<T>;
};

/** A command's dependencies: a transaction to run in and the events it hands on. */
const isCommandDeps = (value: unknown): value is AnyDeps =>
  typeof value === 'object' && value !== null && 'events' in value && 'transaction' in value;

/**
 * Every area of the ports that runs commands, by its name: an area's `deps`, and any other
 * command dependencies it holds (`adminPeople.putBack`, the bin's), named `area.field`.
 * `withoutCommands` is every other area that is an object, so a port added later is either
 * walked or must be named below with the reason it runs no command.
 */
function portsWithCommands(): {
  moved: Map<string, AnyDeps>;
  notMoved: string[];
  withoutCommands: string[];
} {
  const moved = new Map<string, AnyDeps>();
  const notMoved: string[] = [];
  const withoutCommands: string[] = [];
  for (const [name, area] of Object.entries(ports)) {
    if (typeof area !== 'object' || area === null) continue;
    let fields: [string, unknown][];
    try {
      void (area as { deps?: unknown }).deps;
      fields = Object.entries(area as Record<string, unknown>);
    } catch (error) {
      // An area not on the database yet refuses the moment it is reached.
      if (!(error instanceof NotOnTheDatabaseYet)) throw error;
      notMoved.push(name);
      continue;
    }
    let found = false;
    for (const [field, value] of fields) {
      if (!isCommandDeps(value)) continue;
      moved.set(field === 'deps' ? name : `${name}.${field}`, value);
      found = true;
    }
    if (!found) withoutCommands.push(name);
  }
  return { moved, notMoved, withoutCommands };
}

/**
 * The areas that are objects and run no command, each with the reason: none of them can
 * raise an event, so none needs core's handlers. A new area lands here only with its own
 * reason, and one that starts running commands moves to the list above.
 */
const runNoCommand: Record<string, string> = {
  botCheck: 'asks the bot-check service about one form; it reads and writes nothing of ours',
  publicSchedule: 'the public schedule pages only read published games',
  publicStats: 'the public stats pages only read the published tables and leaders',
  publicTeams: 'the public team pages only read published teams and rosters',
  signIn: 'the sign-in service is outside: our account is linked by accessOf’s own query',
  signInMail: 'sends the sign-in emails; it reads and writes no table',
};

describe('core’s event handlers on the database', () => {
  it('every database port that runs commands is given them, from the one place', () => {
    const { moved, notMoved, withoutCommands } = portsWithCommands();
    // Today's: a port that runs commands and is not here is still a stand-in's refusal.
    expect([...moved.keys()].sort()).toEqual([
      // The Admins page and the accept page (step 2.97): the access module's own commands.
      'adminAccess',
      'adminPeople',
      'adminPeople.putBack',
      'adminSettings',
      // Season settings' own commands (step 2.47) save the season's rules and can raise
      // the events a standings change raises, so they take core's handlers too.
      'adminSettings.seasons',
      'adminTeams',
      'games',
      'scheduleAdmin',
      'tracker',
    ]);
    expect(notMoved).toEqual(['fixtureImport']);
    expect(withoutCommands.sort()).toEqual(Object.keys(runNoCommand).sort());
    for (const [name, deps] of moved) {
      expect(deps.events.length, name).toBeGreaterThan(0);
      expect(isCoreEventHandlers(deps.events), name).toBe(true);
      expect(
        deps.events.map((handler) => handler.type),
        name,
      ).toEqual(eventHandlers.map((handler) => handler.type));
    }
  });

  it('each of those ports’ transactions holds every store the handlers use', async () => {
    const league = made.leagues[0];
    if (league === undefined) throw new Error('the made-up database has no league');
    const context = { leagueId: league.leagueId, accountId: null, requestId: 'handlers-test' };
    for (const [name, deps] of portsWithCommands().moved) {
      const stores = await deps.transaction(context, async (tx) =>
        ['standings', 'games', 'access', 'activity'].filter((store) => tx[store] == null),
      );
      expect(stores, `${name} lacks`).toEqual([]);
    }
  });

  it('a list made anywhere else, an empty one too, is not taken for theirs', () => {
    expect(isCoreEventHandlers([])).toBe(false);
    expect(isCoreEventHandlers(eventHandlers)).toBe(false);
    expect(isCoreEventHandlers(coreEventHandlers())).toBe(true);
  });

  it('a handler given a transaction without the stores it uses throws, never skips', async () => {
    const [handler] = coreEventHandlers<{ jobs: never }>();
    if (handler === undefined) throw new Error('core has no event handler');
    const event = { type: handler.type, leagueId: 'any' };
    await expect(handler.handle(event, { jobs: undefined as never })).rejects.toThrow(
      /without the stores of core’s event handlers/,
    );
  });

  it('every database port’s source takes its events from the one place, never a list of its own', () => {
    const folder = path.dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(folder).filter(
      (file) =>
        /^database-.*\.ts$/.test(file) &&
        !/\.(?:test|test-helper)\.ts$/.test(file) &&
        file !== 'database-event-handlers.ts',
    );
    expect(sources.length).toBeGreaterThan(5);
    const handed: string[] = [];
    for (const file of sources) {
      const text = readFileSync(path.join(folder, file), 'utf8');
      for (const match of text.matchAll(/\bevents\s*:\s*([^,\n]*)/g)) {
        const given = match[1]?.trim() ?? '';
        handed.push(file);
        expect(given, `${file}: events: ${given}`).toMatch(/^coreEventHandlers<\w+>\(\)$/);
      }
      expect(text, file).not.toMatch(/\beventHandlers\b/);
    }
    // The five that build a command transaction: the access reads, settings, teams, the
    // games (the tracker shares them) and the schedule.
    expect(new Set(handed)).toEqual(
      new Set([
        'database-admin-settings.ts',
        'database-admin-teams.ts',
        'database-games.ts',
        'database-ports.ts',
        'database-schedule-admin.ts',
      ]),
    );
  });
});
