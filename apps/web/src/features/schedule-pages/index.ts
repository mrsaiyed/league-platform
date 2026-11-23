// The public home and schedule pages (step 2.42). Used only through this file.
export { HomePage } from './home-page.tsx';
export { SchedulePage } from './schedule-page.tsx';
export { GameList, scoringAddressOf } from './schedule-views.tsx';
// "Score this game" for the signed-in person who may, read after the page (step 2.153).
export { GameCorrection, GameOffer } from './score-game-button.tsx';
export { offersAskedAtOnce, type ScoringOfferReply } from './scoring-offers.ts';
export { LatestResults } from './latest-results.tsx';
export {
  buildHomeGames,
  buildScheduleView,
  comingOrder,
  gameView,
  placeOf,
  type GameView,
} from './build-schedule.ts';
