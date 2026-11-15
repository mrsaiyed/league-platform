// Step 2.126 through the web app's own wiring (standInPorts): what the admin saves on
// League settings → Privacy, through the same ports and command the settings screen
// uses, is what the public pages read. Every surface that reads the setting today is
// checked here: a team's roster, the statistics, a game's page and snapshot, and the
// live message sent after a play. A wrong merge of stand-in-ports.ts (a second League
// settings store, say) fails here.
import { CommandReply } from '@srleagues/contracts';
import {
  findPrivateFields,
  privateValuesOf,
  publicViewer,
  readGamePage,
  readGameSnapshot,
  readStatisticsTable,
  setSetting,
  type CommandContext,
} from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { scoringSessionRequest } from './scoring-session-endpoint.ts';
import { standInPlayerId } from './stand-in-games.ts';
import { standInLeagues, standInPeople } from './stand-in-ports.ts';
import { standInSeasonIds, youthTeams } from './stand-in-public-stats.ts';
import { sendTrackerCommands } from './tracker-commands-endpoint.ts';
import { tap, trackerWorld } from './tracker-endpoints.test-helper.ts';

const adult = standInLeagues.live.id;
const youth = standInLeagues.other.id;
/** Hawks v Lions, recorded live, both teams showing their players' numbers to everyone. */
const hawksLions = '01900000-0000-7000-8000-006a00000003';
const hawks = [1, 2, 3, 4, 5].map((n) => standInPlayerId(3, n));
const lions = [1, 2, 3, 4, 5].map((n) => standInPlayerId(1, n));
/** Pia Hawkins, a child playing in the adult league, number 9 (stand-in-games.ts). */
const pia = standInPlayerId(3, 4);

const as = (accountId: string, leagueId: string): CommandContext => ({
  leagueId,
  accountId,
  requestId: 'request-1',
});
const owner = standInPeople.owner.accountId;

function world() {
  const w = trackerWorld();
  /** Saves the league's names setting as its owner, through the settings screen's ports. */
  const saveNames = async (leagueId: string, value: string, version: number | null) => {
    const saved = await setSetting(
      as(owner, leagueId),
      { level: 'league', key: 'privacy.publicNames', value, version, confirmed: true },
      w.ports.adminSettings.deps,
    );
    if (!saved.ok) throw new Error(`not saved: ${saved.error.code}`);
  };
  /** A play by Pia on the Hawks v Lions game; the live message it published. */
  let sessionId: string | undefined;
  const scoreByPia = async () => {
    if (sessionId === undefined) {
      const context = await w.contextAs('scorekeeper', 'live', ['games', hawksLions, 'session']);
      const answer = await scoringSessionRequest(
        context,
        hawksLions,
        { type: 'open', deviceId: 'tablet-1' },
        w.tracker,
      );
      sessionId = (answer.body as { sessionId?: string }).sessionId;
      const first = await send([
        tap({ type: 'lineup', side: 'home', playerIds: hawks }),
        tap({ type: 'lineup', side: 'away', playerIds: lions }),
        tap({ type: 'start' }),
      ]);
      await first.afterwards?.();
    }
    const outcome = await send([tap({ type: 'score', side: 'home', playerId: pia, points: 2 })]);
    expect(CommandReply.parse(outcome.answer.body).results[0]?.status).toBe('accepted');
    await outcome.afterwards?.();
    const games = w.published.filter((p) => p.kind === 'game');
    const last = games.at(-1);
    if (last?.kind !== 'game') throw new Error('nothing published');
    return last.message;
  };
  const send = async (commands: unknown[]) => {
    const context = await w.contextAs('scorekeeper', 'live', ['games', hawksLions, 'commands']);
    return sendTrackerCommands(
      context,
      hawksLions,
      { protocolVersion: 1, sessionId, commands },
      w.tracker,
      w.publishPlays,
    );
  };
  /** Pia as the game's snapshot and its page (box score) show her, read as a visitor. */
  const gameNames = async () => {
    const names = await w.tracker.namesShownOf(adult);
    const viewing = { leagueId: adult, viewer: publicViewer(adult), ...names };
    const store = w.tracker.snapshotStoreOf(adult);
    const snapshot = await readGameSnapshot(store, { gameId: hawksLions }, viewing, Date.now());
    const page = await readGamePage(store, { gameId: hawksLions }, viewing);
    if (!snapshot.ok || !page.ok) throw new Error('expected the game');
    const inPage = page.value.boxScores
      .flatMap((box) => box.players)
      .find((p) => p.personId === pia);
    return {
      snapshot: snapshot.value.players.find((p) => p.playerId === pia)?.name ?? null,
      page: inPage?.name ?? null,
      responses: [snapshot.value, page.value],
    };
  };
  /** The youth league's Rockets roster and statistics, as the team and statistics pages read them. */
  const youthNames = async () => {
    const settings = await w.ports.publicStats.settingsOf(youth);
    const viewer = publicViewer(youth);
    const rockets = youthTeams.find((t) => t.slug === 'rockets')?.id ?? '';
    const roster = await w.ports.publicTeams.rosterOf(youth, rockets, {
      viewer,
      policy: settings.namePolicy,
    });
    const table = await readStatisticsTable(w.ports.publicStats.readStoreOf(youth), {
      seasonId: standInSeasonIds.youthWinter,
      viewing: {
        leagueId: youth,
        viewer,
        audience: settings.audience,
        policy: settings.namePolicy,
      },
    });
    if (!table.ok) throw new Error('expected statistics');
    return {
      roster: roster.lines.map((l) => (l.name.shown ? l.name.text : null)),
      statistics: table.value.players.map((p) => p.name.text).sort(),
      responses: [roster, table.value],
    };
  };
  return { ...w, saveNames, scoreByPia, gameNames, youthNames };
}

describe("the admin's names setting reaches every public surface through standInPorts", () => {
  it('shows a child in the adult league as the setting says: game page, snapshot, live message', async () => {
    const w = world();
    const first = await w.scoreByPia();
    expect(first.latestPlay).toMatchObject({ playerName: 'Pia H.', jersey: '9' });
    expect(await w.gameNames()).toMatchObject({ snapshot: 'Pia H.', page: 'Pia H.' });

    await w.saveNames(adult, 'fullName', null);
    expect((await w.scoreByPia()).latestPlay).toMatchObject({ playerName: 'Pia Hawkins' });
    expect(await w.gameNames()).toMatchObject({ snapshot: 'Pia Hawkins', page: 'Pia Hawkins' });

    await w.saveNames(adult, 'hidden', 1);
    const hidden = await w.scoreByPia();
    // Hidden: by her number only (R-24).
    expect(hidden.latestPlay).toMatchObject({ playerName: null, jersey: '9' });
    const game = await w.gameNames();
    expect(game).toMatchObject({ snapshot: null, page: null });
    // Every form of her name; the surname alone is also the made-up adults' on her team,
    // who are shown, so it is left out here.
    const privateValues = privateValuesOf(
      { firstName: 'Pia', lastName: 'Hawkins', nameRequest: 'none' },
      { shown: false, why: 'hidden' },
    ).filter((value) => value !== 'Hawkins');
    expect(privateValues).toEqual(expect.arrayContaining(['Pia', 'Pia Hawkins']));
    for (const response of [hidden, ...game.responses]) {
      expect(findPrivateFields(response, { privateValues })).toEqual([]);
    }
    // An adult on the same team is still shown by full name (R-15).
    expect(JSON.stringify(game.responses[0])).toContain('Max Hawkins');
  });

  it("changes the youth league's roster and statistics, and only that league's", async () => {
    const w = world();
    // The Rockets' coach is a grown-up, shown in full under every setting for children.
    expect(await w.youthNames()).toMatchObject({
      roster: ['Noor H.', 'Jay W.', 'Lena Ortiz', 'Tess M.'],
      statistics: ['Eli O.', 'Jay W.', 'Maya C.', 'Noor H.', 'Sam R.'],
    });
    await w.saveNames(youth, 'fullName', null);
    expect(await w.youthNames()).toMatchObject({
      roster: ['Noor Haddad', 'Jay Whitaker', 'Lena Ortiz', 'Tess Moreno'],
      statistics: ['Eli Okafor', 'Jay Whitaker', 'Maya Cho', 'Noor Haddad', 'Sam Rivera'],
    });
    // The adult league is untouched.
    expect((await w.tracker.namesShownOf(adult)).policy.children).toBe('first_name_last_initial');
    expect((await w.gameNames()).snapshot).toBe(null);

    await w.saveNames(youth, 'hidden', 1);
    const hidden = await w.youthNames();
    expect(hidden).toMatchObject({
      roster: [null, null, 'Lena Ortiz', null],
      statistics: [null, null, null, null, null],
    });
    const privateValues = [
      ['Noor', 'Haddad'],
      ['Jay', 'Whitaker'],
      ['Tess', 'Moreno'],
      ['Sam', 'Rivera'],
      ['Maya', 'Cho'],
      ['Eli', 'Okafor'],
    ].flatMap(([firstName = '', lastName = '']) =>
      privateValuesOf(
        { firstName, lastName, nameRequest: 'none' },
        { shown: false, why: 'hidden' },
      ),
    );
    for (const response of hidden.responses) {
      expect(findPrivateFields(response, { privateValues })).toEqual([]);
    }
  });

  it('takes who plays from the league: a league it does not know is read as youth', async () => {
    const w = world();
    expect((await w.tracker.namesShownOf(adult)).audience).toBe('adult');
    expect((await w.tracker.namesShownOf(youth)).audience).toBe('youth');
    expect((await w.tracker.namesShownOf(standInLeagues.draft.id)).audience).toBe('youth');
    expect((await w.ports.publicStats.settingsOf(youth)).audience).toBe('youth');
  });
});
