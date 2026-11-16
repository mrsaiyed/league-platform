// The top of Admin → Schedule: the page's head (its title, one line of what it is for and,
// at the top right, what it lets you do), then the season picker with the season's name,
// then what the page puts under them (step 2.160; drawn by step 2.103). The picker names
// only the seasons it is given: the page gives it what `scheduleAdmin.seasonsOf` lists for
// the holder, so a season not public yet is never named to someone who may not read its
// program's schedule.
import { displayLabels } from '@srleagues/site';
import { OptionPicker, PageHead } from '@srleagues/ui';
import type { ReactNode } from 'react';
import { t } from '../../server/messages.ts';
import type { ScheduleSeason } from '../../server/schedule-admin.ts';

export function ScheduleHeading({
  seasons,
  season,
  action,
  actions,
  children,
}: {
  /** The seasons the viewer may see, already filtered. */
  readonly seasons: readonly ScheduleSeason[];
  readonly season: ScheduleSeason;
  /** The schedule page's own address, from the address helper. */
  readonly action: string;
  /** What the page lets you do, at the top right of its head. */
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
}) {
  const labels = displayLabels(t);
  return (
    <>
      <PageHead title={t('schedule.admin.title')} sub={t('schedule.admin.intro')}>
        {actions}
      </PageHead>
      <div className="admin-schedule-season">
        <OptionPicker
          name="season"
          label={labels.season}
          submitLabel={labels.show}
          action={action}
          value={season.slug}
          options={seasons.map((s) => ({
            value: s.slug,
            label: s.isPublic ? s.name : t('schedule.admin.seasonNotPublic', { name: s.name }),
          }))}
        />
        <p className="staff-quiet">{t('schedule.admin.seasonName', { name: season.name })}</p>
      </div>
      {children}
    </>
  );
}
