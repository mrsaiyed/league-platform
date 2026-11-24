'use client';
// The start confirmation's format (step 2.119; S-35, S-39): every rule, and "Change the
// format" where this scorekeeper may, in the court's look. Once a change is saved the
// controller reads the game's state again, so the clock, the periods and the bonus on
// the device follow the new rules as the server's next batch does; the confirmation then
// asks about the new format.
import type { Translate } from '@srleagues/site';
import { useMemo, type ReactNode } from 'react';
import {
  createGameFormatClient,
  GameFormatPanel,
  type FormatPanelLook,
} from '../game-format/index.ts';

const courtLook: FormatPanelLook = {
  section: 'court-stack',
  list: 'court-format',
  quiet: 'court-quiet',
  button: 'court-button',
  notice: 'court-notice',
};

export function TrackerFormatPanel({
  leagueId,
  gameId,
  t,
  locale,
  fallback,
  onChanged,
}: {
  readonly leagueId: string;
  readonly gameId: string;
  readonly t: Translate;
  readonly locale: string;
  readonly fallback: ReactNode;
  readonly onChanged: () => Promise<void>;
}) {
  const client = useMemo(() => createGameFormatClient({ leagueId, gameId }), [leagueId, gameId]);
  return (
    <GameFormatPanel
      client={client}
      t={t}
      locale={locale}
      look={courtLook}
      fallback={fallback}
      onChanged={onChanged}
    />
  );
}
