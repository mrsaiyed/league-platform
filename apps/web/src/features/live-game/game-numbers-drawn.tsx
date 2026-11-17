// A game page's box scores and play-by-play, drawn from their words (game-numbers-view.ts).
// Nothing here reads anything or has words of its own, so the page as everyone gets it and
// the signed-in request after it (step 2.46) are drawn by the same pieces, on the server
// and on the device alike.
import { BoxScoreTable, EmptyPanel, PlayTable } from '@srleagues/ui';
import { playsId, type GameNumbersView } from './game-numbers-view.ts';
import { NewerPlaysLink } from './newer-plays-link.tsx';

type Tables = Extract<NonNullable<GameNumbersView['boxScores']>['body'], { kind: 'tables' }>;

/** Both teams' box scores, away team first, their names given the same room. */
function BoxScoreTables({ body }: { readonly body: Tables }) {
  return (
    <div className="game-tables">
      {body.tables.map((table) => (
        <BoxScoreTable
          key={table.side}
          teamName={table.teamName}
          columns={table.columns}
          players={table.players}
          totals={table.totals}
          hiddenNotice={body.hiddenNotice}
          labels={body.labels}
          nameRoom={body.nameRoom}
        />
      ))}
    </div>
  );
}

export function GameNumbersDrawn({ view }: { readonly view: GameNumbersView }) {
  const { boxScores, plays } = view;
  return (
    <>
      {boxScores === null ? null : (
        <section className="ui-section" aria-labelledby="game-box-scores">
          <div className="ui-section-head">
            <h2 id="game-box-scores">{boxScores.title}</h2>
          </div>
          {boxScores.body.kind === 'panel' ? (
            <EmptyPanel text={boxScores.body.text} />
          ) : (
            <BoxScoreTables body={boxScores.body} />
          )}
        </section>
      )}
      {plays === null ? null : (
        <section className="ui-section" aria-labelledby={playsId}>
          <div className="ui-section-head">
            <h2 id={playsId}>{plays.title}</h2>
            {/* The way to newer plays stands beside the title, drawn as every way on is (in
                the color the eye lands on, with its arrow), not as a link inside a sentence. */}
            {plays.newer === null ? null : (
              <NewerPlaysLink className="ui-more" href={plays.newer.href}>
                {plays.newer.label}
              </NewerPlaysLink>
            )}
          </div>
          {plays.newer === null ? null : <p className="ui-section-note">{plays.newer.note}</p>}
          {plays.periods.length === 0 ? (
            <EmptyPanel text={plays.noneText} />
          ) : (
            <div className="game-tables">
              {plays.periods.map((period) => (
                <PlayTable
                  key={period.key}
                  title={period.title}
                  rows={period.rows}
                  labels={plays.labels}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
