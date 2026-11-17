// R-28 on the made-up world: every read of the world that says whether a person is a
// child goes through core's rule (isMinorOn, by way of minorAt): the public roster, the
// statistics' and the game page's people, "has the league a recorded child" of the Privacy
// settings and the people store's answer to the name-request command. A child if their
// birth date says so or the tick is on; a date that says adult unticks no one.
import { defaultNamePolicy, publicViewer, type CommandContext } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { standInLeagues, standInPeople } from './stand-in-cast.ts';
import { addDays, dayIn } from './stand-in-world-clock.ts';
import { adultTimeZone } from './stand-in-world-seed.ts';
import { worldGameSnapshot, worldPublicRoster } from './stand-in-world-reads.ts';
import { worldStandingsRead } from './stand-in-world-standings.ts';
import type { LeagueWorld } from './stand-in-world-state.ts';
import { atLeagueNoon, testWorld } from './stand-in-world.test-helper.ts';

const adult = standInLeagues.live.id;
const as: CommandContext = {
  leagueId: adult,
  accountId: standInPeople.owner.accountId,
  requestId: 'minor-test',
};

/** yyyy-mm-dd `years` years before the league's today (a birthday that is today). */
const yearsBefore = (today: string, years: number) =>
  `${String(Number(today.slice(0, 4)) - years).padStart(4, '0')}${today.slice(4)}`;

/**
 * The seed with every tick in the adult league cleared to "not known" but three of a public
 * team's players: a child by birth date with the tick off, an adult by birth date with the
 * tick off, and an adult by birth date with the tick on (a child: a date unticks no one).
 */
function worldWithBirthDates(now: () => Date) {
  const today = dayIn(now(), adultTimeZone);
  const picked: { child?: string; adult?: string; ticked?: string; teamId?: string } = {};
  const world = testWorld(undefined, now, (leagues: LeagueWorld[]) => {
    const league = leagues.find((l) => l.leagueId === adult);
    if (league === undefined) throw new Error('no adult league in the seed');
    const season = league.seasons.find((s) => s.id === league.currentSeasonId);
    const team = league.teams.find((t) => t.seasonId === season?.id && !t.binned);
    // Players who asked for nothing about their names, so the rule alone decides.
    const asked = new Set(league.people.filter((p) => p.visibility !== 'none').map((p) => p.id));
    const onTeam = league.roster.filter(
      (r) => r.teamId === team?.id && r.leftOn === null && !asked.has(r.personId),
    );
    const [first, second, third] = onTeam;
    if (team === undefined || first === undefined || second === undefined || third === undefined) {
      throw new Error('no public team with three players in the seed');
    }
    Object.assign(picked, {
      child: first.personId,
      adult: second.personId,
      ticked: third.personId,
      teamId: team.id,
    });
    league.people = league.people.map((p) => {
      const facts = (birthDate: string, isMinor: boolean) => ({
        ...p,
        sensitive: { ...p.sensitive, birthDate, isMinor },
      });
      // Eighteen tomorrow: still a child today, in the league's own day.
      if (p.id === first.personId) return facts(yearsBefore(addDays(today, 1), 18), false);
      // Eighteen today, unticked: an adult.
      if (p.id === second.personId) return facts(yearsBefore(today, 18), false);
      // Eighteen today, ticked: still a child until the admin unticks them.
      if (p.id === third.personId) return facts(yearsBefore(today, 18), true);
      return { ...p, sensitive: { ...p.sensitive, birthDate: null, isMinor: null } };
    });
  });
  return { world, ...picked };
}

describe('who counts as a child on the made-up world (R-28)', () => {
  const now = atLeagueNoon();

  it('shows a child by birth date or by the tick as a child on the public roster', async () => {
    const { world, teamId, child, adult: grown, ticked } = worldWithBirthDates(now);
    const s = await world.read(adult);
    const roster = worldPublicRoster(
      s,
      teamId ?? '',
      { viewer: publicViewer(adult), policy: defaultNamePolicy },
      world.now(),
    );
    const person = (id: string | undefined) => s?.people.find((p) => p.id === id);
    const nameOf = (id: string | undefined) => {
      const p = person(id);
      return roster.lines.find(
        (l) => l.name.shown && l.name.text.startsWith(p?.firstName ?? '\u0000'),
      )?.name;
    };
    const short = (id: string | undefined) =>
      `${person(id)?.firstName} ${person(id)?.lastName.slice(0, 1)}.`;
    // An adult league shows adults in full: a child by first name and last initial.
    expect(nameOf(child)).toEqual({ shown: true, text: short(child) });
    expect(nameOf(ticked)).toEqual({ shown: true, text: short(ticked) });
    expect(nameOf(grown)).toEqual({
      shown: true,
      text: `${person(grown)?.firstName} ${person(grown)?.lastName}`,
    });
  });

  it('answers the same in the statistics and game page reads, and to the commands', async () => {
    const { world, child, adult: grown, ticked } = worldWithBirthDates(now);
    const ids = [child ?? '', grown ?? '', ticked ?? ''];
    const minorOf = (rows: readonly { id: string; isMinor: boolean | null }[]) =>
      ids.map((id) => rows.find((r) => r.id === id)?.isMinor);
    const stats = await worldStandingsRead(() => world.read(adult), world.now).people(ids);
    const game = await worldGameSnapshot(() => world.read(adult), world.now).people(ids);
    expect(minorOf(stats)).toEqual([true, false, true]);
    expect(minorOf(game)).toEqual([true, false, true]);
    const told = await world.deps.transaction(as, (tx) =>
      Promise.all(ids.map((id) => tx.people.isMinor(id))),
    );
    expect(told).toEqual([true, false, true]);
  });

  it('counts a child by birth date or by the tick as a recorded child, an unticked adult as none', async () => {
    const today = dayIn(now(), adultTimeZone);
    // Everyone ticked as an adult with no date, but one person with this birth date and tick.
    const worldWith = (birthDate: string, isMinor: boolean) =>
      testWorld(undefined, now, (leagues) => {
        const league = leagues.find((l) => l.leagueId === adult);
        league?.people.forEach((p, at) => {
          const sensitive =
            at === 0
              ? { ...p.sensitive, birthDate, isMinor }
              : { ...p.sensitive, birthDate: null, isMinor: false };
          if (league !== undefined) league.people[at] = { ...p, sensitive };
        });
      });
    const recorded = (world: ReturnType<typeof testWorld>) =>
      world.deps.transaction(as, (tx) => tx.leagues.hasRecordedChild());
    // A child by birth date, the tick off: the league has a recorded child.
    expect(await recorded(worldWith(yearsBefore(addDays(today, 1), 18), false))).toBe(true);
    // An adult by birth date, the tick off: it has none.
    expect(await recorded(worldWith(yearsBefore(today, 18), false))).toBe(false);
    // An adult by birth date, the tick on: one.
    expect(await recorded(worldWith(yearsBefore(today, 18), true))).toBe(true);
  });
});
