// Wuthering Tools+ automatic backups — which ones are kept. Pure.
//
// The newest 7 daily ones; of the older daily ones, the newest of each of the 4 most recent weeks; and every
// "before …" and hand-made one, up to the newest 20 of those (each is taken on a click, so they cannot pile up the
// way the daily ones would, but a list of hundreds is no list). All of it under a byte cap: past it the oldest go
// first, whatever they are, and never the one just written.
import type { BackupMeta } from "./backupStore";

export const KEEP_DAILY = 7;
export const KEEP_WEEKLY = 4;
export const KEEP_OTHERS = 20;
/** bytes as stored. A 330 KB account is about 40 KB compressed, so the cap is never the limit for one account's
 *  thirty-odd backups; it is there for a huge account on a browser without compression. */
export const BACKUP_BYTE_CAP = 12 * 1024 * 1024;

/** The Monday that starts the week of `ms`, in the player's own time zone ("2026-11-16"). */
export function weekOf(ms: number): string {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const newestFirst = (metas: readonly BackupMeta[]): BackupMeta[] => [...metas].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));

export interface RetentionOptions {
  cap?: number;
  /** the backup just written: the cap never takes it */
  justWritten?: string;
}

/** Which of `metas` stay and which go. `keep` is newest first. */
export function retention(metas: readonly BackupMeta[], opts: RetentionOptions = {}): { keep: BackupMeta[]; drop: BackupMeta[] } {
  const cap = opts.cap ?? BACKUP_BYTE_CAP;
  const all = newestFirst(metas);
  const keep = new Set<string>();

  const daily = all.filter((m) => m.reason === "daily");
  for (const m of daily.slice(0, KEEP_DAILY)) keep.add(m.id);
  const weeks = new Set<string>();
  for (const m of daily.slice(KEEP_DAILY)) {
    const week = weekOf(m.at);
    if (weeks.has(week)) continue;
    if (weeks.size >= KEEP_WEEKLY) break;
    weeks.add(week);
    keep.add(m.id);
  }
  for (const m of all.filter((x) => x.reason !== "daily").slice(0, KEEP_OTHERS)) keep.add(m.id);
  if (opts.justWritten) keep.add(opts.justWritten);

  // the byte cap: the oldest go first
  const kept = all.filter((m) => keep.has(m.id));
  let total = kept.reduce((n, m) => n + m.bytes, 0);
  for (let i = kept.length - 1; i >= 0 && total > cap && keep.size > 1; i--) {
    const m = kept[i]!;
    if (m.id === opts.justWritten) continue;
    keep.delete(m.id);
    total -= m.bytes;
  }
  return { keep: all.filter((m) => keep.has(m.id)), drop: all.filter((m) => !keep.has(m.id)) };
}
