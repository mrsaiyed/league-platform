import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { StandalonePage } from '../../../../features/shell/index.ts';
import { localTools } from '../../../../server/local-only.ts';
import { t } from '../../../../server/messages.ts';
import { timeInWords } from '../../../../server/sign-in/sign-in-mail.ts';

// The emails kept on this computer (step 2.96, T-140's viewer): LOCAL WORK AND TESTS ONLY.
// In staging and production it answers "not found", as an address that does not exist
// (local-only.ts decides, from the app's own settings). Newest first: who each was to, its
// subject, its code and its links to this site, and its words, always as text (an email's
// HTML is never drawn here). Linked from no page a visitor sees; run-it-locally.md says
// where it is.
export default async function Page() {
  // The cookies first: this makes the page drawn per request, never at build time.
  await cookies();
  const tools = await localTools();
  if (tools === undefined) notFound();
  const emails = await tools.keptEmails();
  return (
    <StandalonePage>
      <main className="ui-message kept-emails">
        <h1>{t('standIn.keptEmails.title')}</h1>
        <p>{t('standIn.keptEmails.intro')}</p>
        {emails.length === 0 ? (
          <p>{t('standIn.keptEmails.empty')}</p>
        ) : (
          <ol>
            {emails.map((email) => (
              <li key={email.id} data-kept-email={email.to}>
                <h2 dir="auto">{email.subject}</h2>
                <p>{t('standIn.keptEmails.to', { address: email.to })}</p>
                <p>{t('standIn.keptEmails.keptAt', { when: keptWhen(email.capturedAt) })}</p>
                {email.code === null ? null : (
                  <p>
                    {t('standIn.keptEmails.code')} <code data-code="">{email.code}</code>
                  </p>
                )}
                {email.links.map((link) => (
                  <p key={link}>
                    <a href={link} data-kept-link="">
                      {link}
                    </a>
                  </p>
                ))}
                <details>
                  <summary>{t('standIn.keptEmails.words')}</summary>
                  <pre dir="auto" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {email.text}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
        )}
      </main>
    </StandalonePage>
  );
}

function keptWhen(capturedAt: string): string {
  const at = new Date(capturedAt);
  return Number.isNaN(at.getTime()) ? capturedAt : timeInWords(at);
}
