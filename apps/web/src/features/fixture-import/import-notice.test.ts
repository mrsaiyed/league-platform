import { describe, expect, it } from 'vitest';
import type { SavedNotice } from '../../server/saved-notice.ts';
import { importNotice, importSaid, noImport } from './import-notice.ts';

const id = '0b0c4f7e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const left = (said: string, thing: string = id): SavedNotice => ({ screen: 'import', thing, said });

describe('the fixture import answer (T-434)', () => {
  it('reads back what a step left, for the import it names', () => {
    expect(importNotice(left(importSaid({ ok: true }, 'undo')), id)).toEqual({
      key: 'admin.import.done.undo',
      problem: false,
    });
    expect(importNotice(left(importSaid({ ok: true, clashCount: 3 }, 'apply')), id)).toEqual({
      key: 'admin.import.done.apply',
      problem: false,
      clashes: 3,
    });
    expect(importNotice(left(importSaid({ ok: true, clashCount: 0 }, 'apply')), id)).toEqual({
      key: 'admin.import.done.apply',
      problem: false,
    });
    expect(
      importNotice(left(importSaid({ ok: false, code: 'no-file' }, 'upload'), noImport), undefined),
    ).toEqual({ key: 'admin.import.error.no-file', problem: true });
    expect(
      importNotice(left(importSaid({ ok: false, code: 'draft-changed' }, 'apply')), id),
    ).toEqual({
      key: 'admin.import.error.draft-changed',
      problem: true,
    });
    expect(importNotice(left('problem.<script>'), id)).toEqual({
      key: 'admin.import.error.unknown',
      problem: true,
    });
    expect(importNotice(left('problem.something-new'), id)).toEqual({
      key: 'admin.import.error.unknown',
      problem: true,
    });
  });

  it('says nothing with no notice, another screen, or another import', () => {
    expect(importNotice(undefined, id)).toBeUndefined();
    expect(importNotice({ screen: 'schedule', thing: id, said: 'done.apply' }, id)).toBeUndefined();
    expect(importNotice(left('done.apply'), undefined)).toBeUndefined();
    expect(importNotice(left('done.apply', noImport), id)).toBeUndefined();
  });

  it('reads nothing it did not leave', () => {
    for (const said of [
      'done.publish',
      'done.everything',
      'done.undo.4',
      'done.apply.0',
      'done.apply.x',
      'done.apply.3.4',
      'problem',
      'problem.no-file.2',
      'apply',
      '',
    ]) {
      expect(importNotice(left(said), id), said).toBeUndefined();
    }
  });
});
