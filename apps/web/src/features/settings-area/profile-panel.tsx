// League settings → Profile (step 2.125 part 2, U-14): the owner or an admin changes the
// name, the short name (the old address forwards for 12 months), how people reach the
// league, where it plays, its clock, its listing in `/find` (U-10) and who plays. Plain
// forms that post to the server actions, so it works with no script in the page; each
// action runs the product's own command, which decides again.
//
// Who plays: the screen says what a change does before it is saved, from the same rule
// the command follows (audienceChange): a move toward adults asks for the tick (R-14),
// and a move that brings children into an adult league that shows children in full says
// that this is cleared back to no (R-14, R-29).
import { audienceChange, audiences, type Audience, type LeagueProfile } from '@srleagues/core';
import { t, type TextKey } from '../../server/messages.ts';
import {
  renameShortNameAction,
  saveLeagueAudienceAction,
  saveLeagueNameAction,
  saveLeagueProfileAction,
} from './actions.ts';

/** The place on the page the Profile part is, for links that cure a "Must fix" item. */
export const profilePlace = 'settings-profile';

/** Whether any choice of who plays from here asks for the tick, or clears full names. */
function choicesFrom(from: Audience, childrenInFull: boolean) {
  const others = audiences.filter((to) => to !== from);
  return {
    asks: others.some((to) => audienceChange(from, to, childrenInFull).needsConfirming),
    clears: others.some((to) => audienceChange(from, to, childrenInFull).clearsChildrenInFull),
  };
}

export function ProfilePanel({
  league,
  name,
  slug,
  version,
  profile,
  childrenInFull,
  mayChange,
}: {
  /** The route's `[league]` value, for the forms. */
  readonly league: string;
  readonly name: string;
  readonly slug: string;
  readonly version: number;
  readonly profile: LeagueProfile;
  /** The league holds a saved, confirmed "children in full" (R-29). */
  readonly childrenInFull: boolean;
  /** The owner or an admin, in a league that is not read-only (U-9, U-14). */
  readonly mayChange: boolean;
}) {
  const disabled = !mayChange;
  const { asks, clears } = choicesFrom(profile.audience, childrenInFull);
  const hidden = (
    <>
      <input type="hidden" name="league" value={league} />
      <input type="hidden" name="version" value={version} />
    </>
  );
  return (
    <section
      className="staff-panel settings-profile"
      id={profilePlace}
      aria-labelledby="profile-title"
    >
      <h2 id="profile-title">{t('adminSettings.profile.title')}</h2>
      {mayChange ? null : <p>{t('adminSettings.profile.readOnly')}</p>}
      <form action={saveLeagueNameAction} className="staff-form" data-form="league-name">
        {hidden}
        <label>
          {t('adminSettings.profile.name')}
          <input name="name" defaultValue={name} required maxLength={120} disabled={disabled} />
        </label>
        <button type="submit" className="ui-button" disabled={disabled}>
          {t('adminSettings.profile.saveName')}
        </button>
      </form>
      <form action={renameShortNameAction} className="staff-form" data-form="short-name">
        {hidden}
        <label>
          {t('adminSettings.profile.shortName')}
          <input
            name="slug"
            defaultValue={slug}
            required
            minLength={3}
            maxLength={40}
            pattern="[a-z0-9-]{3,40}"
            disabled={disabled}
          />
        </label>
        <p className="staff-row-facts">{t('adminSettings.profile.shortNameForwards')}</p>
        <button type="submit" className="ui-button" disabled={disabled}>
          {t('adminSettings.profile.saveShortName')}
        </button>
      </form>
      <form action={saveLeagueProfileAction} className="staff-form" data-form="league-profile">
        {hidden}
        <label>
          {t('adminSettings.profile.contactEmail')}
          <input
            type="email"
            name="contactEmail"
            defaultValue={profile.contactEmail ?? ''}
            required
            maxLength={320}
            disabled={disabled}
          />
        </label>
        <label>
          {t('adminSettings.profile.city')}
          <input
            name="city"
            defaultValue={profile.city ?? ''}
            maxLength={100}
            disabled={disabled}
          />
        </label>
        <label>
          {t('adminSettings.profile.timeZone')}
          <input
            name="timeZone"
            defaultValue={profile.timeZone}
            required
            maxLength={64}
            disabled={disabled}
          />
        </label>
        <label>
          <input
            type="checkbox"
            name="listed"
            value="yes"
            defaultChecked={profile.listed}
            disabled={disabled}
          />{' '}
          {t('adminSettings.profile.listed')}
        </label>
        <button type="submit" className="ui-button" disabled={disabled}>
          {t('adminSettings.profile.save')}
        </button>
      </form>
      <form action={saveLeagueAudienceAction} className="staff-form" data-form="who-plays">
        {hidden}
        <fieldset>
          <legend>{t('adminSettings.profile.whoPlays')}</legend>
          {audiences.map((audience) => (
            <label key={audience}>
              <input
                type="radio"
                name="audience"
                value={audience}
                defaultChecked={audience === profile.audience}
                disabled={disabled}
              />{' '}
              {t(`adminSettings.profile.audience.${audience}` as TextKey)}
            </label>
          ))}
        </fieldset>
        {clears ? (
          <p className="ui-notice" data-kind="warning" data-says="clears-full-names">
            {t('adminSettings.profile.clearsFullNames')}
          </p>
        ) : null}
        {asks ? (
          <label data-says="confirm-toward-adults">
            <input type="checkbox" name="confirmed" value="yes" disabled={disabled} />{' '}
            {t('adminSettings.profile.confirmTowardAdults')}
          </label>
        ) : null}
        <button type="submit" className="ui-button" disabled={disabled}>
          {t('adminSettings.profile.saveWhoPlays')}
        </button>
      </form>
    </section>
  );
}
