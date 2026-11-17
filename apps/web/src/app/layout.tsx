import { htmlAttributes } from '@srleagues/site';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { doNotIndex } from '../server/do-not-index.ts';
import { locale, t } from '../server/messages.ts';
// Every face a design can name, served from our own address (T-262, record 059).
import './font-faces.css';

/**
 * The site's name, and outside production every page's own "do not index" mark in its head
 * (`<meta name="robots" content="noindex, nofollow">`, record 081), beside the header the
 * proxy sends with it. Read when the page is drawn, from the server's own settings.
 */
export function generateMetadata(): Metadata {
  return {
    title: t('shell.siteName'),
    ...(doNotIndex() ? { robots: { index: false, follow: false } } : {}),
  };
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  const { lang, dir } = htmlAttributes(locale);
  return (
    <html lang={lang} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
