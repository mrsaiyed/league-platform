// The venue and court of a game as one choice (the grid's and "Give it a new date"'s), its
// value as placeValue builds it.
import type { VenueWithCourts } from '@srleagues/core';
import { t } from '../../server/messages.ts';

export function PlaceSelect({
  venues,
  value,
}: {
  readonly venues: readonly VenueWithCourts[];
  readonly value: string;
}) {
  return (
    <select name="place" defaultValue={value} data-place-select="">
      <option value="">{t('schedule.admin.noPlaceOption')}</option>
      {venues.flatMap((v) => [
        <option key={v.id} value={`${v.id}|`}>
          {t('schedule.admin.venueOnly', { venue: v.name })}
        </option>,
        ...v.courts.map((c) => (
          <option key={c.id} value={`${v.id}|${c.name}`}>
            {t('schedule.admin.venueCourt', { venue: v.name, court: c.name })}
          </option>
        )),
      ])}
    </select>
  );
}
