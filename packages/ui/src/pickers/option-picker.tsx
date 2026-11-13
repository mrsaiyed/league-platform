// Round and season pickers. A plain form that goes to an address with the choice in it, so
// it works before any script has loaded and the page decides what each choice shows.
export type PickerOption = { readonly value: string; readonly label: string };

export type OptionPickerProps = {
  /** The name of the choice in the address, for example "round". */
  readonly name: string;
  /** The words beside the picker, for example "Round". */
  readonly label: string;
  readonly options: readonly PickerOption[];
  readonly value: string;
  /** The button's words, for example "Show". */
  readonly submitLabel: string;
  /** Where the form goes; empty means the same page. */
  readonly action?: string;
  /** Other choices already in the address (a team filter, say) that must be kept. */
  readonly keep?: Readonly<Record<string, string>>;
};

export function OptionPicker({
  name,
  label,
  options,
  value,
  submitLabel,
  action,
  keep = {},
}: OptionPickerProps) {
  const id = `ui-picker-${name}`;
  return (
    <form className="ui-picker" method="get" action={action}>
      {Object.entries(keep)
        .filter(([key]) => key !== name)
        .map(([key, v]) => (
          <input key={key} type="hidden" name={key} value={v} />
        ))}
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={value} dir="auto">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}

export type NamedPickerProps = Omit<OptionPickerProps, 'name'>;

/** Picks a round of the schedule: `?round=`. */
export function RoundPicker(props: NamedPickerProps) {
  return <OptionPicker {...props} name="round" />;
}

/** Picks a season: `?season=`. */
export function SeasonPicker(props: NamedPickerProps) {
  return <OptionPicker {...props} name="season" />;
}
