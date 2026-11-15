// The top of Admin → Schedule: the title, the season picker, the season's name and the
// page's intro, then what the page puts under the intro (step 2.160). The picker names
// only the seasons it is given: the page gives it what `scheduleAdmin.seasonsOf` lists for
// the holder, so a season not public yet is never named to someone who may not read its
// program's schedule.
import { displayLabels } from '@srleagues/site';
import { OptionPicker } from '@srleagues/ui';
import type { ReactNode } from 'react';
import { t } from '../../server/messages.ts';
import type { ScheduleSeason } from '../../server/schedule-admin.ts';

export function ScheduleHeading({
  seasons,
  season,
  action,
  children,
}: {
  /** The seasons the viewer may see, already filtered. */
  readonly seasons: readonly ScheduleSeason[];
  readonly season: ScheduleSeason;
  /** The schedule page's own address, from the address helper. */
  readonly action: string;
  readonly children?: ReactNode;
}) {
  const labels = displayLabels(t);
  return (
    <>
      <h1>{t('schedule.admin.title')}</h1>
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
      <p>{t('schedule.admin.seasonName', { name: season.name })}</p>
      <p>{t('schedule.admin.intro')}</p>
      {children}
    </>
  );
}
