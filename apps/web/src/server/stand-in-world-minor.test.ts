// R-28 on the made-up world: every read of the world that says whether a person is a
// child goes through core's one rule (isMinorOn, by way of minorAt): the public roster,
// the statistics' and the game page's people, and "has the league a recorded child" of
// the Privacy settings. A birth date decides where there is one, whatever the tick says.
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
 * The seed with every tick in the adult league cleared to "not known" but two of a public
 * team's players: one a child by birth date with the tick off, one an adult by birth date
 * with the tick on.
 */
function worldWithBirthDates(now: () => Date) {
  const today = dayIn(now(), adultTimeZone);
  const picked: { child?: string; adult?: string; teamId?: string } = {};
  const world = testWorld(undefined, now, (leagues: LeagueWorld[]) => {
    const league = leagues.find((l) => l.leagueId === adult);
    if (league === undefined) throw new Error('no adult league in the seed');
    const season = league.seasons.find((s) => s.id === league.currentSeasonId);
    const team = league.teams.find((t) => t.seasonId === season?.id && !t.binned);
    const onTeam = league.roster.filter((r) => r.teamId === team?.id && r.leftOn === null);
    const [first, second] = onTeam;
    if (team === undefined || first === undefined || second === undefined) {
      throw new Error('no public team with two players in the seed');
    }
    Object.assign(picked, { child: first.personId, adult: second.personId, teamId: team.id });
    league.people = league.people.map((p) => {
      // Eighteen tomorrow: still a child today, in the league's own day.
      if (p.id === first.personId) {
        const birthDate = yearsBefore(addDays(today, 1), 18);
        return { ...p, sensitive: { ...p.sensitive, birthDate, isMinor: false } };
      }
      // Eighteen today: an adult.
      if (p.id === second.personId) {
        const birthDate = yearsBefore(today, 18);
        return { ...p, sensitive: { ...p.sensitive, birthDate, isMinor: true } };
      }
      return { ...p, sensitive: { ...p.sensitive, birthDate: null, isMinor: null } };
    });
  });
  return { world, ...picked };
}

describe('who counts as a child on the made-up world (R-28)', () => {
  const now = atLeagueNoon();

  it('shows a child by birth date as a child on the public roster', async () => {
    const { world, teamId, child, adult: grown } = worldWithBirthDates(now);
    const s = await world.read(adult);
    const roster = worldPublicRoster(
      s,
      teamId ?? '',
      { viewer: publicViewer(adult), policy: defaultNamePolicy },
      world.now(),
    );
    const person = (id: string | undefined) => s?.people.find((p) => p.id === id);
    const lineOf = (id: string | undefined) => {
      const p = person(id);
      return roster.lines.find(
        (l) => l.name.shown && l.name.text.startsWith(p?.firstName ?? '\u0000'),
      );
    };
    const kid = person(child);
    // An adult league shows adults in full: the child by first name and last initial.
    expect(lineOf(child)?.name).toEqual({
      shown: true,
      text: `${kid?.firstName} ${kid?.lastName.slice(0, 1)}.`,
    });
    const big = person(grown);
    expect(lineOf(grown)?.name).toEqual({
      shown: true,
      text: `${big?.firstName} ${big?.lastName}`,
    });
  });

  it('answers the same in the statistics and game page reads', async () => {
    const { world, child, adult: grown } = worldWithBirthDates(now);
    const ids = [child ?? '', grown ?? ''];
    const minorOf = (rows: readonly { id: string; isMinor: boolean | null }[]) =>
      ids.map((id) => rows.find((r) => r.id === id)?.isMinor);
    const stats = await worldStandingsRead(() => world.read(adult), world.now).people(ids);
    const game = await worldGameSnapshot(() => world.read(adult), world.now).people(ids);
    expect(minorOf(stats)).toEqual([true, false]);
    expect(minorOf(game)).toEqual([true, false]);
  });

  it('counts a child by birth date as a recorded child, and an adult by date as none', async () => {
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
    // An adult by birth date, the tick on: it has none.
    expect(await recorded(worldWith(yearsBefore(today, 18), true))).toBe(false);
  });
});
