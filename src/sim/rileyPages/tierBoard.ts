// Wuthering Tools+ — the Tier list's Board view (TierBoard.vue): Riley's tier list as portraits in T0 to T4 bands.
//
// One source of truth: the board is read off the table his tierlist.ts has just drawn (`parseTierTable`), after each
// of his redraws, never computed a second time. His tierlist.ts exports nothing (compute() and render() are private
// to his module), so the drawn rows are the only place his tiers exist outside it; reading them means the board can
// only show what his table shows, at the same Team Cost, Matrix setting and "My account" state. DOM-free apart from
// `parseTierTable`, which takes any element (a jsdom one in the tests).

import { costLabel } from "../kits/kits";

export const BLOCKS = ["Main DPS", "Sub DPS", "Support"] as const;
export const TIER_NAMES = ["T0", "T1", "T2", "T3", "T4"] as const;
/** His tier colours (tierlist.ts TIERS), the accents of the bands; the image uses them as they are. */
export const TIER_COLORS: Record<string, string> = { T0: "#e5484d", T1: "#f0883e", T2: "#f0b444", T3: "#45d6a4", T4: "#5b9cff" };

export interface BoardEntry {
  /** his resonator name ("Havoc Rover") */
  name: string;
  /** his icon's address as he drew it (`./images/resonators/<id>.webp`), or "" */
  icon: string;
  /** the figure as he printed it ("1.23M") */
  figure: string;
  /** his link to the best team (`./team#…`), or "" where he drew none */
  href: string;
}
export interface BoardBand { tier: string; entries: BoardEntry[] }
export interface BoardBlock { title: string; bands: BoardBand[] }
export interface TierBoardModel {
  /** what the figures are: his "Best Team DPR" heading, or "DPS" after a tap on it */
  mode: "DPR" | "DPS";
  blocks: BoardBlock[];
}

const emptyBlocks = (): BoardBlock[] => BLOCKS.map((title) => ({ title, bands: TIER_NAMES.map((tier) => ({ tier, entries: [] })) }));

/**
 * His drawn table → the board. His grid: one `.trow` per line, the first line of each tier band carrying `.c.tier`
 * (its name), then one `.sec` per block in order (Main DPS, Sub DPS, Support), each holding a `.c.name` (icon and
 * `.res-label`) and a `.c.total` (the figure, a link to the team) or two empty cells.
 */
export function parseTierTable(root: ParentNode): TierBoardModel {
  const blocks = emptyBlocks();
  const head = root.querySelector(".trow.thead .modehead")?.textContent ?? "";
  let tier = -1;
  for (const row of root.querySelectorAll(".trow:not(.thead)")) {
    const label = row.querySelector(":scope > .c.tier")?.textContent?.trim();
    if (label) tier = TIER_NAMES.indexOf(label as (typeof TIER_NAMES)[number]);
    if (tier < 0) continue;
    [...row.querySelectorAll(":scope > .sec")].forEach((sec, b) => {
      const name = sec.querySelector(".c.name .res-label")?.textContent?.trim();
      if (!name || !blocks[b]) return;
      const total = sec.querySelector(".c.total");
      blocks[b]!.bands[tier]!.entries.push({
        name,
        icon: sec.querySelector(".c.name img")?.getAttribute("src") ?? "",
        figure: total?.textContent?.trim() ?? "",
        href: total?.querySelector("a")?.getAttribute("href") ?? "",
      });
    });
  }
  return { mode: /DPS/.test(head) ? "DPS" : "DPR", blocks };
}

/** Where each resonator sits: "Main DPS/T1/Camellya" lines, the test's way to hold the board against the table. */
export function placements(model: TierBoardModel): string[] {
  return model.blocks.flatMap((b) => b.bands.flatMap((band) => band.entries.map((e) => `${b.title}/${band.tier}/${e.name}`)));
}

export const isEmpty = (model: TierBoardModel | null): boolean => !model || placements(model).length === 0;

/** "damage per rotation of the best team" / "damage per second …", the figure's label in words. */
export const figureLabel = (mode: TierBoardModel["mode"]): string =>
  mode === "DPS" ? "damage per second of the best team" : "damage per rotation of the best team";

/** The block's owned line: "You own 4 of the 6 main DPS in T0 and T1." Null without an account. */
export function ownedLine(block: BoardBlock, owned: ReadonlySet<string> | null): string | null {
  if (!owned) return null;
  const top = block.bands.slice(0, 2).flatMap((b) => b.entries);
  if (!top.length) return null;
  const mine = top.filter((e) => owned.has(e.name)).length;
  const what = block.title === "Support" ? "supports" : block.title.replace(/^(\w+) DPS$/, (_m, w: string) => `${w.toLowerCase()} DPS`);
  return `You own ${mine} of the ${top.length} ${what} in T0 and T1.`;
}

/** His Team Cost in words, for the picture's footer: the chip /rankings shows for it ("S6R5 all"). */
export function costWords(cost: string): string {
  if (cost === "mine") return "Team Cost: My account (own sequences and weapons)";
  return `Team Cost: ${costLabel(cost)}`;
}

/** The footer line of the saved picture. `date` as the reader's own calendar day (YYYY-MM-DD). */
export function imageFooter(cost: string, matrix: boolean, date: string, marked = false): string {
  // a picture with the account's rings says what a ring means: a posted image has no page around it
  const key = marked ? " · Ringed: in my account" : "";
  return `${costWords(cost)} · Matrix Buffs ${matrix ? "on" : "off"}${key} · ${date} · Tiers by Riley31415's wuwa_calc · made with Wuthering Tools+`;
}

/** The day in the reader's time zone, "2026-11-23". */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A resonator's brief, `/kit/<slug>`, where one exists. */
export function kitPathFor(name: string, briefs: ReadonlySet<string>): string | null {
  if (!briefs.has(name)) return null;
  return `/kit/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}
