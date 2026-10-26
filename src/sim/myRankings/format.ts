// Wuthering Tools+ — number formatting shared by the /my-rankings components (one style everywhere: grouped
// integers, signed one-decimal percentages, compact millions where space is tight).
export const fmt = (n: number): string => Math.round(n).toLocaleString();

/** 8,095,406 → "8.10M", 547,298 → "547K" */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${Math.round(n / 1e3)}K`;
  return fmt(n);
}

export const pct = (g: number): string => `${g >= 0 ? "+" : ""}${(g * 100).toFixed(1)}%`;
/** two decimals, for gains an order below a whole roll's */
export const pct2 = (g: number): string => `${g >= 0 ? "+" : ""}${(g * 100).toFixed(2)}%`;
export const gainClass = (g: number): string => (g > 0.0005 ? "text-success" : g < -0.0005 ? "text-error" : "opacity-60");

/** "just now", "4 min ago", "2 h ago", or the date */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
