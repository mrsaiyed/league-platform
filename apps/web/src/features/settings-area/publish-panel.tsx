// The Publish part at the top of League settings (step 2.240, U-9, P3 §3): whether the
// league is a draft and what that means, the "Must fix" list with each item met or not and
// where it is put right, and a Publish button that asks once. The asking is a page of its
// own state (`?publish=ask`), so it works the same with scripts on or off; the form then
// posts to publishLeagueAction, which runs the command with its own checks again.
import type { LeagueStatus, PublishCheck, PublishCheckKey } from '@srleagues/core';
import { t, type TextKey } from '../../server/messages.ts';
import { publishLeagueAction } from './actions.ts';

/** Where each item is put right on this page, when it can be put right here. */
const cures: Readonly<Record<PublishCheckKey, string | null>> = {
  contactEmail: null,
  privacyChosen: '#settings-privacy',
};

/** The query that opens the question, and the place on the page it comes back to. */
export const publishAsk = { name: 'publish', value: 'ask' } as const;
export const publishPlace = 'publish';

export function PublishPanel({
  league,
  address,
  status,
  version,
  checks,
  mayPublish,
  asking,
}: {
  /** The route's `[league]` value, for the form. */
  readonly league: string;
  /** This page's address, from the address helper. */
  readonly address: string;
  readonly status: LeagueStatus;
  readonly version: number;
  readonly checks: readonly PublishCheck[];
  /** Whether this person may publish (the command decides; this only draws the button). */
  readonly mayPublish: boolean;
  /** Whether the person pressed Publish and is being asked. */
  readonly asking: boolean;
}) {
  if (status !== 'draft' && status !== 'live') return null;
  const ready = checks.every((check) => check.met);
  return (
    <section
      className="staff-panel settings-publish"
      id={publishPlace}
      aria-labelledby="publish-title"
      data-status={status}
    >
      <h2 id="publish-title">{t('adminSettings.publish.title')}</h2>
      {status === 'live' ? (
        <p>{t('adminSettings.publish.live')}</p>
      ) : (
        <>
          <p>{t('adminSettings.publish.draft')}</p>
          <h3>{t('adminSettings.publish.mustFix')}</h3>
          <ul className="publish-checks">
            {checks.map((check) => {
              const cure = cures[check.key];
              return (
                <li key={check.key} data-check={check.key} data-met={check.met ? 'yes' : 'no'}>
                  <span className="staff-pill" data-kind={check.met ? 'good' : 'wait'}>
                    {t(check.met ? 'adminSettings.publish.met' : 'adminSettings.publish.notMet')}
                  </span>{' '}
                  <span>{t(`adminSettings.publish.check.${check.key}` as TextKey)}</span>
                  {check.met ? null : (
                    <span className="publish-cure">
                      {t(`adminSettings.publish.check.${check.key}.cure` as TextKey)}
                      {cure === null ? null : (
                        <>
                          {' '}
                          <a href={cure}>{t('adminSettings.publish.cureLink')}</a>
                        </>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {!mayPublish ? null : !ready ? (
            <p>{t('adminSettings.publish.notReady')}</p>
          ) : asking ? (
            <form action={publishLeagueAction} className="staff-form" role="group">
              <input type="hidden" name="league" value={league} />
              <input type="hidden" name="version" value={version} />
              <p role="alert">{t('adminSettings.publish.ask')}</p>
              <p className="staff-buttons">
                <button type="submit" className="ui-button" data-kind="main">
                  {t('adminSettings.publish.button')}
                </button>{' '}
                <a className="ui-button" data-kind="quiet" href={`${address}#${publishPlace}`}>
                  {t('adminSettings.publish.cancel')}
                </a>
              </p>
            </form>
          ) : (
            <p className="staff-buttons">
              <a
                className="ui-button"
                data-kind="main"
                href={`${address}?${publishAsk.name}=${publishAsk.value}#${publishPlace}`}
              >
                {t('adminSettings.publish.button')}
              </a>
            </p>
          )}
        </>
      )}
    </section>
  );
}
