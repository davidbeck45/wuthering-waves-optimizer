// Wuthering Tools+ build history — what the page prints, pure: times, a version's one-line summary, label tones, the
// character list, the restore confirm's lines.
import { isKnownCharacter, weaponName, type ShareMember } from "../share/buildCodec";
import { characterDisplayName } from "../display/names";
import { hasBuild, LABEL_TEXT, type HistoryLabel } from "./history";
import type { RestorePlan } from "./restore";

/* eslint-disable @typescript-eslint/no-explicit-any */

const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Today 14:02", "Yesterday 21:15", "Oct 29, 21:15" (the year when it is not this one). Local time. */
export function whenText(at: number, nowMs = Date.now(), locale?: string): string {
  const d = new Date(at);
  const today = new Date(nowMs);
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (sameDay(d, today)) return `Today ${time}`;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, yesterday)) return `Yesterday ${time}`;
  const date = d.toLocaleDateString(locale, { month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
  return `${date}, ${time}`;
}

export const labelText = (label: HistoryLabel): string => LABEL_TEXT[label] ?? "Saved";

/** the chip colour: the player's own saves stand out from the automatic ones */
export const labelTone = (label: HistoryLabel): "own" | "auto" | "restore" => (label === "manual" ? "own" : label === "before-restore" ? "restore" : "auto");

/** "Everbright Polestar R5 · S2 · 5 of 5 echoes" */
export function gearSummary(charId: string, member: ShareMember): string {
  const weapon = member.weapon ? `${weaponName(member.weapon.id, charId)} R${member.weapon.rank}` : "No weapon";
  const echoes = member.echoes.filter(Boolean).length;
  return `${weapon} · S${member.sequence} · ${echoes} of 5 echoes`;
}

export interface CharacterOption {
  id: string;
  name: string;
  versions: number;
}

/**
 * Characters with a build or with versions, by name; the counts say which have a history. A character this app does not
 * know (a history left under an id the app no longer has) is left out unless the account holds them: a restore would
 * otherwise write a record for them, which the share import refuses too (mergePreview's "isn't in this app yet").
 */
export function characterOptions(characters: Record<string, any>, withHistory: Record<string, number>): CharacterOption[] {
  const ids = new Set<string>(Object.keys(withHistory).filter((id) => isKnownCharacter(id) || !!characters?.[id]));
  for (const [id, record] of Object.entries(characters ?? {})) if (hasBuild(record)) ids.add(id);
  return [...ids].map((id) => ({ id, name: characterDisplayName(id), versions: withHistory[id] ?? 0 })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The character the page opens on: the asked one, else the calculator's, else the first with versions, else any. */
export function pickCharacter(asked: string | null, active: string | null, options: CharacterOption[]): string | null {
  const has = (id: string | null): id is string => !!id && options.some((o) => o.id === id);
  if (has(asked)) return asked;
  if (has(active)) return active;
  return options.find((o) => o.versions > 0)?.id ?? options[0]?.id ?? null;
}

/** The restore confirm: what changes first, then where the echoes come from and what stays. */
export function restoreItems(plan: RestorePlan): string[] {
  return [...plan.changes, ...plan.notes];
}
