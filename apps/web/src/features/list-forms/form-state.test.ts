import { describe, expect, it } from 'vitest';
import { chosenOf } from './form-state.ts';

const options = [{ value: 'anyScorekeeper' }, { value: 'assignedOnly' }];

describe('the round button drawn chosen after a refusal (step 2.155 part 4)', () => {
  it('is what was typed when it is one of the choices', () => {
    expect(chosenOf(options, 'assignedOnly', 'anyScorekeeper')).toBe('assignedOnly');
  });

  it('is the stored choice when nothing was typed or the choice does not exist', () => {
    expect(chosenOf(options, undefined, 'assignedOnly')).toBe('assignedOnly');
    expect(chosenOf(options, 'nobody', 'assignedOnly')).toBe('assignedOnly');
    expect(chosenOf(options, '', 'anyScorekeeper')).toBe('anyScorekeeper');
  });
});
