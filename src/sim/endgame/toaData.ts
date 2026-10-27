// Wuthering Tools+ — Tower of Adversity season data (the ToA clear check, /endgame): the generated season files
// (data/toa/s<NN>.json + index.json, written by wuwa-tools/endgame/toa_sync.mjs), the date-based release guard, the
// server-time reset countdown, and each floor as the engine fights it — HP segments with their enemy's RES (this app's
// src/enemies/index.ts) plus the floor's own RES changes and modelled effects.
//
// Pure: no Vue, no stores. Released content only: a season is visible once its start date (server time) has passed,
// whatever any upstream "current" flag said — the generator applies the same rule when it writes.
import enemies from "../../enemies/index";
import type { ResistStats } from "../../enemies/index";
import indexFile from "./data/toa/index.json";
import { ELEMENTS, fidelityOf, hasGear, resTable, type Element, type FloorEffect, type FloorProfileSpec } from "./effects";

/* ------------------------------------------------------------------------------------------ the files */

export interface ToaEnemy {
  name: string;
  count: number;
  /** HP of one of them (the sheet's figure); null where the sheet has none (side floors 1–3) */
  hp: number | null;
  class: string | null;
  element: string | null;
}

export interface ToaFloorEffectText {
  id: number;
  /** the game's own wording */
  text: string;
  model: FloorEffect[];
}

export interface ToaFloor {
  /** "hazard-1", "resonant-4", … */
  id: string;
  floor: number;
  /** Vigor each resonator spends to enter */
  cost: number;
  level: number;
  /** crest goals as seconds left on the 300 s clock (0 = clear it at all) */
  goals: number[];
  enemies: ToaEnemy[];
  /** the sheet's HP: every group of identical enemies once (AoE assumed) on a multi-enemy floor ("adjusted") */
  hp: number | null;
  /** every enemy counted */
  hpRaw: number | null;
  hpType: "raw" | "adjusted" | null;
  effects: ToaFloorEffectText[];
}

export type TowerId = "resonant" | "hazard" | "echoing";

export interface ToaTower {
  id: TowerId;
  name: string;
  floors: ToaFloor[];
}

export interface ToaSeason {
  v: 1;
  season: number;
  /** server dates, YYYY-MM-DD; the Hazard Zone resets at `resetHour` server time on `end` */
  start: string;
  end: string;
  resetHour: number;
  generatedAt: string;
  credits: { hp: string; hpUrl: string };
  towers: ToaTower[];
}

export interface ToaIndexEntry {
  season: number;
  start: string;
  end: string;
  resetHour: number;
  file: string;
}

export interface ToaIndex {
  v: 1;
  seasons: ToaIndexEntry[];
}

/** The 300 s clock every floor runs on. */
export const TOA_CLOCK = 300;
/** Vigor each resonator has across the whole Hazard Zone (all 12 stages) — check it in game. */
export const VIGOR_PER_RESONATOR = 10;

/* ------------------------------------------------------------------------------------------- servers */

/** Kuro's fixed server clocks ("server time"); the same ids and offsets the Convene tracker uses. */
export const SERVER_REGIONS = [
  { id: "asia", label: "Asia", offsetHours: 8 },
  { id: "america", label: "America", offsetHours: -5 },
  { id: "europe", label: "Europe", offsetHours: 1 },
  { id: "hmt", label: "HMT (TW / HK / MO)", offsetHours: 8 },
  { id: "sea", label: "SEA", offsetHours: 8 },
] as const;
export type ServerRegionId = (typeof SERVER_REGIONS)[number]["id"];

export const offsetOf = (region: ServerRegionId): number => SERVER_REGIONS.find((r) => r.id === region)?.offsetHours ?? 8;

/** A guess from the browser's own clock: the Americas west of UTC−3, Europe / Africa up to UTC+4, Asia after. */
export function guessRegion(utcOffsetMinutes: number): ServerRegionId {
  const h = utcOffsetMinutes / 60;
  if (h <= -3) return "america";
  if (h <= 4) return "europe";
  return "asia";
}

/** "YYYY-MM-DD" at `hour` on a server clock `offsetHours` from UTC → epoch ms. */
export function serverMoment(date: string, hour: number, offsetHours: number): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!, hour) - offsetHours * 3600_000;
}

/* --------------------------------------------------------------------------------------- the seasons */

/** Seasons that have started by `now` on the given server clock, oldest first — the release guard. */
export function releasedSeasons(index: ToaIndex, now: number, offsetHours = 8): ToaIndexEntry[] {
  return index.seasons
    .filter((s) => serverMoment(s.start, s.resetHour ?? 4, offsetHours) <= now)
    .sort((a, b) => a.season - b.season);
}

export interface SeasonStatus {
  /** the newest released season shipped with the app */
  entry: ToaIndexEntry | null;
  /** it is running now (false: it ended and the next one's data isn't in this build yet) */
  current: boolean;
  /** the season number running in game when `current` is false */
  next: number | null;
  startsAt: number | null;
  endsAt: number | null;
}

export function seasonStatus(index: ToaIndex, now: number, offsetHours = 8): SeasonStatus {
  const entry = releasedSeasons(index, now, offsetHours).slice(-1)[0] ?? null;
  if (!entry) return { entry: null, current: false, next: null, startsAt: null, endsAt: null };
  const startsAt = serverMoment(entry.start, entry.resetHour ?? 4, offsetHours);
  const endsAt = serverMoment(entry.end, entry.resetHour ?? 4, offsetHours);
  const current = now < endsAt;
  // 28-day seasons: how many have begun since this one ended
  const next = current ? null : entry.season + 1 + Math.floor((now - endsAt) / (28 * 86_400_000));
  return { entry, current, next, startsAt, endsAt };
}

/** "13 d 22 h", "5 h 07 m", "12 m" — what is left until `at`. */
export function countdown(at: number, now: number): string {
  const ms = Math.max(0, at - now);
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(mm).padStart(2, "0")} m`;
  return `${mm} m`;
}

export const toaIndex = indexFile as ToaIndex;

// Under Vite (the app, vitest) `import.meta.glob(...)` is rewritten at build time; plain Node (tsx, the CLI) reads
// the JSON from disk — `import.meta.env` is the only reliable runtime tell (Vite defines it).
const underVite = typeof import.meta.env !== "undefined";
const seasonFiles: Record<string, () => Promise<{ default: unknown }>> = underVite ? import.meta.glob<{ default: unknown }>("./data/toa/s*.json") : {};

/** One shipped season file. */
export async function loadSeason(entry: ToaIndexEntry): Promise<ToaSeason> {
  if (underVite) {
    const load = seasonFiles[`./data/toa/${entry.file}`];
    if (!load) throw new Error(`Season ${entry.season} is listed but its file ${entry.file} is not in this build`);
    return (await load()).default as ToaSeason;
  }
  const [{ readFile }, { fileURLToPath }, { dirname, join }] = await Promise.all([
    import(/* @vite-ignore */ "node:fs/promises"),
    import(/* @vite-ignore */ "node:url"),
    import(/* @vite-ignore */ "node:path"),
  ]);
  const file = join(dirname(fileURLToPath(import.meta.url)), "data", "toa", entry.file);
  return JSON.parse(await readFile(file, "utf8")) as ToaSeason;
}

/* ------------------------------------------------------------------------------------- floors as fought */

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ENEMY_BY_NAME = new Map<string, { key: string; name: string; imageUrl: string; resist: ResistStats; type: string }>();
for (const [key, e] of Object.entries(enemies)) if (!ENEMY_BY_NAME.has(norm(e.name))) ENEMY_BY_NAME.set(norm(e.name), { key, ...e });

/** This app's enemy entry for a floor's enemy name (RES, portrait), null where the app has none. */
export function enemyInfo(name: string): { key: string; name: string; imageUrl: string; resist: ResistStats; type: string } | null {
  return ENEMY_BY_NAME.get(norm(name)) ?? null;
}

/** One stretch of a floor's HP fought against one RES table, in order (adds first, bosses last). */
export interface HpSegment {
  /** the enemies it covers */
  names: string[];
  hp: number;
  res: Record<Element, number>;
  /** an enemy the app's list doesn't know: RES fell back to 10 % */
  resGuessed: boolean;
}

/** A floor's HP as the engine fights it: each enemy group's HP (once per group, as the sheet's adjusted total
 *  counts it) with that enemy's own RES plus the floor's RES effects; neighbours with the same table merge. */
export function hpSegments(floor: ToaFloor): HpSegment[] {
  const effects = floor.effects.flatMap((e) => e.model);
  const out: HpSegment[] = [];
  for (const e of floor.enemies) {
    if (!e.hp) continue;
    const info = enemyInfo(e.name);
    const res = resTable(info?.resist ?? {}, effects);
    const last = out[out.length - 1];
    if (last && ELEMENTS.every((el) => last.res[el] === res[el])) {
      last.names.push(e.name);
      last.hp += e.hp;
      last.resGuessed ||= !info;
    } else out.push({ names: [e.name], hp: e.hp, res, resGuessed: !info });
  }
  // the sheet's own total is the figure shown: keep the segments summing to it exactly
  const sum = out.reduce((s, x) => s + x.hp, 0);
  if (floor.hp && out.length && sum !== floor.hp) out[out.length - 1]!.hp += floor.hp - sum;
  return out;
}

/** The engine profile each HP segment of a floor runs against — what the worker is sent. */
export function segmentProfiles(floor: ToaFloor): FloorProfileSpec[] {
  const effects = floor.effects.flatMap((e) => e.model).filter(hasGear);
  return hpSegments(floor).map((s) => ({ level: floor.level, res: s.res, effects }));
}

/** The floors with HP the engine can time (Hazard 1–4 and each side tower's 4th), in tower order. */
export function timedFloors(season: ToaSeason): ToaFloor[] {
  return season.towers.flatMap((t) => t.floors).filter((f) => f.hp !== null && f.hp > 0);
}

export const towerOf = (season: ToaSeason, floor: ToaFloor): ToaTower => season.towers.find((t) => t.floors.includes(floor))!;

/** Short names: "Hazard 1", "Resonant 4". */
export function floorLabel(id: string): string {
  const [tower, n] = id.split("-");
  return `${tower!.charAt(0).toUpperCase()}${tower!.slice(1)} ${n}`;
}

/** Every effect chip of a floor, with how the engine treats it. */
export function floorChips(floor: ToaFloor): Array<{ key: string; label: string; note: string; fidelity: ReturnType<typeof fidelityOf>; text: string }> {
  return floor.effects.flatMap((e) =>
    e.model.map((m, i) => ({
      key: `${e.id}:${i}`,
      label: m.label,
      text: e.text,
      fidelity: fidelityOf(m),
      note:
        m.note ??
        (m.kind === "res" ? "Applied to the enemy's resistance table." : m.kind === "unmodelled" ? "Not simulated." : "Simulated as written."),
    })),
  );
}

/** Does the floor field more than one enemy (an estimate: waves summed as one HP pool)? */
export const multiEnemy = (floor: ToaFloor): boolean => floor.enemies.length > 1 || floor.enemies.some((e) => e.count > 1);
