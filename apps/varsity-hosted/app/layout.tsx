import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Al-Hadi Varsity Scoring',
  description: 'Private team game records in League Platform.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
