import { describe, expect, it } from 'vitest';
import { directionOf, htmlAttributes, textDirection } from '../../index.ts';

describe('direction (T-188)', () => {
  it('follows the locale', () => {
    expect(directionOf('en')).toBe('ltr');
    expect(directionOf('en-US')).toBe('ltr');
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('ar-EG')).toBe('rtl');
    expect(directionOf('ar_EG')).toBe('rtl');
    expect(directionOf('he-IL')).toBe('rtl');
    expect(directionOf('fa')).toBe('rtl');
    expect(directionOf('not a locale')).toBe('ltr');
  });

  it('gives page attributes, and English for an invalid locale', () => {
    expect(htmlAttributes('ar')).toEqual({ lang: 'ar', dir: 'rtl' });
    expect(htmlAttributes('AR_eg')).toEqual({ lang: 'ar-EG', dir: 'rtl' });
    expect(htmlAttributes('"><script>')).toEqual({ lang: 'en', dir: 'ltr' });
  });

  it('reads the direction of league content from its first letter', () => {
    expect(textDirection('دوري فراج')).toBe('rtl');
    expect(textDirection('Example League')).toBe('ltr');
    expect(textDirection('123 - دوري')).toBe('rtl');
    expect(textDirection('123 !')).toBe('ltr');
    expect(textDirection('', 'rtl')).toBe('rtl');
  });

  it('knows right-to-left scripts outside the first plane', () => {
    expect(textDirection('\u{1E900}\u{1E901}')).toBe('rtl'); // Adlam
    expect(textDirection('\u{10800}\u{10801}')).toBe('rtl'); // Cypriot
    expect(textDirection('א')).toBe('rtl'); // Hebrew
  });
});
