// The pieces the admin's pages share (step 2.103; docs/build/DESIGN.md section 4, lines 21
// and 22): the trail at the top of an inner page, the notice in its three kinds, a state's
// pill, and a field with its label above it. They only draw; every word is given to them.
// Their look is in the admin's own stylesheet (app/[league]/admin/staff.css).
import type { ReactNode } from 'react';
import { t } from '../../server/messages.ts';

/**
 * The way back at the top of an inner page: "Teams / Falcons". Each step before the last
 * is a link; the last is the page itself.
 */
export function StaffTrail({
  steps,
  here,
}: {
  readonly steps: readonly { readonly href: string; readonly label: string }[];
  /** The page itself: a team's name, a game. */
  readonly here: string;
}) {
  return (
    <nav className="staff-trail" aria-label={t('admin.trail')}>
      <ol>
        {steps.map((step) => (
          <li key={step.href}>
            <a href={step.href}>{step.label}</a>
          </li>
        ))}
        <li aria-current="page" dir="auto">
          {here}
        </li>
      </ol>
    </nav>
  );
}

/** What a notice says happened: it was saved, it was refused, or something was removed. */
export type NoticeKind = 'saved' | 'refused' | 'removed';

/**
 * One notice, in three kinds that can be told apart at a glance, drawn beside the thing
 * it is about: saved (a tick, green), refused (a mark, the danger color, read out at
 * once) and removed (with its way back as `children`' last part).
 */
export function StaffNotice({
  kind,
  id,
  children,
}: {
  readonly kind: NoticeKind;
  readonly id?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      id={id}
      className="ui-notice"
      data-kind={kind === 'refused' ? 'error' : kind}
      role={kind === 'refused' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

/** How a thing stands, as a small pill in a soft color: done, waiting, stopped, or plain. */
export type PillKind = 'good' | 'wait' | 'stop' | 'plain';

export function StaffPill({
  kind = 'plain',
  children,
}: {
  readonly kind?: PillKind;
  readonly children: ReactNode;
}) {
  return (
    <span className="staff-pill" data-kind={kind}>
      {children}
    </span>
  );
}

/**
 * A field: its label above it, help quiet beneath, and the error in words beside it. The
 * control is the caller's own (an input, a select), so nothing about what is sent changes.
 */
export function StaffField({
  label,
  help,
  size,
  children,
}: {
  readonly label: string;
  readonly help?: string | undefined;
  /** `figure` for a number of a few figures: its box is only as wide as it needs. */
  readonly size?: 'figure' | undefined;
  readonly children: ReactNode;
}) {
  return (
    <label className="staff-field" data-size={size}>
      <span>{label}</span>
      {children}
      {help === undefined ? null : <small className="ui-field-help">{help}</small>}
    </label>
  );
}
