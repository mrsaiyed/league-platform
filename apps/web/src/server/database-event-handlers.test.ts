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

/** Every area of the ports that runs commands (has `deps`), by its name. */
function portsWithCommands(): { moved: Map<string, AnyDeps>; notMoved: string[] } {
  const moved = new Map<string, AnyDeps>();
  const notMoved: string[] = [];
  for (const [name, area] of Object.entries(ports)) {
    if (typeof area !== 'object' || area === null) continue;
    let deps: unknown;
    try {
      deps = (area as { deps?: unknown }).deps;
    } catch (error) {
      // An area not on the database yet refuses the moment it is reached.
      if (!(error instanceof NotOnTheDatabaseYet)) throw error;
      notMoved.push(name);
      continue;
    }
    if (typeof deps === 'object' && deps !== null && 'events' in deps) {
      moved.set(name, deps as AnyDeps);
    }
  }
  return { moved, notMoved };
}

describe('core’s event handlers on the database', () => {
  it('every database port that runs commands is given them, from the one place', () => {
    const { moved, notMoved } = portsWithCommands();
    // Today's: a port that runs commands and is not here is still a stand-in's refusal.
    expect([...moved.keys()].sort()).toEqual([
      'adminPeople',
      'adminSettings',
      'adminTeams',
      'games',
      'scheduleAdmin',
      'tracker',
    ]);
    expect(notMoved).toEqual(['fixtureImport']);
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
