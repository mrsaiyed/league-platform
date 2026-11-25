import { describe, expect, it } from 'vitest';
import { t } from '../../server/messages.ts';
import { notPutBackText, peopleRefusalText } from '../people-area/refusal-text.ts';
import { nameBeforeStop } from './name-before-stop.ts';

describe('a name before a sentence’s own full stop (step 2.155 part 5)', () => {
  it('drops a name’s last full stop only', () => {
    expect(nameBeforeStop('St. Louis Jr.')).toBe('St. Louis Jr');
    expect(nameBeforeStop(' Ada Lovell ')).toBe('Ada Lovell');
    expect(nameBeforeStop('Kites...')).toBe('Kites..');
    expect(nameBeforeStop('St. Louis')).toBe('St. Louis');
  });

  it('makes every named answer of the bin and People read with one stop', () => {
    const name = nameBeforeStop('St. Louis Jr.');
    const problem = t('error.leagues.restore_person.person-not-found');
    const sentences = [
      t('admin.bin.backNamed', { name }),
      t('admin.bin.notBack', { name, problem }),
      peopleRefusalText('remove_person', 'not-found', 'St. Louis Jr.'),
      notPutBackText('notPutBack.person-not-found', 'St. Louis Jr.') ?? '',
    ];
    expect(sentences[0]).toBe('Brought back: St. Louis Jr.');
    expect(sentences[1]).toBe(`Not brought back: St. Louis Jr. ${problem}`);
    expect(sentences[2]?.startsWith('Not removed: St. Louis Jr. ')).toBe(true);
    expect(sentences[3]).toBe(`Not put back: St. Louis Jr. ${problem}`);
    for (const sentence of sentences) expect(sentence).not.toContain('..');
  });
});
