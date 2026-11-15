// Sorting for the statistics table. Numbers sort as numbers, names by the reader's own
// language rules (so Arabic and accented names order sensibly), and a missing value always
// goes last, whichever way the column is sorted.
export type StatValue = string | number | null;

export type StatRow = {
  readonly id: string;
  readonly cells: Readonly<Record<string, StatValue>>;
  /**
   * The columns of this row that name a team, by the column's key, each with the team's own
   * color (#rrggbb): that cell shows a chip before the name, plain when the color is null.
   */
  readonly chips?: Readonly<Record<string, string | null>>;
};

export type SortDirection = 'ascending' | 'descending';

export type Sort = { readonly key: string; readonly direction: SortDirection };

/** Returns a new array; the rows given are never changed. Ties keep their given order. */
export function sortStatRows<R extends StatRow>(
  rows: readonly R[],
  sort: Sort | null,
  locale?: string,
): R[] {
  if (!sort) return [...rows];
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: row.cells[sort.key] ?? null }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const order =
        typeof a.value === 'number' && typeof b.value === 'number'
          ? a.value - b.value
          : collator.compare(String(a.value), String(b.value));
      return order === 0 ? a.index - b.index : order * sign;
    })
    .map((x) => x.row);
}

/** What a header press does: a new column starts the way that suits it, the same one flips. */
export function nextSort(current: Sort | null, key: string, numeric: boolean): Sort {
  if (current && current.key === key) {
    return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  }
  return { key, direction: numeric ? 'descending' : 'ascending' };
}
