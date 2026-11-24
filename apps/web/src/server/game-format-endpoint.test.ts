// GET and PUT …/games/{game}/format (step 2.119; P7 §5.1, S-35, S-39) over the web app's
// made-up stand-in: a scorekeeper reads every rule and changes one game from halves to
// quarters before the first play; the league's setting off refuses a scorekeeper but not
// an admin; after the first play both are refused; an admin takes the format away again;
// a stale version, a visitor, a stranger, a bad body and another league's address.
import { GameFormatReply, FORMAT_FACTS, type GameFormatView } from '@srleagues/contracts';
import { setSetting } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { commandContextOf } from './context.ts';
import { changeGameFormatRequest, readGameFormatRequest } from './game-format-endpoint.ts';
import { scoringSessionRequest } from './scoring-session-endpoint.ts';
import { standInPlayerId } from './stand-in-games.ts';
import { sendTrackerCommands } from './tracker-commands-endpoint.ts';
import {
  games,
  tap,
  trackerWorld,
  type League,
  type Person,
} from './tracker-endpoints.test-helper.ts';

type World = ReturnType<typeof trackerWorld>;
/** Lions v Tigers, scheduled, the scorekeeper's (Hawks v Bears is already under way). */
const game = games.lionsTigers;
const lions = [1, 2, 3, 4, 5].map((n) => standInPlayerId(1, n));
const tigers = [1, 2, 3, 4, 5].map((n) => standInPlayerId(2, n));
const parts = ['games', game, 'format'];

async function read(world: World, as: Person = 'scorekeeper', league: League = 'live') {
  const context = await world.contextAs(as, league, parts);
  return readGameFormatRequest(context, game, world.tracker);
}

async function change(world: World, body: unknown, as: Person = 'scorekeeper') {
  const context = await world.contextAs(as, 'live', parts);
  return changeGameFormatRequest(context, game, body, world.tracker);
}

async function viewOf(world: World, as: Person = 'scorekeeper'): Promise<GameFormatView> {
  const reply = GameFormatReply.parse((await read(world, as)).body);
  if (reply.status !== 'format') throw new Error(`refused: ${reply.code}`);
  return reply.view;
}

const refusal = (answer: { status: number; body: unknown }) => {
  const reply = GameFormatReply.parse(answer.body);
  return { status: answer.status, code: reply.status === 'refused' ? reply.code : null };
};

function quarters(view: GameFormatView) {
  const format = view.applies;
  return {
    ...format,
    gameFormat: { ...format.gameFormat, periods: 4 as const, periodSeconds: 480 },
  };
}

async function settingOff(world: World) {
  const context = await world.contextAs('owner', 'live', ['settings']);
  const result = await setSetting(
    commandContextOf(context),
    { level: 'league', key: 'games.scorekeepersMayChangeFormat', value: false, version: null },
    world.ports.adminSettings.deps,
  );
  expect(result).toMatchObject({ ok: true });
}

async function firstPlay(world: World) {
  const context = await world.contextAs('scorekeeper', 'live', ['games', game, 'session']);
  const opened = await scoringSessionRequest(
    context,
    game,
    { type: 'open', deviceId: 'tablet-1' },
    world.tracker,
  );
  const { sessionId } = opened.body as { sessionId: string };
  const commands = [
    tap({ type: 'lineup', side: 'home', playerIds: lions }),
    tap({ type: 'lineup', side: 'away', playerIds: tigers }),
    tap({ type: 'start' }),
  ];
  const sent = await sendTrackerCommands(
    await world.contextAs('scorekeeper', 'live', ['games', game, 'commands']),
    game,
    { protocolVersion: 1, sessionId, commands },
    world.tracker,
    world.publishPlays,
  );
  expect(sent.answer.status).toBe(200);
}

describe('…/games/{game}/format', () => {
  it('lists every rule, the clock mode included, and lets the scorekeeper change it', async () => {
    const world = trackerWorld();
    const view = await viewOf(world);
    expect(view.facts.map((f) => f.fact)).toEqual([...FORMAT_FACTS]);
    expect(view).toMatchObject({ source: 'season', given: null, change: { may: true } });
    expect(view.presets.map((p) => p.preset)).toEqual(['high-school', 'rec-league', 'season']);

    const saved = await change(world, { version: view.version, format: quarters(view) });
    expect(saved.status).toBe(200);
    const after = GameFormatReply.parse(saved.body);
    if (after.status !== 'format') throw new Error('refused');
    expect(after.view).toMatchObject({
      source: 'given',
      applies: { gameFormat: { periods: 4, periodSeconds: 480 } },
    });
    expect(after.view.facts).toContainEqual({ fact: 'periods', value: 4 });
    // The season's other games keep the season's format.
    const otherContext = await world.contextAs('scorekeeper', 'live', parts);
    const other = GameFormatReply.parse(
      (await readGameFormatRequest(otherContext, games.hawksBears, world.tracker)).body,
    );
    expect(other).toMatchObject({
      status: 'format',
      view: { given: null, applies: { gameFormat: view.season.gameFormat } },
    });
  });

  it('refuses a stale version, and an admin takes the format away again', async () => {
    const world = trackerWorld();
    const view = await viewOf(world, 'owner');
    expect(view.change).toEqual({ may: true, as: 'admin' });
    expect(
      (await change(world, { version: view.version, format: quarters(view) }, 'owner')).status,
    ).toBe(200);
    expect(refusal(await change(world, { version: view.version, format: null }, 'owner'))).toEqual({
      status: 409,
      code: 'changed-since-read',
    });
    const given = await viewOf(world, 'owner');
    const cleared = GameFormatReply.parse(
      (await change(world, { version: given.version, format: null }, 'owner')).body,
    );
    expect(cleared).toMatchObject({ status: 'format', view: { source: 'season', given: null } });
  });

  it('with the setting off refuses a scorekeeper and still lets an admin', async () => {
    const world = trackerWorld();
    await settingOff(world);
    const view = await viewOf(world);
    expect(view.change).toEqual({ may: false, reason: 'setting-off' });
    expect(refusal(await change(world, { version: view.version, format: quarters(view) }))).toEqual(
      {
        status: 409,
        code: 'setting-off',
      },
    );
    expect(
      (await change(world, { version: view.version, format: quarters(view) }, 'owner')).status,
    ).toBe(200);
  });

  it('after the first play refuses the scorekeeper and the admin alike (B3)', async () => {
    const world = trackerWorld();
    expect((await viewOf(world)).change).toEqual({ may: true, as: 'scorekeeper' });
    await firstPlay(world);
    const view = await viewOf(world);
    expect(view).toMatchObject({ source: 'fixed', change: { may: false, reason: 'under-way' } });
    for (const as of ['scorekeeper', 'owner'] as const) {
      expect(
        refusal(await change(world, { version: view.version, format: quarters(view) }, as)),
      ).toEqual({
        status: 409,
        code: 'under-way',
      });
    }
  });

  it("answers a visitor, a stranger, a bad body and another league's address with their refusals", async () => {
    const world = trackerWorld();
    expect((await read(world, 'visitor')).status).toBe(401);
    expect(refusal(await read(world, 'stranger'))).toEqual({ status: 403, code: 'not-allowed' });
    expect((await change(world, { version: 'one', format: null })).status).toBe(400);
    expect(refusal(await read(world, 'owner', 'other'))).toEqual({
      status: 404,
      code: 'unknown-game',
    });
  });
});
