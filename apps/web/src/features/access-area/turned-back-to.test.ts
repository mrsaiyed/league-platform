import { platformUrl, type AccessHolder } from '@srleagues/core';
import { describe, expect, it } from 'vitest';
import { turnedBackTo } from './turned-back-to.ts';

const home = platformUrl('home');
const back = '/quiet-pines/invitation';
const admin: AccessHolder = { accountId: 'a', isOwner: true, grants: [] };

describe('where Accept turns a person back to (T-453)', () => {
  it('a visitor at a draft or suspended league goes home, as at a league that does not exist', () => {
    for (const status of ['draft', 'suspended'] as const) {
      for (const invitationHeld of [false, true]) {
        expect(
          turnedBackTo({ status, holder: undefined, signedIn: false, invitationHeld, back }),
        ).toBe(home);
      }
    }
    // A league that does not exist has no accept page to go back to.
    expect(
      turnedBackTo({
        status: 'draft',
        holder: undefined,
        signedIn: false,
        invitationHeld: false,
        back: null,
      }),
    ).toBe(home);
  });

  it('a signed-in stranger with no invitation held for a hidden league goes home too', () => {
    expect(
      turnedBackTo({
        status: 'draft',
        holder: undefined,
        signedIn: true,
        invitationHeld: false,
        back,
      }),
    ).toBe(home);
  });

  it('a signed-in invitee holding the invitation goes back to the accept page, which says why', () => {
    expect(
      turnedBackTo({
        status: 'draft',
        holder: undefined,
        signedIn: true,
        invitationHeld: true,
        back,
      }),
    ).toBe(back);
  });

  it('at a published league, or for someone who may open the draft, nothing changes: back to the accept page', () => {
    expect(
      turnedBackTo({
        status: 'live',
        holder: undefined,
        signedIn: false,
        invitationHeld: false,
        back,
      }),
    ).toBe(back);
    expect(
      turnedBackTo({ status: 'draft', holder: admin, signedIn: true, invitationHeld: false, back }),
    ).toBe(back);
  });
});
