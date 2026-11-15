import { htmlAttributes } from '@srleagues/site';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { locale, t } from '../server/messages.ts';
// Every face a design can name, served from our own address (T-262, record 059).
import './font-faces.css';

export const metadata: Metadata = { title: t('shell.siteName') };

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  const { lang, dir } = htmlAttributes(locale);
  return (
    <html lang={lang} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
