// Wuthering Tools+ — Convene pool types as Kuro's gacha record API numbers them (`cardPoolType`).
//
// Checked 2026-10-12 against public importers and Kuro's own rules:
//   - juliy819/wuwa-gacha-tool, src-tauri/src/gacha/fetcher.rs: POOL_TYPES 1–13, `is_limited_char_pool` = 1/8/10/12,
//     `hard_pity_for_pool` = 50 on pool 5, 80 elsewhere
//     https://github.com/juliy819/wuwa-gacha-tool/blob/HEAD/src-tauri/src/gacha/fetcher.rs
//   - GoneTone/wuthering-waves-convene-gacha-analyzer, lib/data/gacha_types.dart + lib/l10n/app_en.arb: English names,
//     the 4★ guarantee at 10 on every pool
//     https://github.com/GoneTone/wuthering-waves-convene-gacha-analyzer/blob/HEAD/lib/data/gacha_types.dart
//   - ningnao/wuthering-waves-gacha-record, src/core/gacha.rs: queries 1..=13
//     https://github.com/ningnao/wuthering-waves-gacha-record/blob/HEAD/src/core/gacha.rs
//   - Kuro's "Convene Details" notice (news article 758): 5★ guaranteed within 80 Convenes (50 on the beginner banner),
//     a 4★-or-better within 10, the featured resonator's 50/50 with the next 5★ guaranteed after a loss; the
//     Anniversary banners share the Featured pools' guarantee count (articles 2533 / 2535), Reverb resonator banners
//     carry their own 50/50 (article 5065).
// Pure data — no Vue, no stores.

export type PoolKind = "resonator" | "weapon";
export type PoolFamily = "featured" | "standard" | "beginner" | "beginnerChoice" | "newVoyage" | "collab" | "reverb";

export interface ConvenePool {
  /** the API's `cardPoolType` */
  type: number;
  name: string;
  short: string;
  kind: PoolKind;
  family: PoolFamily;
  /** the pull on which a 5★ is guaranteed, counting from the last 5★ (Kuro's published rule) */
  hardPity5: number;
  /** a 4★-or-better is guaranteed within this many pulls */
  hardPity4: number;
  /** a 5★ can be the featured one or a standard one (50/50), with the next 5★ guaranteed after a loss */
  fiftyFifty: boolean;
  /** every 5★ on this pool is the banner's featured item (weapon banners) */
  alwaysFeatured: boolean;
}

const base = { hardPity5: 80, hardPity4: 10 };

export const CONVENE_POOLS: readonly ConvenePool[] = [
  { type: 1, name: "Featured Resonator Convene", short: "Featured Resonator", kind: "resonator", family: "featured", ...base, fiftyFifty: true, alwaysFeatured: false },
  { type: 2, name: "Featured Weapon Convene", short: "Featured Weapon", kind: "weapon", family: "featured", ...base, fiftyFifty: false, alwaysFeatured: true },
  { type: 3, name: "Standard Resonator Convene", short: "Standard Resonator", kind: "resonator", family: "standard", ...base, fiftyFifty: false, alwaysFeatured: false },
  { type: 4, name: "Standard Weapon Convene", short: "Standard Weapon", kind: "weapon", family: "standard", ...base, fiftyFifty: false, alwaysFeatured: false },
  { type: 5, name: "Beginner Convene", short: "Beginner", kind: "resonator", family: "beginner", hardPity5: 50, hardPity4: 10, fiftyFifty: false, alwaysFeatured: false },
  { type: 6, name: "Beginner's Choice Convene", short: "Beginner's Choice", kind: "resonator", family: "beginnerChoice", ...base, fiftyFifty: false, alwaysFeatured: false },
  { type: 7, name: "Beginner's Choice Convene (Giveback)", short: "Beginner's Choice II", kind: "resonator", family: "beginnerChoice", ...base, fiftyFifty: false, alwaysFeatured: false },
  { type: 8, name: "New Voyage Resonator Convene", short: "New Voyage Resonator", kind: "resonator", family: "newVoyage", ...base, fiftyFifty: true, alwaysFeatured: false },
  { type: 9, name: "New Voyage Weapon Convene", short: "New Voyage Weapon", kind: "weapon", family: "newVoyage", ...base, fiftyFifty: false, alwaysFeatured: true },
  { type: 10, name: "Collab Resonator Convene", short: "Collab Resonator", kind: "resonator", family: "collab", ...base, fiftyFifty: true, alwaysFeatured: false },
  { type: 11, name: "Collab Weapon Convene", short: "Collab Weapon", kind: "weapon", family: "collab", ...base, fiftyFifty: false, alwaysFeatured: true },
  { type: 12, name: "Reverb Resonator Convene", short: "Reverb Resonator", kind: "resonator", family: "reverb", ...base, fiftyFifty: true, alwaysFeatured: false },
  { type: 13, name: "Reverb Weapon Convene", short: "Reverb Weapon", kind: "weapon", family: "reverb", ...base, fiftyFifty: false, alwaysFeatured: true },
];

/** every pool type the importer asks Kuro for, in order */
export const CONVENE_POOL_TYPES: readonly number[] = CONVENE_POOLS.map((p) => p.type);

export function poolOf(type: number): ConvenePool | undefined {
  return CONVENE_POOLS.find((p) => p.type === type);
}

/**
 * The 5★ resonators a lost 50/50 hands out (the Beginner's Choice list in Kuro's article 758). `resourceId`s from
 * juliy819's `STANDARD_FIVE_STAR_CHAR_IDS` (parser.rs); the English name is the fallback for records without an id.
 */
export const STANDARD_FIVE_STAR_RESONATORS: readonly { resourceId: number; name: string }[] = [
  { resourceId: 1104, name: "Lingyang" },
  { resourceId: 1203, name: "Encore" },
  { resourceId: 1301, name: "Calcharo" },
  { resourceId: 1405, name: "Jianxin" },
  { resourceId: 1503, name: "Verina" },
];

const STANDARD_IDS = new Set(STANDARD_FIVE_STAR_RESONATORS.map((r) => r.resourceId));
const STANDARD_NAMES = new Set(STANDARD_FIVE_STAR_RESONATORS.map((r) => r.name.toLowerCase()));

/** true when this 5★ resonator comes from the standard pool — on a 50/50 pool, a lost 50/50 */
export function isStandardFiveStarResonator(resourceId: number, name: string): boolean {
  if (resourceId > 0 && STANDARD_IDS.has(resourceId)) return true;
  return STANDARD_NAMES.has(name.trim().toLowerCase());
}

/** Kuro's item ids: resonators are four digits (1104), weapons eight (21010015) — juliy819 splits at 100000 */
export function kindOfResourceId(resourceId: number): PoolKind | null {
  if (!(resourceId > 0)) return null;
  return resourceId < 100000 ? "resonator" : "weapon";
}
