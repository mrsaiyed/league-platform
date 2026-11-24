'use client';
// The start confirmation's format (step 2.119; S-35, S-39): every rule, and "Change the
// format" where this scorekeeper may, in the court's look. Once a change is saved the
// controller reads the game's state again, so the clock, the periods and the bonus on
// the device follow the new rules as the server's next batch does; the confirmation then
// asks about the new format. "Confirm and start scoring" is the panel's, so it reads the
// format again before it starts (T-344).
import type { GameFormatRules } from '@srleagues/contracts';
import type { Translate } from '@srleagues/site';
import { useMemo, type ReactNode } from 'react';
import {
  createGameFormatClient,
  GameFormatPanel,
  type FormatPanelLook,
  type StartConfirm,
} from '../game-format/index.ts';
import type { GameFormat } from './opened-game-storage.ts';

/** Whether a format is the one this device plays (the parts the device confirms). */
export const playsFormat =
  (device: GameFormat) =>
  (format: GameFormatRules): boolean =>
    device.periods === format.gameFormat.periods &&
    device.periodSeconds === format.gameFormat.periodSeconds &&
    device.overtimeSeconds === format.gameFormat.overtimeSeconds &&
    device.clockMode === format.clock.mode;

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
  confirm,
}: {
  readonly leagueId: string;
  readonly gameId: string;
  readonly t: Translate;
  readonly locale: string;
  readonly fallback: ReactNode;
  readonly onChanged: () => Promise<void>;
  readonly confirm: StartConfirm;
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
      confirm={confirm}
    />
  );
}
