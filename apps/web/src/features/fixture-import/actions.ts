'use server';
// The fixture import screen's server actions. Who is asking and which league come from the
// session and the address (loadLeaguePage), never from the form; the form only says which
// import and what to do, and carries the file. Each action sends the browser back to the
// screen with the import to show in the address and its answer in a one-time notice kept on
// the server (import-notice.ts, T-434), never in the address.
import { leagueUrl } from '@srleagues/core';
import { redirect } from 'next/navigation';
import { webPorts } from '../../server/container.ts';
import { commandContextOf } from '../../server/context.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { noticeHolderOf, savedNoticesHere } from '../../server/saved-notice.ts';
import { importSaid, noImport } from './import-notice.ts';
import {
  maxUploadBytes,
  runImportAction,
  type ImportAction,
  type ImportActionResult,
} from './run-import-action.ts';

async function act(action: ImportAction, form: FormData): Promise<never> {
  const text: Record<string, string> = {};
  let upload: File | undefined;
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') text[name] = value;
    else if (name === 'file') upload = value;
  }
  // The route's league value only finds the page again; the gate checks it against the
  // address the proxy wrote down, and the context below is built from that.
  const view = await loadLeaguePage(text['league'] ?? '', 'admin', 'schedule');
  const { fixtureImport } = await webPorts();
  const context = commandContextOf(view.context);
  const result: ImportActionResult = await (async () => {
    if (upload !== undefined && upload.size > maxUploadBytes) {
      return { ok: false, code: 'file-too-large' };
    }
    const file =
      upload === undefined || upload.size === 0
        ? undefined
        : { name: upload.name, text: await upload.text() };
    // Uploads go into the current season, and only its imports may be changed (as the page
    // shows only those).
    const season = await fixtureImport.currentSeasonOf(context.leagueId);
    return runImportAction(action, { text, file }, context, fixtureImport.deps, season?.id);
  })();
  const query = new URLSearchParams();
  const shown = result.importId;
  if (shown !== undefined && shown !== '') query.set('import', shown);
  const holder = noticeHolderOf(context);
  if (holder !== undefined) {
    savedNoticesHere().leave(holder, {
      screen: 'import',
      thing: shown === undefined || shown === '' ? noImport : shown,
      said: importSaid(result, action),
    });
  }
  const back = leagueUrl(view.context.league, 'admin-area', {
    area: 'schedule',
    subpath: ['import'],
  });
  const words = query.toString();
  return redirect(words === '' ? back : `${back}?${words}`);
}

export async function uploadFixturesAction(form: FormData): Promise<never> {
  return act('upload', form);
}
export async function applyImportAction(form: FormData): Promise<never> {
  return act('apply', form);
}
export async function undoImportAction(form: FormData): Promise<never> {
  return act('undo', form);
}
export async function discardImportAction(form: FormData): Promise<never> {
  return act('discard', form);
}
