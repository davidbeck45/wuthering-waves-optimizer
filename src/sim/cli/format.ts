// Wuthering Tools+ CLI — output: JSON by default (agents, pipes), `--pretty` for a human.
export interface OutputOptions {
  pretty?: boolean;
  json?: boolean;
}

export function wantsPretty(opts: OutputOptions): boolean {
  if (opts.json) return false;
  if (opts.pretty) return true;
  return Boolean(process.stdout.isTTY);
}

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export const int = (n: number | null | undefined): string =>
  n == null || !Number.isFinite(n) ? "-" : Math.round(n).toLocaleString("en-US");

export const pct = (n: number | null | undefined, digits = 1): string =>
  n == null || !Number.isFinite(n) ? "-" : `${n.toFixed(digits)}%`;

/** A plain aligned table: rows of cells, first row = header. */
export function table(rows: string[][]): string {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows
    .map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join("  "))
    .join("\n");
}
