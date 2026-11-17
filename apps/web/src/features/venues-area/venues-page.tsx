// Admin → Schedule → Venues (step 2.49; P7 §4.1 "Where", P4 §3): the league's venues and
// their courts, to add, rename, put in order and remove. For whoever builds the schedule (a
// scheduler, an admin, the owner), a few times a season, on a phone. Each venue is a panel:
// its name, where it is, how many games it has, its own form, its courts (each with its
// name, a place up or down and its removal), a box to add a court, and its own removal.
//
// What removing does is said before anything is ticked: a court or venue with games still
// to come is not removed (the screen says how many and points to Schedule, with no button
// that could only be refused, A-17 as changed); games already played keep its name. A
// venue goes once it has no courts. Removing asks first (a tick) and is answered "Removed:
// Court 2." with "Put it back" for those who may bring things back from the bin (A-5).
//
// The venues and their games are read through the scheduling module's own commands
// (listVenues, countPlaceGames), in the league of the session. Every form is a plain post
// that works with scripts off; a refusal keeps what was typed beside the box (record 067).
import {
  allows,
  countPlaceGames,
  leagueUrl,
  listVenues,
  type CourtRecord,
  type PlaceGames,
  type VenueGames,
  type VenueWithCourts,
} from '@srleagues/core';
import { EmptyPanel, PageHead } from '@srleagues/ui';
import { randomUUID } from 'node:crypto';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { t, type TextKey } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import type { SavedNotice } from '../../server/saved-notice.ts';
import { ListForm, SaidLine, takeNotice, type ListField } from '../list-forms/index.ts';
import { StaffNotice, StaffTrail } from '../staff/index.ts';
import {
  createCourtAction,
  createVenueAction,
  moveCourtAction,
  removeCourtAction,
  removeVenueAction,
  restoreCourtAction,
  restoreVenueAction,
  saveCourtAction,
  saveVenueAction,
} from './actions.ts';
import { venueProblemKey } from './venue-answers.ts';
import {
  addVenueAnchor,
  courtAnchor,
  venueAnchor,
  venuesAddress,
  venuesListAnchor,
} from './venues-address.ts';

type Hidden = (more?: Readonly<Record<string, string>>) => Record<string, string>;
const noGames: PlaceGames = { played: 0, toCome: 0, inDraft: 0 };

/** `/{league}/admin/schedule/venues`: the league's venues and courts. */
export async function VenuesPage({ league }: { readonly league: string }) {
  const view = await loadLeaguePage(league, 'admin', 'schedule');
  const addressee = view.context.league;
  const ports = await webPorts();
  const context = commandContextOf(view.context);
  const holder = await ports.accessOf(context);
  const deps = ports.scheduleAdmin.deps;
  const [listed, counted] = await Promise.all([
    listVenues(context, {}, deps),
    countPlaceGames(context, {}, deps),
  ]);
  const notice = takeNotice(context, 'venues');
  const page = venuesAddress(addressee);
  const schedule = leagueUrl(addressee, 'admin-area', { area: 'schedule' });
  // A fresh one-time token for each form as it is drawn (server/same-request.ts).
  const hidden: Hidden = (more = {}) => ({
    league: addressee.slug,
    ...more,
    [requestTokenField]: randomUUID(),
  });
  const mayPutBack = holder !== undefined && allows(holder, 'bin.restore', { type: 'league' });
  const venues = listed.ok ? listed.value : [];
  const games = counted.ok ? counted.value : [];
  const removedVenue = notice?.said === 'removed' ? notice : undefined;
  return (
    <main className="admin-schedule admin-venues">
      <StaffTrail
        steps={[{ href: schedule, label: t('admin.area.schedule') }]}
        here={t('adminVenues.title')}
      />
      <PageHead title={t('adminVenues.title')} sub={t('adminVenues.intro')}>
        <a className="ui-button" data-kind="main" data-icon="plus" href={`#${addVenueAnchor}`}>
          {t('adminVenues.add.title')}
        </a>
      </PageHead>
      <div id={venuesListAnchor} aria-label={t('adminVenues.list')} role="region">
        {removedVenue === undefined ? null : (
          <SaidLine kind="removed">
            <p>{t('adminVenues.said.removed', { name: removedVenue.name ?? '' })}</p>
            {mayPutBack ? (
              <ListForm
                name="put-back"
                label={t('adminVenues.putBack.label', { name: removedVenue.name ?? '' })}
                action={restoreVenueAction}
                permalink={`${page}#${venuesListAnchor}`}
                hidden={hidden({ venue: removedVenue.thing })}
                button={t('adminVenues.putBack.submit')}
              />
            ) : (
              <p>{t('adminVenues.noWayBack')}</p>
            )}
          </SaidLine>
        )}
        {!listed.ok ? (
          <StaffNotice kind="refused">
            <p>{t(venueProblemKey(listed.error.code, 'other'))}</p>
          </StaffNotice>
        ) : venues.length === 0 ? (
          <EmptyPanel
            text={t('adminVenues.none')}
            action={{ href: `#${addVenueAnchor}`, label: t('adminVenues.add.title') }}
          />
        ) : null}
      </div>
      {venues.map((venue) => (
        <VenuePanel
          key={venue.id}
          venue={venue}
          games={games.find((g) => g.venueId === venue.id)}
          notice={notice}
          page={page}
          schedule={schedule}
          hidden={hidden}
          mayPutBack={mayPutBack}
        />
      ))}
      <section id={addVenueAnchor} className="staff-panel" aria-labelledby="add-venue-title">
        <h2 id="add-venue-title">{t('adminVenues.add.title')}</h2>
        <ListForm
          name="add-venue"
          label={t('adminVenues.add.title')}
          action={createVenueAction}
          permalink={`${page}#${addVenueAnchor}`}
          hidden={hidden()}
          fields={venueFields({ name: '', address: null, mapLink: null })}
          button={t('adminVenues.add.submit')}
        />
      </section>
    </main>
  );
}

function venueFields(
  venue: Pick<VenueWithCourts, 'name' | 'address' | 'mapLink'>,
): readonly ListField[] {
  return [
    {
      kind: 'text',
      name: 'name',
      label: t('adminVenues.field.name'),
      value: venue.name,
      required: true,
      maxLength: 120,
      help: t('adminVenues.field.nameHelp'),
    },
    {
      kind: 'text',
      name: 'address',
      label: t('adminVenues.field.address'),
      value: venue.address ?? '',
      maxLength: 300,
      help: t('adminVenues.field.addressHelp'),
    },
    {
      kind: 'url',
      name: 'mapLink',
      label: t('adminVenues.field.mapLink'),
      value: venue.mapLink ?? '',
      maxLength: 2000,
      help: t('adminVenues.field.mapLinkHelp'),
    },
  ];
}

const courtField = (value: string): ListField => ({
  kind: 'text',
  name: 'name',
  label: t('adminVenues.court.field.name'),
  value,
  required: true,
  maxLength: 120,
  help: t('adminVenues.court.field.nameHelp'),
});

function VenuePanel({
  venue,
  games,
  notice,
  page,
  schedule,
  hidden,
  mayPutBack,
}: {
  readonly venue: VenueWithCourts;
  readonly games: VenueGames | undefined;
  readonly notice: SavedNotice | undefined;
  readonly page: string;
  readonly schedule: string;
  readonly hidden: Hidden;
  readonly mayPutBack: boolean;
}) {
  const name = venue.name;
  const anchor = venueAnchor(venue.id);
  const permalink = `${page}#${anchor}`;
  const counts = games ?? noGames;
  const venueSaid =
    notice?.thing === venue.id && ['created', 'saved', 'restored'].includes(notice.said)
      ? (`adminVenues.said.${notice.said}` as TextKey)
      : undefined;
  const courtRemoved =
    notice?.said === 'courtRemoved' && notice.thing.startsWith(`${venue.id}/`)
      ? { courtId: notice.thing.slice(venue.id.length + 1), name: notice.name ?? '' }
      : undefined;
  return (
    <section
      id={anchor}
      className="staff-panel admin-venue"
      data-venue={name}
      aria-labelledby={`${anchor}-name`}
    >
      <div className="staff-panel-head">
        <h2 id={`${anchor}-name`} dir="auto">
          {name}
        </h2>
      </div>
      {venue.address === null && venue.mapLink === null ? null : (
        <p className="staff-quiet">
          {venue.address === null ? null : <span dir="auto">{venue.address}</span>}
          {venue.address !== null && venue.mapLink !== null ? ' · ' : null}
          {venue.mapLink === null ? null : (
            <a href={venue.mapLink} rel="noopener noreferrer" target="_blank">
              {t('adminVenues.mapLink')}
            </a>
          )}
        </p>
      )}
      <p className="staff-quiet" data-venue-games={`${counts.played}/${counts.toCome}`}>
        {counts.played === 0 && counts.toCome === 0
          ? t('adminVenues.gamesNone')
          : t('adminVenues.games', { played: counts.played, toCome: counts.toCome })}
      </p>
      {venueSaid === undefined ? null : (
        <SaidLine kind="saved">
          <p>{t(venueSaid, { name })}</p>
        </SaidLine>
      )}
      <ListForm
        name="change-venue"
        label={t('adminVenues.change.label', { name })}
        action={saveVenueAction}
        permalink={permalink}
        hidden={hidden({ venue: venue.id, version: String(venue.version) })}
        fields={venueFields(venue)}
        button={t('adminVenues.change.submit')}
      />
      <h3>{t('adminVenues.courts')}</h3>
      {courtRemoved === undefined ? null : (
        <SaidLine kind="removed">
          <p>{t('adminVenues.said.courtRemoved', { name: courtRemoved.name })}</p>
          {mayPutBack ? (
            <ListForm
              name="put-back-court"
              label={t('adminVenues.putBack.label', { name: courtRemoved.name })}
              action={restoreCourtAction}
              permalink={permalink}
              hidden={hidden({ court: courtRemoved.courtId })}
              button={t('adminVenues.putBack.submit')}
            />
          ) : (
            <p>{t('adminVenues.noWayBack')}</p>
          )}
        </SaidLine>
      )}
      {venue.courts.length === 0 ? (
        <p className="staff-quiet">{t('adminVenues.court.none')}</p>
      ) : (
        venue.courts.map((court, place) => (
          <CourtPart
            key={court.id}
            venue={venue}
            court={court}
            place={place}
            games={games?.courts[court.id] ?? noGames}
            notice={notice?.thing === court.id ? notice : undefined}
            page={page}
            schedule={schedule}
            hidden={hidden}
          />
        ))
      )}
      <div className="admin-venue-add-court">
        <h4>{t('adminVenues.court.add.title')}</h4>
        <ListForm
          name="add-court"
          label={t('adminVenues.court.add.label', { venue: name })}
          action={createCourtAction}
          permalink={permalink}
          hidden={hidden({ venue: venue.id })}
          fields={[courtField('')]}
          button={t('adminVenues.court.add.submit')}
        />
      </div>
      <div className="admin-venue-remove" data-kind="danger">
        {venue.courts.length > 0 ? (
          <p data-held="courts">{t('adminVenues.heldByCourts', { name })}</p>
        ) : counts.toCome > 0 ? (
          <p data-held="games">
            {t.plural('adminVenues.heldByGames', counts.toCome, { name })}{' '}
            <a href={schedule}>{t('adminVenues.toSchedule')}</a>
          </p>
        ) : (
          <>
            <p className="staff-quiet">
              {t(counts.played > 0 ? 'adminVenues.remove.played' : 'adminVenues.remove.body')}
            </p>
            <ListForm
              name="remove-venue"
              label={t('adminVenues.remove.label', { name })}
              action={removeVenueAction}
              permalink={`${page}#${venuesListAnchor}`}
              hidden={hidden({ venue: venue.id })}
              confirm={t('adminVenues.remove.confirm', { name })}
              button={t('adminVenues.remove.submit')}
              kind="danger"
            />
          </>
        )}
      </div>
    </section>
  );
}

function CourtPart({
  venue,
  court,
  place,
  games,
  notice,
  page,
  schedule,
  hidden,
}: {
  readonly venue: VenueWithCourts;
  readonly court: CourtRecord;
  readonly place: number;
  readonly games: PlaceGames;
  readonly notice: SavedNotice | undefined;
  readonly page: string;
  readonly schedule: string;
  readonly hidden: Hidden;
}) {
  const name = court.name;
  const anchor = courtAnchor(court.id);
  const permalink = `${page}#${anchor}`;
  const said = notice === undefined ? undefined : (`adminVenues.said.${notice.said}` as TextKey);
  const move = (direction: 'up' | 'down') => (
    <ListForm
      name={`move-${direction}`}
      label={t(`adminVenues.court.move.${direction}Label`, { name })}
      action={moveCourtAction}
      permalink={permalink}
      hidden={hidden({ venue: venue.id, court: court.id, direction })}
      button={t(`adminVenues.move.${direction}`)}
      kind="quiet"
    />
  );
  return (
    <div id={anchor} className="admin-court" data-court={name}>
      <h4 dir="auto">{name}</h4>
      {said === undefined ? null : (
        <SaidLine kind="saved">
          <p>{t(said, { name })}</p>
        </SaidLine>
      )}
      <ListForm
        name="change-court"
        label={t('adminVenues.court.change.label', { name })}
        action={saveCourtAction}
        permalink={permalink}
        hidden={hidden({ court: court.id, version: String(court.version) })}
        fields={[courtField(name)]}
        button={t('adminVenues.change.submit')}
      />
      <p className="staff-quiet" data-court-games={`${games.played}/${games.toCome}`}>
        {games.played === 0 && games.toCome === 0
          ? t('adminVenues.court.gamesNone')
          : t('adminVenues.court.games', { played: games.played, toCome: games.toCome })}
        {games.inDraft === 0 ? null : <> {t.plural('adminVenues.court.inDraft', games.inDraft)}</>}
      </p>
      {venue.courts.length < 2 ? null : (
        <div className="staff-actions">
          {place > 0 ? move('up') : null}
          {place < venue.courts.length - 1 ? move('down') : null}
        </div>
      )}
      {games.toCome > 0 ? (
        <p data-held="games">
          {t.plural('adminVenues.court.heldByGames', games.toCome, { name })}{' '}
          <a href={schedule}>{t('adminVenues.toSchedule')}</a>
        </p>
      ) : (
        <>
          <p className="staff-quiet">
            {t(
              games.played > 0
                ? 'adminVenues.court.remove.played'
                : 'adminVenues.court.remove.body',
            )}
          </p>
          <ListForm
            name="remove-court"
            label={t('adminVenues.court.remove.label', { name })}
            action={removeCourtAction}
            permalink={`${page}#${venueAnchor(venue.id)}`}
            hidden={hidden({ venue: venue.id, court: court.id })}
            confirm={t('adminVenues.court.remove.confirm', { name })}
            button={t('adminVenues.court.remove.submit')}
            kind="danger"
          />
        </>
      )}
    </div>
  );
}
