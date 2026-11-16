// The staff area's line icons (step 2.103): one beside each item of the menu and each
// area's card on the home. Drawn as part of the page, in the color of the words beside
// them, and silent: the word beside an icon says everything.
import type { AdminArea } from '@srleagues/core';

export type StaffIconName = 'home' | AdminArea | 'site-out' | 'account' | 'sign-out';

/** Each icon as the paths of a 24 by 24 drawing, stroked, never filled. */
const drawings: Readonly<Record<StaffIconName, readonly string[]>> = {
  home: ['M4 11.2 12 4.5l8 6.7V20h-5.2v-5.2H9.2V20H4z'],
  registration: ['M9 3.8h6v3H9z', 'M9 5.3H5.5V20.2h13V5.3H15', 'M9 11.5h6', 'M9 15.5h4'],
  people: [
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'M3.5 19.5c0-3 2.4-5 5.5-5s5.5 2 5.5 5',
    'M15.5 5.3a3 3 0 0 1 0 5.6',
    'M17.2 14.8c2 .6 3.3 2.3 3.3 4.7',
  ],
  teams: ['M12 3.5 5 6v5.6c0 4.2 2.9 7.3 7 8.9 4.1-1.6 7-4.7 7-8.9V6z', 'M9.5 9.5h5'],
  schedule: ['M4.5 6.3h15V20h-15z', 'M4.5 10.5h15', 'M8.5 4v4', 'M15.5 4v4'],
  games: [
    'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17z',
    'M3.5 12h17',
    'M12 3.5v17',
    'M6.2 5.8c2.6 3.4 2.6 9 0 12.4',
    'M17.8 5.8c-2.6 3.4-2.6 9 0 12.4',
  ],
  standings: ['M3.5 20h17', 'M6.5 20v-7', 'M12 20V5', 'M17.5 20v-10'],
  site: ['M4 5.5h16v13H4z', 'M4 9.5h16', 'M6.8 7.5h.4', 'M9.3 7.5h.4'],
  messages: ['M4 6.5h16v11H4z', 'm4.5 7 7.5 6 7.5-6'],
  season: [
    'M4.5 7h9',
    'M17.5 7h2',
    'M15.5 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'M4.5 17h2',
    'M10.5 17h9',
    'M8.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'M4.5 12h15',
  ],
  settings: [
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
    'M12 3.5v2.3',
    'M12 18.2v2.3',
    'M3.5 12h2.3',
    'M18.2 12h2.3',
    'm6 6 1.6 1.6',
    'm16.4 16.4 1.6 1.6',
    'm6 18 1.6-1.6',
    'm16.4 7.6 1.6-1.6',
  ],
  'site-out': ['M14 4.5h5.5V10', 'm19.5 4.5-8 8', 'M11 6H5v13h13v-6'],
  account: ['M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M5 20c0-3.6 3-6 7-6s7 2.4 7 6'],
  'sign-out': ['M10 4.5H5v15h5', 'm14.5 8.5 3.5 3.5-3.5 3.5', 'M18 12H9.5'],
};

export function StaffIcon({ name }: { readonly name: StaffIconName }) {
  return (
    <svg className="staff-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {drawings[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
