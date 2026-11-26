// The scoring screens' names on the database (R-33, step 2.226): in a youth league a
// removed child and an adult who asked for initials. The scorer's rosters as served, the
// device's stored copy and the box score sheet hold the child's number and the adult's
// initials, and nowhere either surname, searched bare; with "Scorekeepers see full
// names" on, everyone else reads in full and those two still do not. Admin → Teams
// keeps the recorded name beside its "Show as".
import {
  addToRoster,
  createPerson,
  getBoxScoreSheet,
  listRoster,
  readTrackerRosters,
  setNameRequest,
  setSetting,
} from '@srleagues/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deviceRosters } from '../features/tracker/device-rosters.ts';
import { gamesWorld, type GamesWorld } from './database-games.test-helper.ts';
import { scoringNameText } from './scoring-name-text.ts';
import { trackerRostersReply } from './tracker-rosters-reply.ts';

let w: GamesWorld;
let child = '';
let adult = '';

const must = <T>(what: string, result: { ok: true; value: T } | { ok: false; error: unknown }) => {
  if (!result.ok) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result.value;
};

const teamsDeps = () => w.ports.adminTeams.deps;

/** A new player on a team's roster, with a surname nobody else in the league has. */
async function rostered(teamId: string, lastName: string, jersey: string, isMinor: boolean) {
  const { personId } = must(
    'a person',
    await createPerson(w.asOwner, { firstName: 'Robin', lastName, isMinor }, teamsDeps()),
  );
  must(
    'a roster place',
    await addToRoster(
      w.asOwner,
      { teamId, personId, jerseyNumber: jersey, role: 'player' },
      teamsDeps(),
    ),
  );
  return personId;
}

const setting = async (key: string, value: boolean, version: number | null) =>
  must(
    key,
    await setSetting(
      w.asOwner,
      { level: 'league', key, value, version, confirmed: true },
      w.ports.adminSettings.deps,
    ),
  );

beforeAll(async () => {
  w = await gamesWorld({ byHand: 1, live: 1, youth: true });
  child = await rostered(w.herons, 'Zabrowskiyy', '12', true);
  adult = await rostered(w.otters, 'Quillfeatherz', '7', false);
  must(
    'removed',
    await setNameRequest(
      w.asOwner,
      { personId: child, version: 1, showAs: 'removed', reason: 'guardianAsked' },
      teamsDeps(),
    ),
  );
  // An adult may ask for initials only while the league lets players ask (R-25).
  await setting('privacy.playersMayAskForInitials', true, null);
  must(
    'initials',
    await setNameRequest(
      w.asOwner,
      { personId: adult, version: 1, showAs: 'initials', reason: 'personAsked' },
      teamsDeps(),
    ),
  );
}, 300_000);

afterAll(async () => {
  await w.close();
});

/** Everything the scoring screens are given for the two games, as served and stored. */
async function served() {
  const scorer = w.contextOf('scorekeeper');
  const live = w.live[0] ?? '';
  const rosters = trackerRostersReply(
    must('rosters', await readTrackerRosters(scorer, { gameId: live }, w.ports.tracker.deps)),
  );
  const stored = deviceRosters(rosters, { [w.herons]: 'Herons', [w.otters]: 'Otters' });
  const sheet = must(
    'sheet',
    await getBoxScoreSheet(w.asOwner, { gameId: w.byHand[0] ?? '' }, w.ports.games.deps),
  );
  const sheetNames = sheet.players.map((p) => ({ ...p, ...scoringNameText(p) }));
  return { rosters, stored, sheetNames };
}

const surnames = /Zabrowskiyy|Quillfeatherz/;

describe('names on the scoring screens in a youth league (R-33)', () => {
  it('gives the removed child by number only and the adult by initials; neither surname', async () => {
    const { rosters, stored, sheetNames } = await served();
    for (const text of [rosters, stored, sheetNames].map((x) => JSON.stringify(x))) {
      expect(text).not.toMatch(surnames);
    }
    const of = (id: string) => rosters.players.find((p) => p.personId === id);
    expect(of(child)).toMatchObject({ jerseyNumber: '12', firstName: '', lastName: '' });
    expect(of(adult)).toMatchObject({ jerseyNumber: '7', firstName: 'R. Q.', lastName: '' });
    expect(sheetNames.find((p) => p.personId === adult)?.firstName).toBe('R. Q.');
    // The rest of the youth league read by first name and last initial (R-14).
    expect(JSON.stringify(rosters)).not.toContain('Heronfamily');
  });

  it('with Scorekeepers see full names on: everyone else in full, those two still not', async () => {
    await setting('privacy.scorekeepersSeeFullNames', true, null);
    const { rosters, stored, sheetNames } = await served();
    for (const text of [rosters, stored, sheetNames].map((x) => JSON.stringify(x))) {
      expect(text).not.toMatch(surnames);
      expect(text).toContain('Heronfamily');
      expect(text).toContain('Otterfamily');
    }
    const of = (id: string) => rosters.players.find((p) => p.personId === id);
    expect(of(child)).toMatchObject({ jerseyNumber: '12', firstName: '', lastName: '' });
    expect(of(adult)?.firstName).toBe('R. Q.');
  });

  it('Admin → Teams keeps the recorded name beside its Show as', async () => {
    const roster = must('roster', await listRoster(w.asOwner, { teamId: w.herons }, teamsDeps()));
    const line = roster.find((l) => l.personId === child);
    expect(line).toMatchObject({ firstName: 'Robin', lastName: 'Zabrowskiyy' });
  });
});
