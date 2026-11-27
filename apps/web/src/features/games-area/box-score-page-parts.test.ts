import { describe, expect, it } from 'vitest';
import { calledOffPanelOf, readsTrackedGrid, trackedGridLinkOf } from './box-score-page-parts.ts';

describe('the box score page in a read-only league (T-519)', () => {
  it("draws a called-off game's panel by its own status, the league's lock aside", () => {
    // In an archived league nobody may call it off: a postponed game keeps its way to the
    // waiting list, a cancelled one draws no empty panel.
    expect(calledOffPanelOf('postponed', false)).toEqual({ waitingLink: true, form: null });
    expect(calledOffPanelOf('cancelled', false)).toBeNull();
    // In a working league, as before.
    expect(calledOffPanelOf('postponed', true)).toEqual({ waitingLink: true, form: 'restore' });
    expect(calledOffPanelOf('cancelled', true)).toEqual({ waitingLink: false, form: 'put-back' });
    expect(calledOffPanelOf('final', true)).toBeNull();
  });

  it('reads a tracked grid in a read-only league and links it to be viewed', () => {
    expect(readsTrackedGrid({ locked: 'archived', mayCorrect: false })).toBe(true);
    expect(readsTrackedGrid({ locked: 'suspended', mayCorrect: false })).toBe(true);
    expect(readsTrackedGrid({ locked: 'tracked', mayCorrect: true })).toBe(true);
    expect(readsTrackedGrid({ locked: 'tracked', mayCorrect: false })).toBe(false);
    expect(readsTrackedGrid({ locked: 'decided', mayCorrect: true })).toBe(false);
    expect(trackedGridLinkOf({ correctable: false, notCorrectable: 'league-read-only' })).toBe(
      'view',
    );
    expect(trackedGridLinkOf({ correctable: true })).toBe('edit');
    expect(trackedGridLinkOf({ correctable: false, notCorrectable: 'game-final' })).toBeNull();
  });
});
