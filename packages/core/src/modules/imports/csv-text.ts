// Splits CSV text into records of cells. Handles a byte-order mark, quoted cells with
// commas, doubled quotes and line breaks inside quotes, and any line ending. The
// separator is a comma, a semicolon or a tab, whichever the first line uses most
// (spreadsheet programs in some countries save with semicolons).

export type CsvRecord = { line: number; cells: string[] };

export type CsvSplit =
  | { ok: true; records: CsvRecord[] }
  | { ok: false; line: number; message: string };

const SEPARATORS = [',', ';', '\t'] as const;

function pickSeparator(text: string): string {
  const counts = new Map<string, number>(SEPARATORS.map((s) => [s, 0]));
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\n' || ch === '\r')) break;
    else if (!inQuotes && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best = ',';
  let bestCount = 0;
  for (const s of SEPARATORS) {
    const n = counts.get(s) ?? 0;
    if (n > bestCount) {
      best = s;
      bestCount = n;
    }
  }
  return best;
}

export function splitCsv(input: string): CsvSplit {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const separator = pickSeparator(text);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let quoteLine = 1;
  let line = 1;
  let recordLine = 1;
  let touched = false; // anything seen in the current record

  const endCell = () => {
    cells.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push({ line: recordLine, cells });
    cells = [];
    touched = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') {
      inQuotes = true;
      quoteLine = line;
      touched = true;
    } else if (ch === separator) {
      endCell();
      touched = true;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += ch;
      touched = true;
    }
  }
  if (inQuotes) {
    return {
      ok: false,
      line: quoteLine,
      message: `A quotation mark opened on row ${quoteLine} is never closed, so the file cannot be read reliably.`,
    };
  }
  if (touched || cell !== '') endRecord();
  return { ok: true, records };
}
