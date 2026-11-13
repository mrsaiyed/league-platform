// packages/ui: presentational pieces, styled only through the league's design values (T-90).
// No data fetching and no knowledge of leagues (T2 §2). Used only through this file.
// The stylesheet is the text `displayCss`.
export { displayCss } from './src/display-css.ts';
export * from './src/live-marker/live-marker.tsx';
export * from './src/game-card/game-card.tsx';
export * from './src/scoreboard/scoreboard.tsx';
export * from './src/standings-table/standings-table.tsx';
export * from './src/box-score-table/box-score-table.tsx';
export * from './src/stats-table/sortable-stats-table.tsx';
export * from './src/stats-table/sort-stat-rows.ts';
export * from './src/pickers/option-picker.tsx';
export { safeColor } from './src/team-color.ts';
