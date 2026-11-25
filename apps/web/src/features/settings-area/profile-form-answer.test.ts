// What a refused or saved Profile form marks and says (step 2.155 part 3, T-416).
import { describe, expect, it } from 'vitest';
import { profileRefusal, profileSaved } from './profile-form-answer.ts';

describe('profileRefusal', () => {
  it('marks the short name for a taken one and names it beside the box', () => {
    const refusal = profileRefusal('shortName', 'leagues.rename_short_name', 'short-name-taken');
    expect(refusal.wrong).toEqual(['slug']);
    expect(refusal.said).toBe(
      'Short name (in the address): Another league already has that short name, or keeps it for forwarding. Choose another.',
    );
  });

  it('marks the tick a move toward adults asks for', () => {
    const refusal = profileRefusal('whoPlays', 'leagues.set_audience', 'confirmation-needed');
    expect(refusal.wrong).toEqual(['confirmed']);
    expect(refusal.said.startsWith('Tick ')).toBe(false);
    expect(refusal.said).toContain('Tick the confirmation to show more people as adults');
  });

  it("marks the box an issue's path names", () => {
    const refusal = profileRefusal('profile', 'leagues.set_profile', 'invalid-input', [
      { path: 'contactEmail' },
    ]);
    expect(refusal.wrong).toEqual(['contactEmail']);
    expect(refusal.said.startsWith('Contact email: ')).toBe(true);
  });

  it('marks the one box of a one-box form refused for what was typed', () => {
    const refusal = profileRefusal('name', 'leagues.set_name', 'invalid-input');
    expect(refusal.wrong).toEqual(['name']);
    expect(refusal.said.startsWith("The league's name: ")).toBe(true);
  });

  it('marks nothing when the league changed meanwhile, and says why', () => {
    const refusal = profileRefusal('profile', 'leagues.set_profile', 'changed-since-read');
    expect(refusal.wrong).toEqual([]);
    expect(refusal.said).not.toContain(':');
    // The screen keeps what was typed, "Saved now" beside it: the sentence says so.
    expect(refusal.said).toContain('What you typed is kept');
    expect(refusal.said).not.toContain('The page now shows the latest');
  });
});

describe('profileSaved', () => {
  it('names the form and what was saved', () => {
    expect(profileSaved('name')).toEqual({ form: 'name', text: "Saved: the league's name." });
    expect(profileSaved('firstChild')?.form).toBe('profile');
    expect(profileSaved('audienceClearedFullNames')?.form).toBe('whoPlays');
    expect(profileSaved('shortName')?.text).toContain('forwards to the new one for 12 months');
  });

  it('says nothing for a notice of something else', () => {
    expect(profileSaved(undefined)).toBeUndefined();
    expect(profileSaved('saved')).toBeUndefined();
  });
});
