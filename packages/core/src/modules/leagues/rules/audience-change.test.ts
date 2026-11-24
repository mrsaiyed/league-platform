import { describe, expect, it } from 'vitest';
import { audienceChange } from './audience-change.ts';

describe('audienceChange', () => {
  it('asks for the confirmation only when moving toward adults (R-14)', () => {
    expect(audienceChange('youth', 'mixed', false).needsConfirming).toBe(true);
    expect(audienceChange('youth', 'adult', false).needsConfirming).toBe(true);
    expect(audienceChange('mixed', 'adult', false).needsConfirming).toBe(true);
    expect(audienceChange('adult', 'mixed', false).needsConfirming).toBe(false);
    expect(audienceChange('adult', 'youth', false).needsConfirming).toBe(false);
    expect(audienceChange('mixed', 'youth', false).needsConfirming).toBe(false);
    expect(audienceChange('adult', 'adult', false).needsConfirming).toBe(false);
  });

  it('clears a confirmed "children in full" only when an adult league brings children in', () => {
    expect(audienceChange('adult', 'youth', true).clearsChildrenInFull).toBe(true);
    expect(audienceChange('adult', 'mixed', true).clearsChildrenInFull).toBe(true);
    expect(audienceChange('adult', 'youth', false).clearsChildrenInFull).toBe(false);
    expect(audienceChange('mixed', 'youth', true).clearsChildrenInFull).toBe(false);
    expect(audienceChange('youth', 'adult', true).clearsChildrenInFull).toBe(false);
    expect(audienceChange('adult', 'adult', true).clearsChildrenInFull).toBe(false);
  });
});
