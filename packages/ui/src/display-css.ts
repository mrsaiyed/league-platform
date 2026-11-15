// The shared display pieces' stylesheet as text, so the package is used only through its
// index (T-22). A page puts it in one style block, as it does the design variables.
// Written as text, not as a stylesheet file, so no loader is needed in the browser build.
// Each part is in its own file under ./styles.
//
// The look of the shared display pieces. Every color, font, corner and space comes from the
// design's variables (T-90); nothing here names a league. Logical properties only (start,
// end, inline, block), so right-to-left pages mirror themselves (T-188). Movement stops for
// readers who ask for less of it.
import { baseCss } from './styles/base-css.ts';
import { cardsCss } from './styles/cards-css.ts';
import { gameCss } from './styles/game-css.ts';
import { layoutCss } from './styles/layout-css.ts';
import { pickerCss } from './styles/picker-css.ts';
import { tableCss } from './styles/table-css.ts';

export const displayCss = [baseCss, layoutCss, gameCss, tableCss, pickerCss, cardsCss].join('');
