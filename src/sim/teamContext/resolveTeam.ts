// Wuthering Tools+ — team-aware context resolution for team rotations.
//
// Upstream computes each team slot from that character's stored build, including the *Team Buffs
// panel* selection saved on the character — two teammates picked on the Calculator page, which
// need not be the team's actual members. This resolver rewrites each member's team buffs for the
// team they are actually in:
//   • a panel that already names exactly these teammates is kept verbatim (the user curated it);
//   • otherwise the buffs are derived from what each teammate's own build really provides —
//     their outro / inherent / skill team buffs, sequence-node buffs only when that node is enabled
//     on their build, their weapon's team buff only if they hold that weapon, 5-piece set and
//     main-echo buffs only if equipped — at realistic stacks, with stat-scaled buffs (Shorekeeper's
//     Energy Regen …) fed from the teammate's real stats instead of a typed guess.
// Builds: an explicit per-slot pin wins; else a saved build whose name mentions both teammates is
// used ("Moonlit (Lupa + Galbrena)"); else the active build. A teammate with no build in the account
// still counts as a teammate: their outro / inherent buffs are provided, sequence-node buffs assume S6
// for a 4-star and S0 for a 5-star, and nothing gear-based. Per-action advanced overrides still
// apply on top inside the engine, and `auto: false` is a strict passthrough (upstream behaviour).
// Three rules added 2026-09-15 after the rotation-import audit (every one over-buffed a support):
//   • a provider with Resonance Modes (Aemeath, Denia, Lucilla, Lynae) brings only the mode they are
//     in — a buff bound to another mode by its `stance` or its key suffix (…FusionBurst, …TuneStrain2)
//     is skipped;
//   • a buff worded for "the incoming Resonator" / "the next character" is an outro handoff: when the
//     team's actions say who follows the provider's block in the loop, only that character receives
//     it (a team with no actions keeps the old everyone-gets-it behaviour);
//   • a sequence-node buff is recognised by "Sequence Node N:" or "SN:" in its name (Suisui's
//     "S2: Clouds Pour…" used to leak at S0).
// Pure/async; no Vue. Consumers: Team Rotations pages, /my-rankings, the CLI.
import { allEchoBuffs, allWeaponTeamBuffs, buffsByCharacter } from "../../buffs/index";
import {
  buildCharacterCalculationContext,
  resolveCharacterEchoes,
  resolveTeamEnemyConfig,
  type TeamEnemyConfig,
} from "../../calculator/buildCharacterContext";
import { resolveCharactersForBuild } from "../../calculator/buildOverride";
import { getCharByName, getCharacterRosterDisplayName } from "../../characters/characters";
import { getEffectiveMaxStacks, getRealisticMaxStacks } from "../../characters/effectiveBuffStacks";
import { isBuffActiveForStance, resolveActiveStance } from "../../calculator/stances";

interface BuffDef {
  key: string;
  name?: string;
  details?: string;
  stance?: string;
  imageUrl?: string;
  hasStacks?: boolean;
  maxStacks?: number;
  realisticMaxStacks?: number;
  alwaysEnabled?: boolean;
  inputBase?: boolean;
  modifierBasedOn?: string | null;
  realisticBaseAttrValue?: number;
}

export interface TeamBuffEntry {
  isEnabled: boolean;
  stacks?: number;
  refinement?: string | number;
  baseAttrValue?: number;
}

export interface SkippedBuff {
  key: string;
  from: string;
  reason: string;
}

export interface SlotResolution {
  slot: number;
  characterId: string;
  buildId: string | null;
  buildName: string | null;
  buildSource: "pinned" | "named" | "active";
  teammates: string[];
  /** panel = the character's own Team Buffs selection already named these teammates and was kept */
  buffSource: "panel" | "derived" | "off";
  enabled: string[];
  skipped: SkippedBuff[];
}

export interface TeamResolution {
  characters: Record<string, any>;
  /** pass these to the engine instead of the team's own — pins are already baked into `characters` */
  buildIds: Array<string | null>;
  slots: SlotResolution[];
  auto: boolean;
}

export interface ResolveTeamOptions {
  /** false = upstream behaviour: the stored builds and panels untouched */
  auto?: boolean;
  enemyConfig?: TeamEnemyConfig;
}

export interface TeamLike {
  characterIds: Array<string | null>;
  buildIds?: Array<string | null>;
  enemyConfig?: Record<string, any> | null;
  /** the team's rotation, when known: the order of its blocks says who each member hands off to */
  actions?: Array<{ slot?: number; order?: number; type?: string; isDisabled?: boolean }> | null;
  /** who each member hands off to after their Outro, when the import recorded it (src/sim/rankings) — preferred
   *  over the block order, which off-field hits can blur */
  handoffs?: Record<string, string[]> | null;
}

/** A buff worded for the one Resonator who comes in after the provider's Outro. The plural ("incoming Resonators gain…",
 *  Suisui's Floral Epistle tiers) is a window anyone can enter — even when it goes on to hand something to "the incoming
 *  Resonator" of whoever entered (a two-hop pass the whole team ends up holding) — so it stays team-wide. */
const INCOMING_RE = /incoming resonator(?!s)|next character|next resonator(?!s)|resonator switched onto/i;
const WINDOW_RE = /incoming resonators/i;
const isHandoff = (details: string | undefined): boolean => Boolean(details) && !WINDOW_RE.test(details!) && INCOMING_RE.test(details!);
const SEQUENCE_RE = /^(?:Sequence Node|S)\s?(\d+):/;

/** Who each member hands off to: the character whose actions follow the end of that member's block in the
 *  loop (cyclic) — the rotation order itself, which is what an Outro's "incoming Resonator" means. Read off the
 *  blocks rather than Outro rows because an Outro with no damage (Mornye's, Lucilla's) is no action in this app.
 *  Empty when the actions are unknown or only one member acts, so the caller keeps the old rule. */
export function outroRecipients(team: TeamLike): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const ids = team.characterIds ?? [];
  if (team.handoffs && Object.keys(team.handoffs).length) {
    for (const [from, tos] of Object.entries(team.handoffs)) {
      const set = new Set((tos ?? []).filter((to) => to && to !== from && ids.includes(to)));
      if (set.size) out.set(from, set);
    }
    return out;
  }
  const acts = (team.actions ?? []).filter((a) => a && !a.isDisabled && a.slot != null).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (new Set(acts.map((a) => a.slot)).size < 2) return out;
  for (let i = 0; i < acts.length; i++) {
    const next = acts[(i + 1) % acts.length];
    if (next.slot === acts[i].slot) continue;
    const from = ids[acts[i].slot as number];
    const to = ids[next.slot as number];
    if (!from || !to || from === to) continue;
    const set = out.get(from) ?? new Set();
    set.add(to);
    out.set(from, set);
  }
  return out;
}

/** The provider's mode and the modes a buff of theirs may be bound to instead. */
interface ProviderMode {
  active: string | null;
  others: string[];
}
const modeRe = (stance: string): RegExp => new RegExp(`${compact(stance)}(\\d+|appliers?|shifting)?$`, "i");
/** True when a team buff belongs to one of the provider's modes and it is not the one they are in. */
function boundToAnotherMode(def: BuffDef, mode: ProviderMode): string | null {
  if (!mode.active) return null;
  if (def.stance) return isBuffActiveForStance(def, mode.active) ? null : def.stance;
  const key = def.key.toLowerCase();
  if (modeRe(mode.active).test(key)) return null;
  return mode.others.find((st) => modeRe(st).test(key)) ?? null;
}

const compact = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const basename = (url: string | undefined): string | null => {
  if (!url) return null;
  const file = url.split("/").pop() ?? "";
  return file.replace(/\.[a-z0-9]+$/i, "") || null;
};

/**
 * The ways a teammate can be written in a build name: the key, the roster display name, or any word of
 * the key with 4+ letters ("Yangyang" or "Xuanling" for YangyangXuanling). Case and punctuation ignored.
 */
function nameTokens(characterId: string): string[] {
  const tokens = new Set<string>([compact(characterId)]);
  const display = getCharacterRosterDisplayName(characterId);
  if (display) tokens.add(compact(display));
  for (const word of characterId.match(/[A-Z][a-z]+/g) ?? []) if (word.length >= 4) tokens.add(compact(word));
  return [...tokens].filter((t) => t.length >= 3);
}

function buildNameMentions(buildName: string, characterId: string): boolean {
  const haystack = compact(buildName);
  return nameTokens(characterId).some((token) => haystack.includes(token));
}

function pickBuild(
  data: Record<string, any>,
  pinned: string | null | undefined,
  teammates: string[],
): { buildId: string | null; buildName: string | null; buildSource: SlotResolution["buildSource"] } {
  const builds: Array<{ id: string; name?: string }> = Array.isArray(data?.builds) ? data.builds : [];
  const nameOf = (id: string | null) => builds.find((b) => b.id === id)?.name ?? null;
  if (pinned && builds.some((b) => b.id === pinned)) return { buildId: pinned, buildName: nameOf(pinned), buildSource: "pinned" };
  if (builds.length > 1 && teammates.length) {
    const named = builds.find((b) => b.name && teammates.every((t) => buildNameMentions(b.name as string, t)));
    if (named) return { buildId: named.id, buildName: named.name ?? null, buildSource: "named" };
  }
  const activeId: string | null = data?.activeBuildId ?? null;
  return { buildId: null, buildName: nameOf(activeId), buildSource: "active" };
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function statFor(basedOn: string | null | undefined, finalStats: Record<string, any>): number | null {
  const pct = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 1000) / 10 : null);
  switch (basedOn) {
    case "Energy Regen":
      return pct(finalStats.energyRegen);
    case "Crit Rate":
      return pct(finalStats.totalCritRate);
    case "Crit DMG":
      return pct(finalStats.totalCritDMG);
    default:
      return null;
  }
}

function entryFor(
  provider: string,
  def: BuffDef,
  providerData: Record<string, any>,
  providerStats: Record<string, any> | null,
): TeamBuffEntry {
  const entry: TeamBuffEntry = { isEnabled: true };
  if (def.hasStacks) {
    const cap = getEffectiveMaxStacks(provider, def.key, def.maxStacks, providerData.resonanceChains);
    entry.stacks = getRealisticMaxStacks(cap, def.realisticMaxStacks);
  }
  if (def.inputBase) {
    entry.baseAttrValue =
      (providerStats ? statFor(def.modifierBasedOn, providerStats) : null) ?? def.realisticBaseAttrValue ?? 0;
  }
  return entry;
}

/** Everything `provider`'s build actually brings to `receiver`. */
function providedBy(
  provider: string,
  providerData: Record<string, any> | undefined,
  providerStats: Record<string, any> | null,
  inventoryEchoes: any[],
  skipped: SkippedBuff[],
  assumedSequence: number | null,
  mode: ProviderMode,
  /** who the provider's Outro hands off to; null when the team's actions don't say */
  outroTo: Set<string> | null,
  receiver: string,
): Record<string, TeamBuffEntry> {
  const entries: Record<string, TeamBuffEntry> = {};
  const isSetUp = providerData !== undefined;
  providerData ??= {};
  const chains: Record<string, { isEnabled?: boolean }> = providerData.resonanceChains ?? {};
  const chainCount = Object.values(chains).filter((node) => node?.isEnabled).length;

  for (const def of ((buffsByCharacter as Record<string, BuffDef[]>)[provider] ?? []) as BuffDef[]) {
    const other = boundToAnotherMode(def, mode);
    if (other) {
      skipped.push({ key: def.key, from: provider, reason: `${other} mode; ${provider} is in ${mode.active}` });
      continue;
    }
    if (outroTo && isHandoff(def.details) && !outroTo.has(receiver)) {
      skipped.push({ key: def.key, from: provider, reason: `outro handoff goes to ${[...outroTo].join(" / ")}` });
      continue;
    }
    const requirement = SEQUENCE_RE.exec(def.name ?? "");
    if (requirement) {
      const needed = Number(requirement[1]);
      const owned = !isSetUp
        ? (assumedSequence ?? 0) >= needed
        : def.key in chains
          ? Boolean(chains[def.key]?.isEnabled)
          : chainCount >= needed;
      if (!owned) {
        skipped.push({ key: def.key, from: provider, reason: isSetUp ? `needs S${needed}` : `needs S${needed}, not set up (assumed S${assumedSequence ?? 0})` });
        continue;
      }
    }
    entries[def.key] = entryFor(provider, def, providerData, providerStats);
  }

  const handoffElsewhere = (def: BuffDef): boolean => {
    if (!outroTo || !isHandoff(def.details) || outroTo.has(receiver)) return false;
    skipped.push({ key: def.key, from: provider, reason: `outro handoff goes to ${[...outroTo].join(" / ")}` });
    return true;
  };
  const weapon: string | null = providerData.weapon ?? null;
  for (const def of allWeaponTeamBuffs as BuffDef[]) {
    const weaponKey = basename(def.imageUrl) ?? compact(def.name ?? "");
    if (weapon && (weaponKey === weapon || compact(weaponKey) === compact(weapon))) {
      if (handoffElsewhere(def)) continue;
      entries[def.key] = {
        ...entryFor(provider, def, providerData, providerStats),
        refinement: providerData.weapons?.[weapon]?.refinement ?? 1,
      };
    }
  }

  const echoes = resolveCharacterEchoes(providerData.echoes, inventoryEchoes);
  const setCounts: Record<string, number> = {};
  for (const echo of echoes) if (echo?.echoSet) setCounts[echo.echoSet] = (setCounts[echo.echoSet] ?? 0) + 1;
  const mainEcho: string | null = providerData.mainEcho?.echo ?? null;
  for (const def of allEchoBuffs as BuffDef[]) {
    const url = def.imageUrl ?? "";
    const name = basename(url);
    if (!name) continue;
    if (url.includes("/echoes/sets/")) {
      if ((setCounts[name] ?? 0) >= 5 && !handoffElsewhere(def)) entries[def.key] = entryFor(provider, def, providerData, providerStats);
    } else if (mainEcho && (name === mainEcho || compact(name) === compact(mainEcho))) {
      if (!handoffElsewhere(def)) entries[def.key] = entryFor(provider, def, providerData, providerStats);
    }
  }
  return entries;
}

function needsStats(provider: string, providerData: Record<string, any>): boolean {
  const defs = ((buffsByCharacter as Record<string, BuffDef[]>)[provider] ?? []) as BuffDef[];
  const weapon: string | null = providerData.weapon ?? null;
  const weaponDefs = (allWeaponTeamBuffs as BuffDef[]).filter((d) => weapon && basename(d.imageUrl) === weapon);
  return [...defs, ...weaponDefs].some((d) => d.inputBase);
}

/**
 * Resolves a team's members for the engine: builds pinned per slot (explicit, then by name, then
 * active) and, in auto mode, each member's team buffs rewritten for the team's real composition.
 */
export async function resolveTeamCharacters(
  team: TeamLike,
  characters: Record<string, any>,
  inventoryEchoes: any[],
  options: ResolveTeamOptions = {},
): Promise<TeamResolution> {
  const auto = options.auto ?? true;
  const ids = team.characterIds ?? [];
  const pins = team.buildIds ?? [];
  if (!auto) {
    return {
      characters,
      buildIds: ids.map((_, slot) => pins[slot] ?? null),
      slots: ids.flatMap((id, slot) =>
        id && characters[id]
          ? [{ slot, characterId: id, buildId: pins[slot] ?? null, buildName: null, buildSource: pins[slot] ? "pinned" : "active", teammates: [], buffSource: "off", enabled: [], skipped: [] } as SlotResolution]
          : [],
      ),
      auto: false,
    };
  }

  const present = ids.filter((id): id is string => Boolean(id));
  const slots: SlotResolution[] = [];
  let resolved: Record<string, any> = characters;

  // 1. builds
  for (let slot = 0; slot < ids.length; slot++) {
    const id = ids[slot];
    if (!id || !characters[id]) continue;
    const teammates = present.filter((m) => m !== id);
    const pick = pickBuild(characters[id], pins[slot], teammates);
    resolved = resolveCharactersForBuild(resolved, id, pick.buildId);
    slots.push({ slot, characterId: id, ...pick, teammates, buffSource: "derived", enabled: [], skipped: [] });
  }

  // 2. team buffs, from the build-resolved records
  const enemy = options.enemyConfig ?? resolveTeamEnemyConfig(team.enemyConfig ?? {});
  const statsCache = new Map<string, Promise<Record<string, any> | null>>();
  const statsOf = (id: string): Promise<Record<string, any> | null> => {
    if (!resolved[id] || !needsStats(id, resolved[id])) return Promise.resolve(null);
    let cached = statsCache.get(id);
    if (!cached) {
      cached = buildCharacterCalculationContext(id, resolved, enemy, inventoryEchoes)
        .then((ctx) => ctx.finalStats ?? null)
        .catch(() => null);
      statsCache.set(id, cached);
    }
    return cached;
  };

  // a teammate without a build: a 4-star is assumed S6 (everyone has them), a 5-star S0
  const assumedSequenceOf = async (id: string): Promise<number | null> => {
    if (resolved[id]) return null;
    try {
      const chosen = await getCharByName(id);
      return chosen?.basic?.rarity === 4 ? 6 : 0;
    } catch {
      return 0;
    }
  };

  // the mode each provider is in (their stored stance, else the app's default for the kit) and their Outro handoffs
  const modeCache = new Map<string, Promise<ProviderMode>>();
  const modeOf = (id: string): Promise<ProviderMode> => {
    let cached = modeCache.get(id);
    if (!cached) {
      cached = getCharByName(id)
        .then((chosen: any) => {
          const stances: string[] | undefined = chosen?.basic?.stances;
          const active = resolveActiveStance(stances, resolved[id]?.activeStance, resolved[id]?.buffs ?? null);
          return { active, others: (stances ?? []).filter((st) => st !== active) };
        })
        .catch(() => ({ active: null, others: [] }));
      modeCache.set(id, cached);
    }
    return cached;
  };
  const handoffs = outroRecipients(team);

  const out: Record<string, any> = { ...resolved };
  for (const slotInfo of slots) {
    const data = resolved[slotInfo.characterId];
    const panel = data.teamBuffs ?? {};
    const panelPicks = [panel.selectedCharacter1, panel.selectedCharacter2].filter((x): x is string => Boolean(x));
    if (slotInfo.teammates.length && sameSet(panelPicks, slotInfo.teammates)) {
      slotInfo.buffSource = "panel";
      slotInfo.enabled = Object.entries(panel.buffs ?? {})
        .filter(([, v]) => (v as { isEnabled?: boolean })?.isEnabled)
        .map(([k]) => k);
      continue;
    }
    const buffs: Record<string, TeamBuffEntry> = {};
    for (const teammate of slotInfo.teammates) {
      Object.assign(
        buffs,
        providedBy(
          teammate, resolved[teammate], await statsOf(teammate), inventoryEchoes, slotInfo.skipped, await assumedSequenceOf(teammate),
          await modeOf(teammate), handoffs.get(teammate) ?? null, slotInfo.characterId,
        ),
      );
    }
    slotInfo.enabled = Object.keys(buffs);
    out[slotInfo.characterId] = {
      ...data,
      teamBuffs: {
        ...panel,
        selectedCharacter1: slotInfo.teammates[0] ?? null,
        selectedCharacter2: slotInfo.teammates[1] ?? null,
        buffs,
      },
    };
  }

  return { characters: out, buildIds: ids.map(() => null), slots, auto: true };
}
