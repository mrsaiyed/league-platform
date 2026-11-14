// One step of a fixture import from the screen's forms: the form's words become an imports
// command's input, and the command runs with the context the server worked out from the
// session (T-23). Which season a file goes into is the server's answer (the league's
// current season), never the form's; nothing here reads who is asking from the form.
import {
  applyFixtureImport,
  discardFixtureImport,
  maxReportBytes,
  startFixtureImport,
  undoFixtureImport,
  type CommandContext,
  type CommandDeps,
  type ImportsTx,
} from '@srleagues/core';

export const importActions = ['upload', 'apply', 'undo', 'discard'] as const;
export type ImportAction = (typeof importActions)[number];

export function isImportAction(value: unknown): value is ImportAction {
  return importActions.some((a) => a === value);
}

/** What a form held: text by field name, and the uploaded file's name and text. */
export type ImportFields = {
  readonly text: Readonly<Record<string, string | undefined>>;
  readonly file?: { readonly name: string; readonly text: string } | undefined;
};

export type ImportActionResult =
  | {
      readonly ok: true;
      readonly importId: string;
      /** After apply: how many clashes the added games cause, to say so at once. */
      readonly clashCount?: number;
    }
  | { readonly ok: false; readonly code: string; readonly importId?: string };

/**
 * The largest file the screen reads: the import keeps the text in its row until the worker
 * has read it, and refuses more than this (startFixtureImport), so a larger file is refused
 * before it is read. It is under Next.js's own 1 MB limit for a form sent to the server.
 */
export const maxUploadBytes = maxReportBytes;

function versionOf(text: string | undefined): number | undefined {
  const trimmed = (text ?? '').trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

export async function runImportAction(
  action: ImportAction,
  fields: ImportFields,
  context: CommandContext,
  deps: CommandDeps<ImportsTx>,
  seasonId: string | undefined,
): Promise<ImportActionResult> {
  const importId = fields.text['importId'];
  switch (action) {
    case 'upload': {
      if (seasonId === undefined) return { ok: false, code: 'no-season' };
      const file = fields.file;
      if (file === undefined || file.text.trim() === '') return { ok: false, code: 'no-file' };
      const name = file.name.trim().slice(0, 255);
      const started = await startFixtureImport(
        context,
        { seasonId, fileName: name === '' ? null : name, fileText: file.text },
        deps,
      );
      return started.ok
        ? { ok: true, importId: started.value.importId }
        : { ok: false, code: started.error.code };
    }
    case 'apply': {
      const applied = await applyFixtureImport(
        context,
        { importId, version: versionOf(fields.text['version']) },
        deps,
      );
      return applied.ok
        ? { ok: true, importId: importId ?? '', clashCount: applied.value.clashCount }
        : { ok: false, code: applied.error.code, ...(importId ? { importId } : {}) };
    }
    case 'undo': {
      const undone = await undoFixtureImport(
        context,
        { importId, version: versionOf(fields.text['version']) },
        deps,
      );
      return undone.ok
        ? { ok: true, importId: importId ?? '' }
        : { ok: false, code: undone.error.code, ...(importId ? { importId } : {}) };
    }
    case 'discard': {
      const discarded = await discardFixtureImport(context, { importId }, deps);
      return discarded.ok
        ? { ok: true, importId: importId ?? '' }
        : { ok: false, code: discarded.error.code, ...(importId ? { importId } : {}) };
    }
  }
}
