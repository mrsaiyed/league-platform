'use client';
// Turnstile's box in explicit mode (record 081, step 2.98's fix round C1). The service's
// script is loaded once, by this part, from the service's own origin (the page's script
// policy names it); the box is drawn when its form appears and removed when the form goes,
// so a form drawn again in the same document (a refusal answered without a reload) gets a
// box of its own. Every answer is used once: when the form is sent, the box is asked for a
// fresh one at once, and the form's own reset after its action (React's) cannot empty it.
// That reset, or the page drawn anew, would also lose the email typed: the box keeps it in
// this tab's own storage until the next form is drawn and puts it back (F4), in the browser
// only, so a refused form still sets nothing on our side.
//
// The form's buttons wait for the answer, only here (with scripts off this part never runs,
// the buttons work and the server says what is missing). When the person's browser cannot
// load the check, the answer's field holds the fixed word botCheckDidNotLoad, so the server
// can say so truly; it is refused like any wrong answer.
import { useEffect, useRef, useState } from 'react';

/** The part of Turnstile's script API this box uses. */
type TurnstileApi = {
  readonly render: (container: HTMLElement, options: Readonly<Record<string, unknown>>) => string;
  readonly reset: (widgetId: string) => void;
  readonly remove: (widgetId: string) => void;
};

const loaded = new Map<string, Promise<TurnstileApi>>();

/** Where this tab keeps the email of the form last sent, until a form drawn takes it back. */
const typedKey = 'srl-typed-email';

/** The tab's storage, or nothing where it cannot be used (a private window, say). */
const keep = {
  take: (): string => {
    try {
      const value = sessionStorage.getItem(typedKey) ?? '';
      sessionStorage.removeItem(typedKey);
      return value;
    } catch {
      return '';
    }
  },
  put: (value: string): void => {
    try {
      if (value === '') sessionStorage.removeItem(typedKey);
      else sessionStorage.setItem(typedKey, value);
    } catch {
      // Not kept: the person types it again.
    }
  },
};

const turnstileOf = (): TurnstileApi | undefined =>
  (window as unknown as { turnstile?: TurnstileApi }).turnstile;

/** The service's script, loaded once per address; a failed load may be tried again. */
function loadTurnstile(scriptUrl: string): Promise<TurnstileApi> {
  const ready = turnstileOf();
  if (ready !== undefined) return Promise.resolve(ready);
  const known = loaded.get(scriptUrl);
  if (known !== undefined) return known;
  const loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.addEventListener('load', () => {
      const api = turnstileOf();
      if (api === undefined) reject(new Error('no box'));
      else resolve(api);
    });
    script.addEventListener('error', () => reject(new Error('not loaded')));
    document.head.append(script);
  });
  loading.catch(() => {
    loaded.delete(scriptUrl);
  });
  loaded.set(scriptUrl, loading);
  return loading;
}

export function BotCheckBox({
  siteKey,
  action,
  field,
  scriptUrl,
  didNotLoad,
  waiting,
}: {
  readonly siteKey: string;
  readonly action: string;
  readonly field: string;
  readonly scriptUrl: string;
  /** The fixed word written when the check cannot load (botCheckDidNotLoad). */
  readonly didNotLoad: string;
  /** Said while the form waits for the check's answer. */
  readonly waiting: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const answerField = useRef<HTMLInputElement>(null);
  const [isWaiting, setWaiting] = useState(false);

  useEffect(() => {
    const container = box.current;
    const input = answerField.current;
    const form = container?.closest('form');
    if (container === null || input === null || form === null || form === undefined) return;
    const buttons = [...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]')];
    const email = form.querySelector<HTMLInputElement>('input[type="email"]');
    const giveEmailBack = () => {
      const typed = keep.take();
      if (email !== null && email.value === '' && typed !== '') email.value = typed;
    };
    giveEmailBack();
    let answer = '';
    let widget: string | undefined;
    let gone = false;
    // Set in the very task of a submit, so a second one in the same instant (a double
    // click) is ignored instead of sending the same answer again; cleared by a fresh answer.
    let sending = false;
    const show = (value: string, wait: boolean) => {
      if (!wait) sending = false;
      answer = value;
      input.value = value;
      for (const button of buttons) button.disabled = wait;
      setWaiting(wait);
    };
    const fresh = () => {
      show('', true);
      const api = turnstileOf();
      if (widget !== undefined && api !== undefined) api.reset(widget);
    };
    show('', true);
    loadTurnstile(scriptUrl).then(
      (api) => {
        if (gone) return;
        widget = api.render(container, {
          sitekey: siteKey,
          action,
          'response-field': false,
          callback: (token: string) => show(token, false),
          'error-callback': () => {
            show(didNotLoad, false);
            return true;
          },
          'expired-callback': fresh,
          'timeout-callback': fresh,
        });
      },
      () => {
        if (!gone) show(didNotLoad, false);
      },
    );
    // After the form's data is taken (the same task as the submit), the answer is spent.
    // A second submit before a fresh answer is stopped here, before React's own listener
    // (on the page's root) sees it. The buttons have no name, so disabling them at once
    // takes nothing from the form's data.
    const onSubmit = (event: SubmitEvent) => {
      if (sending) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      sending = true;
      for (const button of buttons) button.disabled = true;
      keep.put(email?.value ?? '');
      setTimeout(() => !gone && fresh(), 0);
    };
    // React empties the form after its action; the answer and the email are put back.
    const onReset = () =>
      setTimeout(() => {
        if (gone) return;
        input.value = answer;
        giveEmailBack();
      }, 0);
    form.addEventListener('submit', onSubmit);
    form.addEventListener('reset', onReset);
    return () => {
      gone = true;
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('reset', onReset);
      for (const button of buttons) button.disabled = false;
      const api = turnstileOf();
      if (widget !== undefined && api !== undefined) api.remove(widget);
    };
  }, [siteKey, action, scriptUrl, didNotLoad]);

  return (
    <>
      {/* No value of React's: on a hidden field React would put its own back on every
          drawing, over the answer the box wrote. */}
      <input ref={answerField} type="hidden" name={field} />
      <div ref={box} className="sign-in-bot-check" />
      {isWaiting ? (
        <p className="sign-in-bot-check-waiting" aria-live="polite">
          {waiting}
        </p>
      ) : null}
    </>
  );
}
