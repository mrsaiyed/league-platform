'use client';
// One game's format, shown and changed (step 2.119; P7 §5.1, S-35, S-39): every rule, the
// clock mode included; "Change the format" opening the form of checklist B1 with the
// league's presets (B2), saved for this game only and said back in one line (B4); the
// button greyed once the game is under way (B3) and absent when this person may not
// change it (the league's setting off for scorekeepers, or no permission). The tracker's
// start confirmation and the admin's games area both use it; only an admin is offered
// "Use the season's format" for a game given its own.
import type { GameFormatRules, GameFormatView } from '@srleagues/contracts';
import type { Translate } from '@srleagues/site';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { checkBeforeStart } from './check-before-start.ts';
import type { GameFormatClient } from './format-client.ts';
import {
  formatOfValues,
  valuesOf,
  withValue,
  type ChoiceField,
  type FormatValues,
  type TypedField,
} from './format-values.ts';
import { factLines, refusalText, summaryOf } from './format-words.ts';

export type FormatPanelLook = {
  readonly section: string;
  readonly list: string;
  readonly quiet: string;
  readonly button: string;
  readonly notice: string;
};

type Said = { readonly kind: 'saved' | 'problem' | 'changed'; readonly text: string } | null;

/**
 * The tracker's "Confirm and start scoring" (T-344): before it starts, the game's format
 * is read again, and a format changed since it was shown is shown and asked about again.
 */
export type StartConfirm = {
  readonly label: string;
  readonly busy: boolean;
  /** Whether the device would play under this format. */
  readonly playing: (format: GameFormatRules) => boolean;
  readonly onStart: () => void;
};

export function GameFormatPanel({
  client,
  t,
  locale,
  look,
  fallback,
  onChanged,
  confirm,
  initial = null,
}: {
  /** The format already read, if the page has it; it is read again all the same. */
  readonly initial?: GameFormatView | null;
  readonly client: GameFormatClient;
  readonly t: Translate;
  readonly locale: string;
  readonly look: FormatPanelLook;
  /** Shown while the format is read, and if it cannot be: the lines the page already has. */
  readonly fallback?: ReactNode;
  /** After a change is saved: the tracker reads the game's state again (the new rules). */
  readonly onChanged?: (view: GameFormatView) => void | Promise<void>;
  /** At the tracker's start confirmation: the button that starts the game. */
  readonly confirm?: StartConfirm;
}) {
  const [view, setView] = useState<GameFormatView | null>(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);
  const [checking, setChecking] = useState(false);
  const underWayId = `${useId()}-under-way`;

  useEffect(() => {
    let live = true;
    void client.read().then((outcome) => {
      if (live && outcome.kind === 'format') setView(outcome.view);
    });
    return () => {
      live = false;
    };
  }, [client]);

  // With signal, the format is read again first; with none, the game starts on what the
  // device has (T-344).
  const start = async (shown: GameFormatRules | null) => {
    if (confirm === undefined) return;
    setChecking(true);
    const check = await checkBeforeStart(client, shown, confirm.playing);
    setChecking(false);
    if (check.kind === 'start') {
      confirm.onStart();
      return;
    }
    setView(check.view);
    setEditing(false);
    setSaid({ kind: 'changed', text: t('tracker.formatChange.changedElsewhere') });
    await onChanged?.(check.view);
  };
  const startButton = (shown: GameFormatRules | null) =>
    confirm === undefined ? null : (
      <p>
        <button
          type="button"
          className={look.button}
          data-kind="main"
          data-format-confirm=""
          disabled={confirm.busy || checking}
          onClick={() => void start(shown)}
        >
          {confirm.label}
        </button>
      </p>
    );

  if (view === null) {
    return (
      <div data-format-reading="">
        {fallback ?? <p className={look.quiet}>{t('tracker.formatChange.reading')}</p>}
        {startButton(null)}
      </div>
    );
  }

  const save = async (format: GameFormatRules | null) => {
    setBusy(true);
    const outcome = await client.change(view.version, format);
    setBusy(false);
    if (outcome.kind === 'failed') {
      setSaid({ kind: 'problem', text: t('tracker.formatChange.offline') });
      return;
    }
    if (outcome.kind === 'refused') {
      setSaid({ kind: 'problem', text: refusalText(outcome.code, t) });
      // The format as it stands now: greyed under way, gone with the setting off.
      const again = await client.read();
      if (again.kind === 'format') setView(again.view);
      setEditing(false);
      return;
    }
    setView(outcome.view);
    setEditing(false);
    const summary = summaryOf(outcome.view.applies, t, locale);
    setSaid({
      kind: 'saved',
      text: t(
        format === null ? 'tracker.formatChange.saved.season' : 'tracker.formatChange.saved',
        {
          summary,
        },
      ),
    });
    await onChanged?.(outcome.view);
  };

  const { change } = view;
  // Absent when this person may not change it at all; greyed once the game is under way.
  const offered = change.may || change.reason === 'under-way';
  return (
    <div data-game-format="" data-format-source={view.source}>
      <p className={look.quiet}>{t(`tracker.formatChange.source.${view.source}`)}</p>
      <ul className={look.list} data-format-facts="">
        {factLines(view.facts, t, locale).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {said !== null ? (
        <p
          className={look.notice}
          data-kind={said.kind === 'saved' ? 'saved' : 'error'}
          role={said.kind === 'saved' ? 'status' : 'alert'}
          data-format-said={said.kind}
        >
          {said.text}
        </p>
      ) : null}
      {!change.may && change.reason === 'setting-off' ? (
        <p className={look.quiet}>{t('tracker.format.wrong')}</p>
      ) : null}
      {offered && !editing ? (
        <p>
          <button
            type="button"
            className={look.button}
            data-format-change=""
            disabled={!change.may || busy}
            aria-describedby={change.may ? undefined : underWayId}
            onClick={() => {
              setSaid(null);
              setEditing(true);
            }}
          >
            {t('tracker.formatChange.button')}
          </button>
          {change.may ? null : (
            <span id={underWayId} className={look.quiet}>
              {' '}
              {t('tracker.formatChange.underway')}
            </span>
          )}
          {change.may && change.as === 'admin' && view.given !== null ? (
            <>
              {' '}
              <button
                type="button"
                className={look.button}
                data-format-season=""
                disabled={busy}
                onClick={() => void save(null)}
              >
                {t('tracker.formatChange.season')}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {editing && change.may ? (
        <GameFormatForm
          view={view}
          t={t}
          look={look}
          busy={busy}
          onSave={(format) => void save(format)}
          onCancel={() => setEditing(false)}
        />
      ) : null}
      {startButton(view.applies)}
    </div>
  );
}

export function GameFormatForm({
  view,
  t,
  look,
  busy,
  onSave,
  onCancel,
}: {
  readonly view: GameFormatView;
  readonly t: Translate;
  readonly look: FormatPanelLook;
  readonly busy: boolean;
  readonly onSave: (format: GameFormatRules) => void;
  readonly onCancel: () => void;
}) {
  const id = useId();
  const [values, setValues] = useState<FormatValues>(() => valuesOf(view.applies));
  const [invalid, setInvalid] = useState(false);
  const set = (field: TypedField | ChoiceField, value: string) =>
    setValues((v) => withValue(v, field, value));
  const k = 'tracker.formatChange';

  const number = (field: TypedField, label: string) => (
    <p>
      <label htmlFor={`${id}-${field}`}>{label}</label>
      <input
        id={`${id}-${field}`}
        name={field}
        inputMode="decimal"
        autoComplete="off"
        value={values[field]}
        onChange={(e) => set(field, e.target.value)}
      />
    </p>
  );
  /** A field chosen from a list: each option's value and its words. */
  const choice = (field: ChoiceField, label: string, options: readonly (readonly string[])[]) => (
    <p>
      <label htmlFor={`${id}-${field}`}>{label}</label>
      <select
        id={`${id}-${field}`}
        name={field}
        value={values[field]}
        onChange={(e) => set(field, e.target.value)}
      >
        {options.map(([value, words]) => (
          <option key={value} value={value}>
            {words}
          </option>
        ))}
      </select>
    </p>
  );

  return (
    <form
      className={look.section}
      data-format-form=""
      aria-label={t(`${k}.title`)}
      onSubmit={(e) => {
        e.preventDefault();
        const format = formatOfValues(values);
        setInvalid(format === null);
        if (format !== null) onSave(format);
      }}
    >
      <h3>{t(`${k}.title`)}</h3>
      <p>
        <label htmlFor={`${id}-preset`}>{t(`${k}.preset`)}</label>
        <select
          id={`${id}-preset`}
          data-format-preset=""
          defaultValue=""
          onChange={(e) => {
            const chosen = view.presets.find((p) => p.preset === e.target.value);
            if (chosen !== undefined) setValues(valuesOf(chosen.format));
          }}
        >
          <option value="" disabled>
            {t(`${k}.preset`)}
          </option>
          {view.presets.map((p) => (
            <option key={p.preset} value={p.preset}>
              {t(`${k}.preset.${p.preset}`)}
            </option>
          ))}
        </select>
      </p>
      {choice('periods', t(`${k}.field.periods`), [
        ['2', t(`${k}.option.periods.halves`)],
        ['4', t(`${k}.option.periods.quarters`)],
      ])}
      {number('minutes', t(`${k}.field.length`))}
      {number('overtimeMinutes', t(`${k}.field.overtime`))}
      {choice('clockMode', t(`${k}.field.clock`), [
        ['stop', t(`${k}.option.clock.stop`)],
        ['running', t(`${k}.option.clock.running`)],
      ])}
      {number('stopLastSeconds', t(`${k}.field.stop`))}
      {choice('stopScope', t(`${k}.field.scope`), [
        ['period', t(`${k}.option.scope.period`)],
        ['half', t(`${k}.option.scope.half`)],
        ['game', t(`${k}.option.scope.game`)],
      ])}
      {number('mercyLead', t(`${k}.field.mercy`))}
      {choice('teamFoulsReset', t(`${k}.field.reset`), [
        ['period', t(`${k}.option.reset.period`)],
        ['half', t(`${k}.option.reset.half`)],
        ['game', t(`${k}.option.reset.game`)],
      ])}
      {number('bonusFouls', t(`${k}.field.bonus`))}
      {number('doubleBonusFouls', t(`${k}.field.double`))}
      {number('playerFoulLimit', t(`${k}.field.fouled`))}
      {number('fullTimeouts', t(`${k}.field.full`))}
      {number('shortTimeouts', t(`${k}.field.short`))}
      {choice('timeoutsPer', t(`${k}.field.timeouts`), [
        ['game', t(`${k}.option.timeouts.game`)],
        ['half', t(`${k}.option.timeouts.half`)],
      ])}
      {number('overtimeTimeouts', t(`${k}.field.overtimeouts`))}
      <p>
        <input
          id={`${id}-carry`}
          type="checkbox"
          name="timeoutsCarry"
          checked={values.timeoutsCarry}
          onChange={(e) => setValues((v) => ({ ...v, timeoutsCarry: e.target.checked }))}
        />
        <label htmlFor={`${id}-carry`}>{t(`${k}.field.carry`)}</label>
      </p>
      {invalid ? (
        <p className={look.notice} data-kind="error" role="alert">
          {t(`${k}.invalid`)}
        </p>
      ) : null}
      <p>
        <button
          type="submit"
          className={look.button}
          data-kind="main"
          disabled={busy}
          data-format-save=""
        >
          {t(`${k}.save`)}
        </button>{' '}
        <button type="button" className={look.button} onClick={onCancel} disabled={busy}>
          {t(`${k}.cancel`)}
        </button>
      </p>
    </form>
  );
}
