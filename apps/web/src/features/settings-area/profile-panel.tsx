// League settings → Profile (step 2.125 part 2, U-14): the owner or an admin changes the
// name, the short name (the old address forwards for 12 months), how people reach the
// league, where it plays, its clock, its listing in `/find` (U-10) and who plays. Each
// form is a ListForm (step 2.155 part 3, T-416): it works with no script in the page, a
// refusal keeps every box as typed and names the wrong one beside it, and a save is said
// beside the form, once. Each action runs the product's own command, which decides again.
//
// Who plays: the screen says what a change does before it is saved, from the same rule
// the command follows (audienceChange): a move toward adults asks for the tick (R-14),
// and a move that brings children into an adult league that shows children in full says
// that this is cleared back to no (R-14, R-29). It lists every choice that a move
// bringing children in puts back to a youth league's start (S-96): "children in full",
// a saved "full names" (to be confirmed again) and the listing.
import { randomUUID } from 'node:crypto';
import {
  audienceChange,
  audiences,
  type Audience,
  type LeagueProfile,
  type YouthResets,
} from '@srleagues/core';
import type { ReactNode } from 'react';
import { t, type TextKey } from '../../server/messages.ts';
import { requestTokenField } from '../../server/same-request.ts';
import { ListForm, SaidLine } from '../list-forms/index.ts';
import {
  renameShortNameAction,
  saveLeagueAudienceAction,
  saveLeagueNameAction,
  saveLeagueProfileAction,
} from './actions.ts';
import type { ProfileFormName } from './profile-form-answer.ts';
import { profilePlace } from './profile-place.ts';

export { profilePlace };

/** The choices put back, in the order the screen lists them (S-96). */
const resetOrder = ['childrenInFull', 'namesChoice', 'listing'] as const;

/** Whether any choice of who plays from here asks for the tick, and what it puts back. */
function choicesFrom(from: Audience, resets: YouthResets) {
  const others = audiences.filter((to) => to !== from);
  const bringsChildrenIn = others.some(
    (to) => audienceChange(from, to, resets.childrenInFull).bringsChildrenIn,
  );
  return {
    asks: others.some((to) => audienceChange(from, to, resets.childrenInFull).needsConfirming),
    putsBack: bringsChildrenIn ? resetOrder.filter((key) => resets[key]) : [],
  };
}

export function ProfilePanel({
  league,
  address,
  name,
  slug,
  version,
  profile,
  resets,
  mayChange,
  saved,
}: {
  /** The route's `[league]` value, for the forms. */
  readonly league: string;
  /** League settings' own address, where the browser lands with scripts off. */
  readonly address: string;
  readonly name: string;
  readonly slug: string;
  readonly version: number;
  readonly profile: LeagueProfile;
  /** What bringing children in would put back to a youth league's start (S-96). */
  readonly resets: YouthResets;
  /** The owner or an admin, in a league that is not read-only (U-9, U-14). */
  readonly mayChange: boolean;
  /** The form just saved and its "Saved" words, from the one-time notice. */
  readonly saved?: { readonly form: ProfileFormName; readonly text: string } | undefined;
}) {
  const disabled = !mayChange;
  const { asks, putsBack } = choicesFrom(profile.audience, resets);
  const hidden = () => ({
    league,
    version: String(version),
    [requestTokenField]: randomUUID(),
  });
  const permalink = `${address}#${profilePlace}`;
  const savedBeside = (form: ProfileFormName): ReactNode =>
    saved?.form === form ? <SaidLine kind="saved">{saved.text}</SaidLine> : null;
  return (
    <section
      className="staff-panel settings-profile"
      id={profilePlace}
      aria-labelledby="profile-title"
    >
      <h2 id="profile-title">{t('adminSettings.profile.title')}</h2>
      {mayChange ? null : <p>{t('adminSettings.profile.readOnly')}</p>}
      <ListForm
        action={saveLeagueNameAction}
        permalink={permalink}
        hidden={hidden()}
        name="league-name"
        label={t('adminSettings.profile.name')}
        button={t('adminSettings.profile.saveName')}
        disabled={disabled}
        fields={[
          {
            kind: 'text',
            name: 'name',
            label: t('adminSettings.profile.name'),
            value: name,
            required: true,
            maxLength: 120,
          },
        ]}
      />
      {savedBeside('name')}
      <ListForm
        action={renameShortNameAction}
        permalink={permalink}
        hidden={hidden()}
        name="short-name"
        label={t('adminSettings.profile.shortName')}
        button={t('adminSettings.profile.saveShortName')}
        disabled={disabled}
        fields={[
          {
            kind: 'text',
            name: 'slug',
            label: t('adminSettings.profile.shortName'),
            value: slug,
            required: true,
            minLength: 3,
            maxLength: 40,
            pattern: '[a-z0-9-]{3,40}',
          },
          {
            kind: 'note',
            name: 'forwards',
            content: (
              <p className="staff-row-facts">{t('adminSettings.profile.shortNameForwards')}</p>
            ),
          },
        ]}
      />
      {savedBeside('shortName')}
      <ListForm
        action={saveLeagueProfileAction}
        permalink={permalink}
        hidden={hidden()}
        name="league-profile"
        label={t('adminSettings.profile.contactEmail')}
        button={t('adminSettings.profile.save')}
        disabled={disabled}
        fields={[
          {
            kind: 'email',
            name: 'contactEmail',
            label: t('adminSettings.profile.contactEmail'),
            value: profile.contactEmail ?? '',
            required: true,
            maxLength: 320,
          },
          {
            kind: 'text',
            name: 'city',
            label: t('adminSettings.profile.city'),
            value: profile.city ?? '',
            maxLength: 100,
          },
          {
            kind: 'text',
            name: 'timeZone',
            label: t('adminSettings.profile.timeZone'),
            value: profile.timeZone,
            required: true,
            maxLength: 64,
          },
          {
            kind: 'note',
            name: 'timeZoneMovesGames',
            content: (
              <p className="staff-row-facts" data-says="time-zone-moves-games">
                {t('adminSettings.profile.timeZoneMovesGames')}
              </p>
            ),
          },
          {
            kind: 'tick',
            name: 'listed',
            label: t('adminSettings.profile.listed'),
            checked: profile.listed,
          },
        ]}
      />
      {savedBeside('profile')}
      <ListForm
        action={saveLeagueAudienceAction}
        permalink={permalink}
        hidden={hidden()}
        name="who-plays"
        label={t('adminSettings.profile.whoPlays')}
        button={t('adminSettings.profile.saveWhoPlays')}
        disabled={disabled}
        fields={[
          {
            kind: 'choice',
            name: 'audience',
            label: t('adminSettings.profile.whoPlays'),
            value: profile.audience,
            options: audiences.map((audience) => ({
              value: audience,
              label: t(`adminSettings.profile.audience.${audience}` as TextKey),
            })),
          },
          ...(putsBack.length === 0
            ? []
            : [
                {
                  kind: 'note' as const,
                  name: 'youthResets',
                  content: (
                    <div className="ui-notice" data-kind="warning" data-says="youth-resets">
                      <p>{t('adminSettings.profile.youthResets')}</p>
                      <ul>
                        {putsBack.map((key) => (
                          <li
                            key={key}
                            data-resets={key}
                            {...(key === 'childrenInFull'
                              ? { 'data-says': 'clears-full-names' }
                              : {})}
                          >
                            {t(`adminSettings.profile.youthResets.${key}` as TextKey)}
                          </li>
                        ))}
                      </ul>
                      <p>{t('adminSettings.profile.youthResetsAfter')}</p>
                    </div>
                  ),
                },
              ]),
          ...(asks
            ? [
                {
                  kind: 'tick' as const,
                  name: 'confirmed',
                  label: t('adminSettings.profile.confirmTowardAdults'),
                  checked: false,
                  says: 'confirm-toward-adults',
                },
              ]
            : []),
        ]}
      />
      {savedBeside('whoPlays')}
    </section>
  );
}
