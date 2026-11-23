// League settings → Admins → Activity log (step 2.77, A-6, P4 §6): who changed what in the
// league and when, newest first, a page at a time, by one person, one kind of thing and
// between two days. The filters are a plain form whose choice stays in the address, so
// they work without scripts; "Older" and "Newer" carry it on. Each entry says who, what
// (the activity messages' sentence), when (in the league's time zone) and why when the
// entry keeps a reason; a season's status says what visitors see now; a removal leads to
// the bin while the thing is still there.
//
// Only the owner and the league's admins see it: League settings is refused to anyone
// else before anything is read (loadLeaguePage), the access list refuses a program's
// admin (access.list_access), and the log's own read refuses again (access.search_activity).
// Names are the ones the Admins page already shows (A-14), never an email address.
import {
  activityKinds,
  leagueUrl,
  listAccess,
  listBin,
  roles,
  searchActivity,
  type Role,
} from '@srleagues/core';
import { EmptyPanel, FilterToolbar, OptionPicker, PageHead } from '@srleagues/ui';
import { forbidden } from 'next/navigation';
import { commandContextOf } from '../../server/context.ts';
import { webPorts } from '../../server/container.ts';
import { loadLeaguePage } from '../../server/load-league-page.ts';
import { locale, t, type TextKey } from '../../server/messages.ts';
import { momentIn } from '../../server/stand-in-world-clock.ts';
import { StaffTrail } from '../staff/index.ts';
import { adminsView } from './access-view.ts';
import {
  dayAfter,
  logAskedOf,
  logLineOf,
  logQueryOf,
  type LogLine,
  type LogThingAsk,
} from './activity-log-view.ts';
import { logSentenceOf, whoChoicesOf } from './activity-log-words.ts';

/** Entries on one page: a list that grows is never read whole (DESIGN, step 2.77). */
const logPageSize = 20;

type Query = Readonly<Record<string, string | string[] | undefined>>;

const roleNames: readonly string[] = ['owner', ...roles];
const isRole = (value: string | undefined): value is Role | 'owner' =>
  value !== undefined && roleNames.includes(value);

/** A role's name, and that it is for one program when it is (as on the Admins page). */
const roleIn = (role: Role, program: boolean) =>
  program
    ? t('adminAccess.forOneProgram', { role: t(`role.${role}` as TextKey) })
    : t(`role.${role}` as TextKey);

export async function ActivityLogPage({
  league,
  query,
}: {
  readonly league: string;
  readonly query: Query;
}) {
  const view = await loadLeaguePage(league, 'admin', 'settings');
  const here = view.context.league;
  const context = commandContextOf(view.context);
  const ports = await webPorts();
  const listed = await listAccess(context, {}, ports.adminAccess.deps);
  if (!listed.ok) return forbidden();
  const clock = await ports.publicSchedule.clockOf(here.id);
  const asked = logAskedOf(query);
  const from = asked.from === undefined ? undefined : momentIn(asked.from, '00:00', clock.timeZone);
  const toEnd = asked.to === undefined ? undefined : dayAfter(asked.to);
  const until = toEnd === undefined ? undefined : momentIn(toEnd, '00:00', clock.timeZone);
  // The made-up world's transaction and the database's both read access and the log.
  const logDeps = ports.adminPeople.putBack;
  const [found, names, bin] = await Promise.all([
    searchActivity(
      context,
      {
        limit: logPageSize,
        ...(asked.who === undefined ? {} : { actor: asked.who }),
        ...(asked.kind === undefined ? {} : { kind: asked.kind }),
        ...(from === undefined ? {} : { from }),
        ...(until === undefined ? {} : { until }),
        ...(asked.before === undefined ? {} : { before: asked.before }),
        ...(asked.after === undefined ? {} : { after: asked.after }),
      },
      logDeps,
    ),
    ports.adminAccess.namesOf(here.id),
    listBin(context, {}, ports.adminPeople.putBack),
  ]);
  if (!found.ok) {
    if (found.error.code === 'not-allowed') return forbidden();
    throw new Error(`The activity log could not be read: ${found.error.code}`);
  }
  const people = adminsView({
    list: listed.value,
    names,
    activity: [],
    you: context.accountId,
  }).people;
  const binned = new Set(bin.ok ? bin.value.items.map((item) => item.id) : []);
  const lines = found.value.entries.map((entry) => logLineOf(entry, binned));
  // What the page's entries point at, named as they are now, in one read (step 2.77).
  const asks = lines.flatMap((line): LogThingAsk[] =>
    line.thing === undefined ? [] : [line.thing],
  );
  const named = new Map(
    (await ports.adminAccess.thingsNamed(here.id, context.accountId, asks)).map((thing) => [
      thing.id,
      thing,
    ]),
  );
  const times = { locale, timeZone: clock.timeZone };
  const sentenceOf = (line: LogLine) => {
    const role = line.values['role'];
    return logSentenceOf(line, isRole(role) ? t(`role.${role}` as TextKey) : '', named, times);
  };
  const unclear = new Set(asked.unclear ?? []);
  const page = leagueUrl(here, 'admin-area', { area: 'settings', subpath: ['activity'] });
  const binPage = leagueUrl(here, 'admin-area', { area: 'settings', subpath: ['bin'] });
  const pageWith = (more?: Parameters<typeof logQueryOf>[1]) =>
    leagueUrl(here, 'admin-area', {
      area: 'settings',
      subpath: ['activity'],
      query: logQueryOf(asked, more),
    });
  /** The filters already chosen, but for the ones a form itself asks. */
  const keepBut = (...asks: readonly string[]) =>
    Object.fromEntries(Object.entries(logQueryOf(asked)).filter(([name]) => !asks.includes(name)));
  const when = new Intl.DateTimeFormat(locale, {
    timeZone: clock.timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const filtered =
    asked.who !== undefined ||
    asked.kind !== undefined ||
    asked.from !== undefined ||
    asked.to !== undefined;
  const whoOf = (line: LogLine) => {
    if (line.actorAccountId === null) return t('adminAccess.log.system');
    const name = names.get(line.actorAccountId);
    if (name === undefined) return t('adminAccess.activity.someone');
    return name ?? t('adminAccess.noName');
  };
  const { older, newer } = found.value;
  return (
    <main className="admin-access">
      <StaffTrail
        steps={[
          {
            href: leagueUrl(here, 'admin-area', { area: 'settings' }),
            label: t('admin.area.settings'),
          },
          {
            href: leagueUrl(here, 'admin-area', { area: 'settings', subpath: ['admins'] }),
            label: t('adminAccess.title'),
          },
        ]}
        here={t('adminAccess.log.title')}
      />
      <PageHead title={t('adminAccess.log.title')} sub={t('adminAccess.log.intro')} />

      {/* DESIGN 15: with scripts on a choice applies at once; "Show" is for scripts off. */}
      <FilterToolbar label={t('adminAccess.log.filters')}>
        <OptionPicker
          id="log-who"
          name="who"
          label={t('adminAccess.log.who')}
          submitLabel={t('adminAccess.log.filter')}
          action={page}
          value={asked.who ?? ''}
          keep={keepBut('who')}
          options={[
            { value: '', label: t('adminAccess.log.any') },
            ...whoChoicesOf(people, roleIn),
          ]}
        />
        <OptionPicker
          id="log-kind"
          name="kind"
          label={t('adminAccess.log.kind')}
          submitLabel={t('adminAccess.log.filter')}
          action={page}
          value={asked.kind ?? ''}
          keep={keepBut('kind')}
          options={[
            { value: '', label: t('adminAccess.log.anyKind') },
            ...activityKinds.map((kind) => ({
              value: kind,
              label: t(`adminAccess.log.kind.${kind}`),
            })),
          ]}
        />
      </FilterToolbar>
      <form method="get" action={page} className="activity-log-days" data-log-days="">
        {Object.entries(keepBut('from', 'to')).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label>
          {t('adminAccess.log.from')}
          <input
            type="date"
            name="from"
            defaultValue={asked.from ?? ''}
            {...(unclear.has('from') ? { 'aria-describedby': 'log-from-unclear' } : {})}
          />
        </label>
        {unclear.has('from') ? (
          <span id="log-from-unclear" className="ui-notice" data-kind="error">
            {t('adminAccess.log.dateUnclear')}
          </span>
        ) : null}
        <label>
          {t('adminAccess.log.to')}
          <input
            type="date"
            name="to"
            defaultValue={asked.to ?? ''}
            {...(unclear.has('to') ? { 'aria-describedby': 'log-to-unclear' } : {})}
          />
        </label>
        {unclear.has('to') ? (
          <span id="log-to-unclear" className="ui-notice" data-kind="error">
            {t('adminAccess.log.dateUnclear')}
          </span>
        ) : null}
        <button type="submit" className="ui-button" data-kind="quiet">
          {t('adminAccess.log.filter')}
        </button>
      </form>
      {filtered ? (
        <p>
          <a href={page}>{t('adminAccess.log.clear')}</a>
        </p>
      ) : null}

      {lines.length === 0 ? (
        <EmptyPanel
          text={
            filtered || asked.before !== undefined || asked.after !== undefined
              ? t('adminAccess.log.none')
              : t('adminAccess.log.noneAtAll')
          }
        />
      ) : (
        <ul className="staff-rows" data-activity-log="">
          {lines.map((line) => (
            <li key={line.id} className="staff-row" data-entry={line.summary}>
              <span className="staff-row-words">
                <span className="staff-row-name" dir="auto">
                  {whoOf(line)}
                </span>
                <span className="staff-row-facts">
                  {sentenceOf(line)}
                  {line.seasonStatus === undefined
                    ? null
                    : ` ${t(`adminAccess.log.season.${line.seasonStatus}` as TextKey)}`}
                </span>
                <span className="staff-row-facts">
                  <time dateTime={line.at}>{when.format(new Date(line.at))}</time>
                </span>
                {line.reason === undefined ? null : (
                  <span className="staff-row-facts" dir="auto">
                    {t('adminAccess.log.reason', { reason: line.reason })}
                  </span>
                )}
                {line.inBin === undefined ? null : (
                  <a href={`${binPage}#bin-${line.inBin}`}>{t('adminAccess.log.binLink')}</a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {older === null && newer === null ? null : (
        <nav className="activity-log-pages" aria-label={t('adminAccess.log.pages')}>
          {newer === null ? null : (
            <a className="ui-button" rel="prev" href={pageWith({ after: newer })}>
              {t('adminAccess.log.newer')}
            </a>
          )}
          {older === null ? null : (
            <a className="ui-button" rel="next" href={pageWith({ before: older })}>
              {t('adminAccess.log.older')}
            </a>
          )}
        </nav>
      )}
    </main>
  );
}
