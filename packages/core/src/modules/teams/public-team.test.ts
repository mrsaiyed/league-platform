import { describe, expect, it } from 'vitest';
import {
  defaultNamePolicy,
  findPrivateFields,
  privateValuesOf,
  publicViewer,
} from '../people/index.ts';
import { publicRosterLine, publicTeam, type RosterLineSource } from './public-team.ts';

const display = { viewer: publicViewer('L1'), policy: defaultNamePolicy };
const source = (extra: Partial<RosterLineSource> = {}): RosterLineSource => ({
  entryId: 'e1',
  jerseyNumber: '7',
  role: 'player',
  leftOn: null,
  firstName: 'Mariam',
  lastName: 'Okafor',
  isMinor: null,
  nameRequest: 'none',
  personBinned: false,
  ...extra,
});

describe('publicRosterLine', () => {
  it('shows a youth league player by first name and last initial', () => {
    const line = publicRosterLine(source(), 'youth', display);
    expect(line.name).toEqual({ shown: true, text: 'Mariam O.' });
    const scan = findPrivateFields(line, {
      privateValues: privateValuesOf(
        { firstName: 'Mariam', lastName: 'Okafor', nameRequest: 'none' },
        line.name,
      ),
    });
    expect(scan).toEqual([]);
  });

  it('shows an adult by full name', () => {
    expect(publicRosterLine(source(), 'adult', display).name).toEqual({
      shown: true,
      text: 'Mariam Okafor',
    });
  });

  it('marks a former player and keeps the number', () => {
    const line = publicRosterLine(source({ leftOn: '2026-11-01' }), 'adult', display);
    expect(line).toMatchObject({ former: true, leftOn: '2026-11-01', jerseyNumber: '7' });
  });

  it('gives a nameless entry to someone who asked to be removed or is in the bin', () => {
    expect(publicRosterLine(source({ nameRequest: 'removed' }), 'adult', display).name).toEqual({
      shown: false,
      why: 'removed',
    });
    expect(publicRosterLine(source({ personBinned: true }), 'adult', display).name.shown).toBe(
      false,
    );
  });
});

describe('publicTeam', () => {
  const team = {
    leagueId: 'L1',
    id: 't1',
    slug: 'x',
    name: 'X',
    color: null,
    division: null,
  };
  it('shows team totals only for a staff-only team, and for a level it does not know', () => {
    expect(publicTeam({ ...team, statsVisibility: 'staff' }, display.viewer).statsShown).toBe(
      'team_totals',
    );
    expect(publicTeam({ ...team, statsVisibility: 'members' }, display.viewer).statsShown).toBe(
      'team_totals',
    );
    expect(publicTeam({ ...team, statsVisibility: 'everyone' }, display.viewer).statsShown).toBe(
      'player_lines',
    );
  });
});
