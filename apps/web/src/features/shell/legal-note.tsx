import { platformUrl } from '@srleagues/core';
import { t, type TextKey } from '../../server/messages.ts';
import { safeReturnPath } from '../../server/sign-in/device.ts';
import type { ReturnLeague } from '../../server/sign-in/return-league.ts';
import { StandalonePage } from './standalone-page.tsx';

/** The two pages of the note (B-14, step 2.135). */
export type LegalPage = 'terms' | 'privacy';

type Section = { readonly title: TextKey; readonly body: readonly TextKey[] };

/** What each page says, in order, from the message files (T-187). */
const sections: Readonly<Record<LegalPage, readonly Section[]>> = {
  terms: [
    { title: 'legal.terms.what.title', body: ['legal.terms.what.body'] },
    { title: 'legal.terms.account.title', body: ['legal.terms.account.body'] },
    { title: 'legal.terms.enter.title', body: ['legal.terms.enter.body'] },
    { title: 'legal.terms.league.title', body: ['legal.terms.league.body'] },
    { title: 'legal.terms.new.title', body: ['legal.terms.new.body'] },
  ],
  privacy: [
    {
      title: 'legal.privacy.keep.title',
      body: [
        'legal.privacy.keep.account',
        'legal.privacy.keep.devices',
        'legal.privacy.keep.players',
        'legal.privacy.keep.log',
        'legal.privacy.keep.cookies',
      ],
    },
    { title: 'legal.privacy.why.title', body: ['legal.privacy.why.body'] },
    {
      title: 'legal.privacy.who.title',
      body: ['legal.privacy.who.public', 'legal.privacy.who.admins', 'legal.privacy.who.never'],
    },
    {
      title: 'legal.privacy.children.title',
      body: ['legal.privacy.children.body', 'legal.privacy.children.less'],
    },
    { title: 'legal.privacy.sell.title', body: ['legal.privacy.sell.body'] },
    {
      title: 'legal.privacy.remove.title',
      body: ['legal.privacy.remove.body', 'legal.privacy.remove.league'],
    },
  ],
};

const titles = { terms: 'page.terms', privacy: 'page.privacy' } as const;
const readOther = { terms: 'legal.readPrivacy', privacy: 'legal.readTerms' } as const;
const other = { terms: 'privacy', privacy: 'terms' } as const;

/**
 * The address of the Terms or Privacy page, opened from the page at `from`: the page
 * offers "Back to {league}" when `from` is a league's page the reader may see (the using-it
 * audit, M22). Only a path on this site is carried (safeReturnPath).
 */
export function legalNoteHref(page: LegalPage, from: string | null): string {
  const back = from === null ? null : safeReturnPath(from);
  if (back === null) return platformUrl(page);
  return `${platformUrl(page)}?${new URLSearchParams({ from: back }).toString()}`;
}

/**
 * The short plain note on the Terms or Privacy page until the lawyer's versions exist
 * (B-14, step 2.135): what we keep, why, who can see it and who to write to, with the date
 * it last changed. Every word is in the message files, so the founder can change any.
 * `contactEmail` is the site's CONTACT_EMAIL setting; `back` the league the reader came
 * from, if they may see it (return-league.ts).
 */
export function LegalNote({
  page,
  back,
  from,
  contactEmail,
}: {
  readonly page: LegalPage;
  readonly back: ReturnLeague | null;
  /** The page the reader came from, carried on to the other note. */
  readonly from: string | null;
  readonly contactEmail: string | undefined;
}) {
  return (
    <StandalonePage>
      <main className="ui-message legal-note">
        <h1>{t(titles[page])}</h1>
        <p>{t('legal.shortVersion')}</p>
        <p>{t('legal.lastChanged')}</p>
        {sections[page].map((section) => (
          <section key={section.title}>
            <h2>{t(section.title)}</h2>
            {section.body.map((key) => (
              <p key={key}>{t(key)}</p>
            ))}
          </section>
        ))}
        <section>
          <h2>{t('legal.contact.title')}</h2>
          <p>{t('legal.contact.league')}</p>
          {contactEmail === undefined ? (
            <p>{t('legal.contact.siteThroughLeague')}</p>
          ) : (
            <p>
              {t('legal.contact.site')} <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </p>
          )}
        </section>
        <p>
          <a className="ui-button" data-kind="quiet" href={legalNoteHref(other[page], from)}>
            {t(readOther[page])}
          </a>
        </p>
        {back === null ? null : (
          <p>
            <a className="ui-button" data-kind="quiet" href={back.href}>
              {t('legal.backTo', { league: back.name })}
            </a>
          </p>
        )}
      </main>
    </StandalonePage>
  );
}
