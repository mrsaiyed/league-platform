import { describe, expect, it } from 'vitest';
import { teamFormRefusal } from './team-form-answer.ts';

describe("a refused form of a team's page names the box it is about (step 2.155)", () => {
  it('marks the name a second team already has, and names it', () => {
    const refusal = teamFormRefusal('details', 'teams.update_team', 'team-name-taken', {});
    expect(refusal.wrong).toEqual(['name']);
    expect(refusal.said).toBe('Name: Another team of this season already has that name.');
  });

  it('marks a box the input check refused, by its path', () => {
    const refusal = teamFormRefusal('details', 'teams.update_team', 'invalid-input', {}, [
      { path: 'color' },
    ]);
    expect(refusal.wrong).toEqual(['color']);
    expect(refusal.said.startsWith('Color: ')).toBe(true);
  });

  it("marks a new player's number worn, or one not of the roster's shape", () => {
    const taken = teamFormRefusal('newPlayer', 'teams.add_new_person', 'jersey-taken', {});
    expect(taken.wrong).toEqual(['jerseyNumber']);
    const shape = teamFormRefusal('newPlayer', 'teams.add_new_person', 'invalid-input', {
      jerseyNumber: '123',
    });
    expect(shape.wrong).toEqual(['jerseyNumber']);
    expect(shape.said.startsWith('Jersey number (0 to 99, or 00): ')).toBe(true);
  });

  it('marks no box for a refusal about none, and says it as the command does', () => {
    const refusal = teamFormRefusal('details', 'teams.update_team', 'team-not-found', {});
    expect(refusal.wrong).toEqual([]);
    expect(refusal.said).toBe('That team is not there.');
  });

  it("marks a roster line's number worn, or one not of the roster's shape", () => {
    const taken = teamFormRefusal('entry', 'teams.change_roster_entry', 'jersey-taken', {});
    expect(taken.wrong).toEqual(['jerseyNumber']);
    expect(taken.said.startsWith('Number: ')).toBe(true);
    const shape = teamFormRefusal('entry', 'teams.change_roster_entry', 'invalid-input', {
      jerseyNumber: 'x7',
    });
    expect(shape.wrong).toEqual(['jerseyNumber']);
  });

  it('marks the person chosen from the league list when they cannot be added', () => {
    const on = teamFormRefusal('fromList', 'teams.add_to_roster', 'already-on-team', {});
    expect(on.wrong).toEqual(['personId']);
    const worn = teamFormRefusal('fromList', 'teams.add_to_roster', 'jersey-taken', {});
    expect(worn.wrong).toEqual(['jerseyNumber']);
  });

  it('marks no box of who sees the numbers when the team changed meanwhile', () => {
    const refusal = teamFormRefusal(
      'stats',
      'teams.set_team_stats_visibility',
      'changed-since-read',
      {},
    );
    expect(refusal.wrong).toEqual([]);
  });
});
