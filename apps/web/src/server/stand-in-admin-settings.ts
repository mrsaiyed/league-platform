// THE ADMIN LEAGUE SETTINGS SCREEN'S LOCAL STAND-IN. FOR LOCAL WORK AND TESTS ONLY.
//
// League settings (step 2.48) on the one made-up world (stand-in-world.ts): the real
// settings commands run on its rows, and every other area reads the same rows, so a
// setting the admin saves takes effect: who may score (the games area and the tracker),
// the start page for members (the league home), how names show (every public page) and
// the statistics settings (Admin → Teams). Every rule (who may change a setting, its
// limits, the version check) is the product's own: only the storage is made up.
//
// Gone when the database's leagues store is wired to the web app.
import type { AdminSettingsPorts } from './admin-settings.ts';
import type { World } from './stand-in-world.ts';

export function standInAdminSettings(world: World): AdminSettingsPorts {
  return { deps: world.deps };
}
