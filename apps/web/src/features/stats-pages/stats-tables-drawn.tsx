// The statistics page's leaders and tables, drawn from their words (stats-tables-view.ts).
// Nothing here reads anything or has words of its own, so the page as everyone gets it and
// the signed-in request after it (step 2.46) are drawn by the same pieces, on the server
// and on the device alike.
import { EmptyPanel, LeaderCard, LeaderSpot, Section, SortableStatsTable } from '@srleagues/ui';
import type { StatsTableView, StatsTablesView } from './stats-tables-view.ts';

function StatsTable({
  table,
  view,
  foldTeam,
}: {
  readonly table: StatsTableView;
  readonly view: Extract<StatsTablesView, { kind: 'tables' }>;
  readonly foldTeam?: string;
}) {
  return (
    <Section title={table.title} note={table.note ?? undefined}>
      <SortableStatsTable
        caption={table.title}
        captionHidden
        columns={table.columns}
        rows={table.rows}
        initialSort={table.initialSort}
        locale={view.locale}
        labels={view.labels}
        emblems
        {...(foldTeam === undefined ? {} : { foldTeam: foldTeam })}
      />
    </Section>
  );
}

/** The leaders, the full table of players and the teams' totals. */
export function StatsTablesDrawn({ view }: { readonly view: StatsTablesView }) {
  if (view.kind === 'empty') {
    return <EmptyPanel text={view.text} action={view.action ?? undefined} />;
  }
  const { leaders } = view;
  return (
    <>
      <Section title={leaders.title} note={leaders.note ?? undefined}>
        {leaders.columns.length > 0 ? (
          <ul
            className="ui-spot-row stats-leaders"
            data-across={
              (['one', 'two', 'three'] as const)[Math.min(leaders.columns.length, 3) - 1]
            }
          >
            {leaders.columns.map((column) => (
              <li key={column.key} className="stats-leader">
                {column.card === null ? null : <LeaderSpot {...column.card} />}
                {column.entries.length === 0 ? null : (
                  <LeaderCard
                    title={column.title}
                    entries={column.entries}
                    afterLeader={column.card !== null}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyPanel text={leaders.noneText} />
        )}
      </Section>
      {/* What both tables' numbers count, said once above them: read on a phone before the
          players' table, and the two tables start level on a laptop. */}
      <p className="ui-section-note">{view.tableNote}</p>
      <div className="stats-tables" data-layout={view.sideBySide ? 'pair' : 'stack'}>
        <StatsTable table={view.players} view={view} foldTeam="team" />
        <StatsTable table={view.teams} view={view} />
      </div>
    </>
  );
}
