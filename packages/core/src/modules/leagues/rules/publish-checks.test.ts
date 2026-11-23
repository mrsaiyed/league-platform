import { describe, expect, it } from 'vitest';
import { firstUnmetCheck, publishChecks, type PublishFacts } from './publish-checks.ts';

const ready: PublishFacts = {
  contactEmail: 'hello@example.org',
  audience: 'youth',
  hasRecordedChild: false,
  namesChosen: true,
};

describe('publishChecks', () => {
  it('passes a youth league with a contact email and its names chosen', () => {
    const checks = publishChecks(ready);
    expect(checks).toEqual([
      { key: 'contactEmail', met: true },
      { key: 'privacyChosen', met: true },
    ]);
    expect(firstUnmetCheck(checks)).toBeUndefined();
  });

  it('says a league with no contact email, or a blank one, is not ready', () => {
    for (const contactEmail of [null, '', '  ']) {
      const checks = publishChecks({ ...ready, contactEmail });
      expect(firstUnmetCheck(checks)).toBe('contactEmail');
    }
  });

  it('asks a youth or mixed league for its privacy choices', () => {
    for (const audience of ['youth', 'mixed'] as const) {
      const checks = publishChecks({ ...ready, audience, namesChosen: false });
      expect(checks).toContainEqual({ key: 'privacyChosen', met: false });
      expect(firstUnmetCheck(checks)).toBe('privacyChosen');
    }
  });

  it('asks an adult league only when someone in it is recorded as a child', () => {
    const adult = { ...ready, audience: 'adult' as const, namesChosen: false };
    expect(publishChecks(adult)).toEqual([{ key: 'contactEmail', met: true }]);
    expect(firstUnmetCheck(publishChecks({ ...adult, hasRecordedChild: true }))).toBe(
      'privacyChosen',
    );
  });

  it('names the contact email first when both are not met', () => {
    const checks = publishChecks({ ...ready, contactEmail: null, namesChosen: false });
    expect(firstUnmetCheck(checks)).toBe('contactEmail');
  });
});
