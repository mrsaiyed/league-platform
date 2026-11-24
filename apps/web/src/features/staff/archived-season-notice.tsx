// The one read-only notice of an archived season's admin pages (step 2.130, O-12): Teams,
// a team, Divisions and Schedule say it in place of the buttons the server would refuse.
import { t } from '../../server/messages.ts';

export function ArchivedSeasonNotice({ season }: { readonly season: string }) {
  return (
    <div className="ui-notice" data-season-read-only="">
      <p>{t('seasonSettings.readOnlyNotice', { season })}</p>
    </div>
  );
}
