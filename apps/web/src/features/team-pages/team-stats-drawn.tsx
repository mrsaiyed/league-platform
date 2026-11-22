// A team's statistics, drawn from their words (team-stats-view.ts). Nothing here reads
// anything or has words of its own, so the team page as everyone gets it and the signed-in
// request after it (step 2.46) are drawn by the same pieces, on the server and on the device.
//
// The totals are a strip of big numbers under their small label, never a table of one row
// the width of the page: a few in one line, many wrapping onto a second (the strip's own
// doing). With few statistics the totals and the players' table stand side by side on a
// laptop, so a row's numbers stay near its name; with many each takes the page's width.
import { EmptyPanel, SortableStatsTable, StatStrip } from '@srleagues/ui';
import type { TeamStatsDrawnView } from './team-stats-view.ts';

export function TeamStatsDrawn({ view }: { readonly view: TeamStatsDrawnView }) {
  if (view.kind === 'none') return <EmptyPanel text={view.text} />;
  const players =
    view.players === null ? null : (
      <SortableStatsTable
        caption={view.players.caption}
        columns={view.players.columns}
        rows={view.players.rows}
        initialSort={view.players.initialSort}
        locale={view.locale}
        labels={view.labels}
        emblems
      />
    );
  return (
    <div className="team-stats" data-layout={view.beside && players !== null ? 'pair' : 'stack'}>
      {view.totals.length === 0 ? null : (
        <div className="team-totals">
          <p className="ui-eyebrow">{view.totalsLabel}</p>
          <StatStrip label={view.totalsLabel} items={view.totals} />
          {view.totalsOnlyNote === null ? null : (
            <p className="ui-section-note">{view.totalsOnlyNote}</p>
          )}
          {view.totalsNote === null ? null : <p className="ui-section-note">{view.totalsNote}</p>}
        </div>
      )}
      {players}
    </div>
  );
}
