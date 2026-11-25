// What a post of a part of Season settings does (step 2.47), on the made-up world the app
// runs on: a refused box keeps what was typed and is named; a preset fills the boxes and
// saves nothing; a tiebreaker change after a result asks first, naming each team it moves
// with its place before and after, and saves only on "Yes"; the unique-jersey rule is
// refused beside its box while a number is worn twice; the name and dates save. And every
// part's words are in the message files.
import { getSeason, type AccessReader, type CommandContext } from '@srleagues/core';
import { catalogs } from '@srleagues/site';
import { describe, expect, it } from 'vitest';
import { standInLeagues, standInPeople } from '../../server/stand-in-cast.ts';
import { standInSeasonIds } from '../../server/stand-in-world-seed.ts';
import { testWorld } from '../../server/stand-in-world.test-helper.ts';
import type { World } from '../../server/stand-in-world.ts';
import type { PartState } from './part-form-state.ts';
import { partFacts, partGroups, partTexts } from './part-words.ts';
import { runPartSave, type PartSaveResult } from './run-part-save.ts';
import { rulesFields, seasonParts } from './season-parts.ts';

const league = standInLeagues.live.id;
const owner = standInPeople.owner.accountId;
const fall = standInSeasonIds.adultFall;
const ownerOnly = (): AccessReader => ({
  ownerAccountId: async () => owner,
  leagueStatus: async () => 'live',
  activeGrantsOf: async () => [],
});
const context: CommandContext = { leagueId: league, accountId: owner, requestId: 'r' };

async function seasonOf(world: World) {
  const read = await getSeason(context, { seasonId: fall }, world.deps);
  if (!read.ok) throw new Error(read.error.code);
  return read.value;
}

const deps = (world: World) => ({
  seasons: world.deps,
  teamsOf: async () => {
    const w = await world.read(league);
    return new Map(
      (w?.teams ?? []).map((team) => [team.id, { name: team.name, division: undefined }]),
    );
  },
});

const stateOf = (result: PartSaveResult): PartState => {
  if (result.kind !== 'answer') throw new Error('saved, not answered');
  return result.state;
};

async function post(world: World, part: string, typed: Record<string, string>, step = 'save') {
  const season = await seasonOf(world);
  return runPartSave(
    context,
    {
      league: 'north-valley',
      seasonId: fall,
      part,
      version: String(season.version),
      step,
      ...typed,
    },
    deps(world),
  );
}

describe('saving a part of Season settings', () => {
  it('refuses a box, names it and keeps what was typed; nothing saved', async () => {
    const world = testWorld(ownerOnly);
    const before = await seasonOf(world);
    const typed = { ...rulesFields('game', before.rules), bonusFouls: 'seven' };
    const state = stateOf(await post(world, 'game', typed));
    expect(state).toMatchObject({
      kind: 'refused',
      typed: { bonusFouls: 'seven' },
      wrong: [
        { field: 'bonusFouls', said: 'Bonus from team foul number: a whole number from 1 to 30.' },
      ],
      said: 'Not saved: the marked boxes need a change.',
    });
    expect(await seasonOf(world)).toEqual(before);
  });

  it('fills the game rules from a preset and saves nothing', async () => {
    const world = testWorld(ownerOnly);
    const before = await seasonOf(world);
    const state = stateOf(await post(world, 'game', { preset: 'high-school' }, 'preset'));
    expect(state).toMatchObject({ kind: 'enter', typed: { periods: '4', periodMinutes: '8' } });
    expect(await seasonOf(world)).toEqual(before);
  });

  it('asks before a tiebreaker change that moves teams, and saves it on yes', async () => {
    const world = testWorld(ownerOnly);
    const before = await seasonOf(world);
    const typed = {
      ...rulesFields('standings', before.rules),
      tiebreaker1: 'points-scored',
      tiebreaker2: 'point-difference',
      tiebreaker3: '',
    };
    const asked = stateOf(await post(world, 'standings', typed));
    if (asked.kind !== 'ask') throw new Error(`not asked: ${JSON.stringify(asked)}`);
    expect(asked.heading).toMatch(
      /^Saving these rules moves \d+ teams in the standings of Fall 2026:$/,
    );
    expect(asked.lines).toContain('Falcons: place 2 to 1.');
    expect(asked.lines.every((line) => !line.includes('-0000-'))).toBe(true);
    expect((await seasonOf(world)).rules.tiebreakers).toEqual(before.rules.tiebreakers);
    // "No, change the rules" gives the boxes back as typed.
    expect(stateOf(await post(world, 'standings', asked.typed, 'change'))).toEqual({
      kind: 'enter',
      typed: asked.typed,
    });
    const yes = await post(world, 'standings', asked.typed, 'confirm');
    expect(yes).toMatchObject({ kind: 'saved', part: 'standings', seasonSlug: 'fall-2026' });
    expect((await seasonOf(world)).rules.tiebreakers).toEqual([
      'points-scored',
      'point-difference',
    ]);
  });

  it('refuses the unique-jersey rule beside its box while a number is worn twice', async () => {
    const world = testWorld(ownerOnly, undefined, (leagues) => {
      const first = leagues.find((l) => l.leagueId === league);
      const teams = new Set(first?.teams.filter((t) => t.seasonId === fall).map((t) => t.id));
      const [one, two] = (first?.roster ?? []).filter(
        (r) => teams.has(r.teamId) && r.leftOn === null && !r.needsReview,
      );
      if (first === undefined || one === undefined || two === undefined) throw new Error('seed');
      first.roster = first.roster.map((r) =>
        r.id === one.id || r.id === two.id ? { ...r, teamId: one.teamId, jerseyNumber: '4' } : r,
      );
    });
    const state = stateOf(await post(world, 'rosters', { uniqueJerseys: 'yes' }));
    expect(state).toMatchObject({
      kind: 'refused',
      wrong: [{ field: 'uniqueJerseys' }],
    });
    expect(state.kind === 'refused' && state.wrong[0]?.said).toContain(
      'two players wearing one number',
    );
  });

  it('saves the name and dates, and refuses an end before the start beside it', async () => {
    const world = testWorld(ownerOnly);
    const wrong = stateOf(
      await post(world, 'name', { name: 'Fall', startsOn: '2026-09-10', endsOn: '2026-09-01' }),
    );
    expect(wrong).toMatchObject({ kind: 'refused', wrong: [{ field: 'endsOn' }] });
    const saved = await post(world, 'name', {
      name: 'Fall 2026 League',
      startsOn: '2026-09-01',
      endsOn: '2026-12-15',
    });
    expect(saved).toMatchObject({ kind: 'saved', part: 'name' });
    expect(await seasonOf(world)).toMatchObject({
      name: 'Fall 2026 League',
      startsOn: '2026-09-01',
      endsOn: '2026-12-15',
    });
  });

  it('refuses a save made on a version that has moved on, in words (A-8)', async () => {
    const world = testWorld(ownerOnly);
    const season = await seasonOf(world);
    const result = await runPartSave(
      context,
      {
        seasonId: fall,
        part: 'rosters',
        version: String(season.version + 5),
        step: 'save',
        uniqueJerseys: 'yes',
      },
      deps(world),
    );
    expect(stateOf(result)).toMatchObject({
      kind: 'refused',
      said: expect.stringContaining('What you typed is kept, and beside each box that differs'),
      typed: { uniqueJerseys: 'yes' },
      savedNow: { label: 'Saved now:', ticked: 'ticked', unticked: 'not ticked' },
    });
  });
});

describe("every part's words are in the message files", () => {
  it('draws each part and its form with no missing key', async () => {
    const world = testWorld(ownerOnly);
    const season = await seasonOf(world);
    const english = catalogs['en'] ?? {};
    const keys = Object.keys(english);
    const missing = (text: string) =>
      keys.includes(text) || /^[a-z]+(\.[a-zA-Z0-9-]+)+$/.test(text);
    const words: string[] = [];
    for (const part of seasonParts) {
      for (const fact of partFacts(part, season)) words.push(fact.term, fact.value);
      for (const group of partGroups(part, season.rules)) {
        if (group.legend !== undefined) words.push(group.legend);
        for (const field of group.fields) {
          words.push(field.kind === 'note' ? field.text : field.label);
          if ('options' in field) for (const option of field.options) words.push(option.label);
        }
      }
      const texts = partTexts(part, season.rules);
      words.push(texts.save, ...(texts.presets?.choices.map((c) => c.label) ?? []));
    }
    // A key that is not in the files comes back as itself: none does.
    expect(words.filter(missing)).toEqual([]);
    expect(words.join(' ')).not.toMatch(/program/i);
  });
});
