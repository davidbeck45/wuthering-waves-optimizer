// Wuthering Tools+ — wants + switches → the in-game Echo Management grid: one card per Sonata, a KEEP (lock on
// pickup) or DISCARD (mark for discard) verdict per COST 4 / 3 / 1 main stat. Pure and deterministic.
//
// Rules:
//   - a chip somebody on the roster wants is KEEP; any other chip of a planned card is DISCARD
//   - "pair the crit 4-costs" (on by default): where somebody wants a COST 4 Crit. Rate, Crit. DMG is KEEP too, and the
//     other way round — a build takes whichever of the two its substats balance (Ryan's presets ship a CR and a CD
//     build side by side), so discarding the other one would throw away a usable 4-cost of a set the roster wears
//   - "keep every 4-cost" turns a planned card's whole 4-cost row KEEP (4-costs are rare; Batch Mainstat
//     Modification can re-roll a main stat since 3.1)
//   - a Sonata nobody wants is OFF (no plan: the game neither locks nor discards its echoes), or THROWN — every chip
//     DISCARD — when "throw unused sets" is on. A thrown set is thrown whole; keep-all-4 doesn't reach it
//   - the player's own per-chip override beats all of the above; an override on an unused Sonata plans it
import { COST_MAINS, MAIN_LABEL, MAIN_SHORT, chipId, sonatas, type ChipId, type Cost, type MainKey, type Sonata } from "./catalog";
import { SOURCE_ORDER, type Want, type WantSource } from "./wants";

export type Verdict = "keep" | "discard";
export type CardState = "planned" | "off" | "thrown";

export interface PlanOptions {
  keepAll4: boolean;
  throwUnused: boolean;
  /** a wanted COST 4 Crit. Rate keeps Crit. DMG too, and the other way round (missing = on) */
  pairCrit?: boolean;
}

/** The other crit main stat of a COST 4 chip, or null for any other chip. */
export const critPartner = (cost: Cost, main: MainKey): MainKey | null =>
  cost !== 4 ? null : main === "CritRate" ? "CritDMG" : main === "CritDMG" ? "CritRate" : null;

/** set key → chip id → the player's verdict */
export type Overrides = Record<string, Partial<Record<ChipId, Verdict>>>;

export interface WantedBy {
  character: string;
  /** strongest source first, each with up to three distinct details (sorted) and how many more there are */
  sources: Array<{ source: WantSource; details: string[]; more: number }>;
}

export type ChipReason = "wanted" | "critPair" | "keepAll4" | "override" | "unwanted" | "thrown" | "off";

export interface PlanChip {
  id: ChipId;
  cost: Cost;
  main: MainKey;
  label: string;
  short: string;
  /** null on an OFF card: the game does nothing with these echoes */
  verdict: Verdict | null;
  reason: ChipReason;
  override: Verdict | null;
  wantedBy: WantedBy[];
}

export interface PlanRow {
  cost: Cost;
  chips: PlanChip[];
}

export interface SonataCard {
  set: string;
  name: string;
  appName: string | null;
  icon: string | null;
  state: CardState;
  rows: PlanRow[];
  /** every character wanting anything in this Sonata, by name order of key */
  characters: string[];
  keepCount: number;
  overridden: number;
}

export interface EchoPlan {
  cards: SonataCard[];
  summary: { planned: number; off: number; thrown: number; keep: number; discard: number; characters: number };
}

const sourceRank = (s: WantSource): number => SOURCE_ORDER.indexOf(s);

function wantedByOf(wants: Want[]): WantedBy[] {
  const byChar = new Map<string, Map<WantSource, string[]>>();
  for (const w of wants) {
    if (!byChar.has(w.character)) byChar.set(w.character, new Map());
    const m = byChar.get(w.character)!;
    if (!m.has(w.source)) m.set(w.source, []);
    const details = m.get(w.source)!;
    if (!details.includes(w.detail)) details.push(w.detail);
  }
  return [...byChar.entries()]
    .map(([character, m]) => ({
      character,
      sources: [...m.entries()]
        .sort((a, b) => sourceRank(a[0]) - sourceRank(b[0]))
        .map(([source, details]) => {
          const sorted = [...details].sort();
          return { source, details: sorted.slice(0, 3), more: Math.max(0, sorted.length - 3) };
        }),
    }))
    .sort((a, b) => sourceRank(a.sources[0]!.source) - sourceRank(b.sources[0]!.source) || a.character.localeCompare(b.character));
}

function cardOf(sonata: Sonata, wants: Want[], options: PlanOptions, overrides: Partial<Record<ChipId, Verdict>>): SonataCard {
  const own = wants.filter((w) => w.set === sonata.key);
  const byChip = new Map<ChipId, Want[]>();
  for (const w of own) {
    const id = chipId(w.cost, w.main);
    if (!byChip.has(id)) byChip.set(id, []);
    byChip.get(id)!.push(w);
  }
  const validOverrides = Object.entries(overrides ?? {}).filter(([id, v]) => {
    const cost = Number(id.split(":")[0]) as Cost;
    return sonata.costs.includes(cost) && (v === "keep" || v === "discard");
  });
  const hasWant = sonata.costs.some((c) => own.some((w) => w.cost === c));
  const state: CardState = hasWant || validOverrides.length ? "planned" : options.throwUnused ? "thrown" : "off";

  let keepCount = 0;
  let overridden = 0;
  const rows: PlanRow[] = sonata.costs.map((cost) => ({
    cost,
    chips: COST_MAINS[cost].map((main) => {
      const id = chipId(cost, main);
      const chipWants = byChip.get(id) ?? [];
      const partner = critPartner(cost, main);
      const override = (overrides?.[id] as Verdict | undefined) ?? null;
      let verdict: Verdict | null;
      let reason: ChipReason;
      if (override && state === "planned") {
        verdict = override;
        reason = "override";
        overridden++;
      } else if (state === "off") {
        verdict = null;
        reason = "off";
      } else if (state === "thrown") {
        verdict = "discard";
        reason = "thrown";
      } else if (chipWants.length) {
        verdict = "keep";
        reason = "wanted";
      } else if (options.pairCrit !== false && partner && byChip.has(chipId(4, partner))) {
        verdict = "keep";
        reason = "critPair";
      } else if (options.keepAll4 && cost === 4) {
        verdict = "keep";
        reason = "keepAll4";
      } else {
        verdict = "discard";
        reason = "unwanted";
      }
      if (verdict === "keep") keepCount++;
      return { id, cost, main, label: MAIN_LABEL[main], short: MAIN_SHORT[main], verdict, reason, override, wantedBy: wantedByOf(chipWants) };
    }),
  }));
  return {
    set: sonata.key,
    name: sonata.name,
    appName: sonata.appName,
    icon: sonata.icon,
    state,
    rows,
    characters: [...new Set(own.map((w) => w.character))].sort(),
    keepCount,
    overridden,
  };
}

export function buildPlan(wants: Want[], options: PlanOptions, overrides: Overrides = {}, list: Sonata[] = sonatas()): EchoPlan {
  const cards = list.map((s) => cardOf(s, wants, options, overrides[s.key] ?? {}));
  const chips = cards.flatMap((c) => c.rows.flatMap((r) => r.chips));
  return {
    cards,
    summary: {
      planned: cards.filter((c) => c.state === "planned").length,
      off: cards.filter((c) => c.state === "off").length,
      thrown: cards.filter((c) => c.state === "thrown").length,
      keep: chips.filter((c) => c.verdict === "keep").length,
      discard: chips.filter((c) => c.verdict === "discard").length,
      characters: new Set(wants.map((w) => w.character)).size,
    },
  };
}

const COST_WORD: Record<Cost, string> = { 4: "COST 4", 3: "COST 3", 1: "COST 1" };

/** One card as a line of text: "Sun-sinking Eclipse — COST 4: Crit. Rate, Crit. DMG · COST 3: Havoc DMG Bonus · COST 1: ATK". */
export function cardText(card: SonataCard): string {
  if (card.state === "off") return `${card.name} — no plan (leave it off)`;
  if (card.state === "thrown") return `${card.name} — discard everything`;
  const parts = card.rows.map((r) => {
    const keep = r.chips.filter((c) => c.verdict === "keep").map((c) => c.label);
    return `${COST_WORD[r.cost]}: ${keep.length ? keep.join(", ") : "discard all"}`;
  });
  return `${card.name} — ${parts.join(" · ")}`;
}

/** The whole plan as a plain-text checklist (lock list per Sonata), for a note or a Discord message. */
export function planText(plan: EchoPlan, date: string): string {
  const lines = [`Echo Management plan — Wuthering Tools+ (${date})`, "Lock the listed main stats, discard the rest of each COST row.", ""];
  for (const state of ["planned", "thrown", "off"] as CardState[]) {
    const cards = plan.cards.filter((c) => c.state === state);
    if (!cards.length) continue;
    for (const c of cards) lines.push(cardText(c));
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
