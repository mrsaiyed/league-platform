import { describe, expect, it } from 'vitest';
import { signInFirstUrl } from './sign-in-first.ts';

const nextOf = (url: string) => new URL(url, 'http://site.invalid').searchParams.get('next');

describe('sending someone to sign in and back (step 2.33)', () => {
  it('goes to the sign-in screen and back to the page asked for', () => {
    const url = signInFirstUrl('/north-valley/score/01900000-0000-7000-8000-006a00000002');
    expect(new URL(url, 'http://site.invalid').pathname).toBe('/signin');
    expect(nextOf(url)).toBe('/north-valley/score/01900000-0000-7000-8000-006a00000002');
  });

  it('says why when asked to', () => {
    const url = signInFirstUrl('/north-valley/admin', { problem: 'signInToScore' });
    expect(new URL(url, 'http://site.invalid').searchParams.get('problem')).toBe('signInToScore');
    expect(nextOf(url)).toBe('/north-valley/admin');
  });

  it('never keeps an address that leaves the site', () => {
    for (const away of [
      '//elsewhere.example/x',
      'https://elsewhere.example/',
      '/\\elsewhere',
      '',
    ]) {
      expect(nextOf(signInFirstUrl(away))).toBeNull();
    }
  });
});
