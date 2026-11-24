'use client';
// One game's own format in the admin's games area (step 2.119; P7 §5.1, S-35): the same
// panel and form as the tracker's start confirmation (game-format/), in the admin's look:
// an admin gives any game its own format before it is under way, and "Use the season's
// format" takes it away again. The page reads the format on the server and passes it in,
// with only the words the panel uses (T-187).
import type { GameFormatView } from '@srleagues/contracts';
import { translatorFrom, type Catalog } from '@srleagues/site';
import { useMemo } from 'react';
import {
  createGameFormatClient,
  GameFormatPanel,
  type FormatPanelLook,
} from '../game-format/index.ts';

const adminLook: FormatPanelLook = {
  section: 'staff-form',
  list: 'staff-list',
  quiet: 'staff-quiet',
  button: 'button',
  notice: 'staff-notice',
};

/** The words the panel uses: the tracker's format words, which the games area shares. */
export function formatWords(catalog: Catalog): Catalog {
  return Object.fromEntries(
    Object.entries(catalog).filter(([key]) => key.startsWith('tracker.format')),
  );
}

export function GameFormatSection({
  leagueId,
  gameId,
  locale,
  words,
  initial,
  title,
}: {
  readonly leagueId: string;
  readonly gameId: string;
  readonly locale: string;
  readonly words: Catalog;
  readonly initial: GameFormatView;
  readonly title: string;
}) {
  const t = useMemo(() => translatorFrom(locale, { [locale]: words }), [locale, words]);
  const client = useMemo(() => createGameFormatClient({ leagueId, gameId }), [leagueId, gameId]);
  return (
    <section className="staff-panel" aria-label={title} data-admin-format="">
      <h2>{title}</h2>
      <GameFormatPanel client={client} t={t} locale={locale} look={adminLook} initial={initial} />
    </section>
  );
}
