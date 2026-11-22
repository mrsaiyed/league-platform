// The page's reader of its "your team" marks (step 2.168): one read for every mark of a
// view, nothing kept once the view has gone, and the words a team's page says to a member.
import { describe, expect, it } from 'vitest';
import {
  myTeamReply,
  offersDeviceChoice,
  sharedMyTeam,
  yoursLine,
  type MyTeamHeard,
  type MyTeamReply,
} from './my-team-read.ts';

const address = '/api/v1/leagues/01900000-0000-7000-8000-000000000002/my-team';
const words = {
  yours: 'This is your team.',
  opensHere: 'This is your team. The league opens here for you.',
  mark: 'Your team',
};
const coach: MyTeamReply = {
  teams: ['rockets'],
  startsOn: 'rockets',
  marked: [{ slug: 'rockets', name: 'Rockets', color: null, href: '/harbor-city/teams/rockets' }],
  words,
};
const nothing: MyTeamReply = { teams: [], startsOn: null, marked: [] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('sharedMyTeam', () => {
  it('reads once for all the marks of a view, and hands a late mark what it read', async () => {
    const reads: string[] = [];
    const shared = sharedMyTeam(async (at) => {
      reads.push(at);
      return coach;
    });
    const heard: MyTeamReply[] = [];
    const stopA = shared.ask(address, (reply) => heard.push(reply));
    const stopB = shared.ask(address, (reply) => heard.push(reply));
    await settle();
    expect(reads).toEqual([address]);
    expect(heard).toEqual([coach, coach]);
    const late: MyTeamReply[] = [];
    const stopC = shared.ask(address, (reply) => late.push(reply));
    expect(late).toEqual([coach]);
    expect(reads).toHaveLength(1);
    stopA();
    stopB();
    stopC();
  });

  it('asks again once every mark of the view has gone (after Back, after signing out)', async () => {
    let answer: MyTeamReply = coach;
    const reads: string[] = [];
    const shared = sharedMyTeam(async (at) => {
      reads.push(at);
      return answer;
    });
    const first: MyTeamReply[] = [];
    shared.ask(address, (reply) => first.push(reply))();
    await settle();
    // The view had gone before the answer came: nobody was handed it.
    expect(first).toEqual([]);
    answer = nothing;
    const second: MyTeamReply[] = [];
    const stop = shared.ask(address, (reply) => second.push(reply));
    await settle();
    expect(reads).toHaveLength(2);
    expect(second).toEqual([nothing]);
    stop();
  });

  it('says the read failed, once, when it fails, so the page can be left as it came', async () => {
    let reads = 0;
    const shared = sharedMyTeam(async () => {
      reads += 1;
      throw new Error('offline');
    });
    const heard: MyTeamHeard[] = [];
    const stop = shared.ask(address, (reply) => heard.push(reply));
    expect(heard).toEqual([]);
    await settle();
    expect(heard).toEqual([null]);
    // A late mark of the same view is told at once, with no second read.
    const late: MyTeamHeard[] = [];
    const stopLate = shared.ask(address, (reply) => late.push(reply));
    expect(late).toEqual([null]);
    expect(reads).toBe(1);
    stop();
    stopLate();
  });

  it('says the read gave no answer when the endpoint gave none', async () => {
    const shared = sharedMyTeam(async () => null);
    const heard: MyTeamHeard[] = [];
    const stop = shared.ask(address, (reply) => heard.push(reply));
    await settle();
    expect(heard).toEqual([null]);
    stop();
  });
});

describe('what a team page says', () => {
  it('tells a member it is their team, and that the league opens there where it does', () => {
    expect(yoursLine(coach, 'rockets', true)).toBe(words.opensHere);
    expect(yoursLine({ ...coach, startsOn: null }, 'rockets', true)).toBe(words.yours);
    expect(yoursLine(coach, 'comets', true)).toBeNull();
    expect(yoursLine(nothing, 'rockets', true)).toBeNull();
  });

  it("says nothing of it on a past season's page of a team with the same short name", () => {
    expect(yoursLine(coach, 'rockets', false)).toBeNull();
    expect(yoursLine({ ...coach, startsOn: null }, 'rockets', false)).toBeNull();
  });

  it("offers the device's choice to everyone but a member with a team here", () => {
    // Not until the read has answered or failed: a coach never sees it flash.
    expect(offersDeviceChoice(undefined)).toBe(false);
    // A failed read leaves the page as it came.
    expect(offersDeviceChoice(null)).toBe(true);
    expect(offersDeviceChoice(nothing)).toBe(true);
    expect(offersDeviceChoice({ ...nothing, marked: coach.marked, words })).toBe(true);
    expect(offersDeviceChoice(coach)).toBe(false);
  });

  it('takes only an answer whose marks lead to this site', () => {
    expect(myTeamReply.safeParse(coach).success).toBe(true);
    for (const href of ['https://elsewhere.example/x', '//elsewhere.example/x', 'javascript:x']) {
      const marked = [{ ...coach.marked[0], href }];
      expect(myTeamReply.safeParse({ ...coach, marked }).success, href).toBe(false);
    }
  });
});
