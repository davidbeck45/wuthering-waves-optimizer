// Wuthering Tools+ share cards — the engine number on a card: the build's best rotation (or the team's own
// rotation), scored by this app's damage engine against /my-rankings' enemy (level 100, 20 % RES, no stacks — Riley's
// target), so a card's number sits beside /my-rankings and /rankings. Pure/async (no Vue, no stores).
import { applyBuildFields, omitBuildMetadata } from "../../characters/buildFields";
import { calcTeamRotationDamage } from "../../calculator/teamRotation";
import { RANKING_ENEMY, rotationCandidates, scoreRotation } from "../myRankings/rankRoster";
import { resolveTeamCharacters } from "../teamContext/resolveTeam";
import { buildFieldsFromMember, inlineEchoSlotsOf, type SharePayload, type ShareHeadline, type ShareRotation } from "./buildCodec";

export const HEADLINE_ENEMY = "Lv 100 · 20 % RES";

const yieldNow = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** `characters` with one character's stored build (not the active one) applied as its live record. */
export function charactersWithBuild(characters: Record<string, any>, charId: string, buildId: string | null): Record<string, any> {
  const record = characters?.[charId];
  if (!record || !buildId || buildId === record.activeBuildId) return characters;
  const build = (record.builds ?? []).find((b: any) => b?.id === buildId);
  if (!build) return characters;
  return { ...characters, [charId]: { ...applyBuildFields(record, omitBuildMetadata(build)), activeBuildId: buildId } };
}

export interface BuildHeadline {
  headline: ShareHeadline;
  rotation: ShareRotation;
}

/**
 * The build's best rotation among its own, the curated presets and wuwa_calc's loops — the same pick as
 * /my-rankings — or null when the character has no weapon or no rotation scores.
 */
export async function buildHeadline(charId: string, characters: Record<string, any>, inventoryEchoes: any[], buildId: string | null = null): Promise<BuildHeadline | null> {
  const scoped = charactersWithBuild(characters, charId, buildId);
  const data = scoped?.[charId];
  if (!data?.weapon) return null;
  let best: { score: Awaited<ReturnType<typeof scoreRotation>>; name: string; source: string; rotation: ShareRotation } | null = null;
  for (const c of await rotationCandidates(charId, data)) {
    try {
      const score = await scoreRotation(c.rotation, charId, scoped, RANKING_ENEMY, inventoryEchoes);
      if (!best || score.avgDamage > best.score.avgDamage) {
        best = { score, name: c.name, source: c.source, rotation: { name: c.name, duration: c.rotation.duration ?? null, actions: c.rotation.actions } };
      }
    } catch {
      // a rotation the engine can't score is skipped, as on /my-rankings
    }
    await yieldNow();
  }
  if (!best || best.score.avgDamage <= 0) return null;
  const dps = best.score.dps;
  return {
    headline: {
      metric: dps ? "dps" : "dpr",
      value: dps ?? best.score.avgDamage,
      avgDamage: best.score.avgDamage,
      dps,
      rotationName: best.name,
      source: best.source,
      enemy: HEADLINE_ENEMY,
    },
    rotation: best.rotation,
  };
}

/** A saved team's own rotation, with its pinned builds and (by default) team buffs from its real members. */
export async function teamHeadline(team: Record<string, any>, characters: Record<string, any>, inventoryEchoes: any[], options: { autoTeamBuffs?: boolean } = {}): Promise<ShareHeadline | null> {
  const ids: Array<string | null> = [0, 1, 2].map((i) => team?.characterIds?.[i] ?? null);
  if (!Array.isArray(team?.actions) || !team.actions.length || ids.some((id) => !id || !characters?.[id])) return null;
  const input = { name: team.name, characterIds: ids, buildIds: team.buildIds ?? [null, null, null], actions: team.actions, duration: team.duration ?? null, handoffs: team.handoffs ?? null };
  try {
    const resolution = await resolveTeamCharacters(input, characters, inventoryEchoes, { auto: options.autoTeamBuffs ?? true, enemyConfig: RANKING_ENEMY });
    const result = await calcTeamRotationDamage(
      { ...input, buildIds: resolution.auto ? resolution.buildIds : input.buildIds } as any,
      resolution.characters,
      RANKING_ENEMY,
      inventoryEchoes,
    );
    const avg = result.total.avgDamage ?? 0;
    if (avg <= 0) return null;
    const seconds = Number(team.duration);
    const dps = Number.isFinite(seconds) && seconds > 0 ? (result.dps?.avg ?? avg / seconds) : null;
    return {
      metric: dps ? "dps" : "dpr",
      value: dps ?? avg,
      avgDamage: avg,
      dps,
      rotationName: String(team.name ?? "Team rotation"),
      source: "team",
      enemy: HEADLINE_ENEMY,
      perSlot: ids.map((id) => (id ? (result.perCharacter[id]?.damageAggregation?.avgDamage ?? 0) : 0)),
    };
  } catch {
    return null;
  }
}

/** "1.23M", "456.7K", "9,876" — for a card, where width is tight. */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(value / 1e3).toFixed(1)}K`;
  return Math.round(value).toLocaleString("en-US");
}

export function headlineLabel(h: ShareHeadline): string {
  return h.metric === "dps" ? "DPS" : "avg DMG / rotation";
}

/**
 * The card's own rotation scored by THIS app on the card's build (echoes inline, no inventory) — the importer's
 * check that the card restores what the sharer saw. Null when the card carries no rotation or no config.
 */
export async function verifyBuildHeadline(payload: SharePayload): Promise<number | null> {
  const member = payload.members[0];
  if (payload.kind !== "build" || !member?.config || !payload.rotation?.actions?.length) return null;
  const record = {
    ...buildFieldsFromMember(member, inlineEchoSlotsOf(member)),
    characterLevel: member.level !== null ? String(member.level) : undefined,
    talents: member.talents ?? undefined,
  };
  let id = 0;
  const rotation = {
    id: "shared",
    name: payload.rotation.name,
    duration: payload.rotation.duration ?? null,
    actions: (payload.rotation.actions as any[]).map((a) => ({ ...a, id: a?.id ?? `shared-${id++}`, buffs: a?.buffs ?? [] })),
  };
  try {
    const score = await scoreRotation(rotation as any, member.charId, { [member.charId]: record }, RANKING_ENEMY, []);
    const seconds = Number(payload.rotation.duration);
    return Number.isFinite(seconds) && seconds > 0 && payload.headline?.metric === "dps" ? score.avgDamage / seconds : score.avgDamage;
  } catch {
    return null;
  }
}
