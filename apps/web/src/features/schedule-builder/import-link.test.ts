import { describe, expect, it } from 'vitest';
import { t } from '../../server/messages.ts';
import { importLinkOf } from './import-link.ts';

describe('the schedule page link to the fixture import screen', () => {
  it('is built by the address helper and ends at the import page', () => {
    const link = importLinkOf({ slug: 'demo' });
    expect(link).toContain('/demo/');
    expect(link.endsWith('/admin/schedule/import')).toBe(true);
  });

  it('has its words in the message file', () => {
    expect(t('schedule.admin.importLink')).toBe('Import fixtures from a spreadsheet');
  });
});
