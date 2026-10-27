// Wuthering Tools+ share cards — what importing a card would do to the account, and doing it. Pure: the
// account's records in, a plan out (planImport), then the new records (applyImport) that the page writes to the
// stores. Imports only ever ADD: a new build per member (the active build and the live fields stay as they
// are), echoes the inventory lacks, and for a team a new saved team pinned to those builds. Nothing is replaced.
import { randomString } from "../../utils/strings";
import { extractBuildFields } from "../../characters/buildFields";
import { withSequence } from "../myRankings/rankRoster";
import {
  buildFieldsFromMember,
  characterName,
  echoProblem,
  echoSlotsOf,
  inventoryEchoOf,
  isKnownCharacter,
  isKnownWeapon,
  localDate,
  weaponName,
  type ShareEcho,
  type ShareMember,
  type SharePayload,
} from "./buildCodec";

export interface AccountData {
  characters: Record<string, any>;
  echoes: any[];
  teams?: any[];
}

export interface EchoMatch {
  slot: number;
  status: "owned" | "new" | "empty" | "skipped";
  /** the inventory echo a slot will point at ("owned"), set on apply for "new" */
  echoId: string | null;
  echo: ShareEcho | null;
  reason?: string;
}

export interface MemberPlan {
  charId: string;
  name: string;
  status: "add-build" | "new-character" | "skip";
  reason?: string;
  buildName: string;
  /** the character's active build today (unchanged by the import); null for a new character */
  activeBuildName: string | null;
  weapon: { id: string; name: string; ok: boolean } | null;
  echoes: EchoMatch[];
  notes: string[];
}

export interface ImportPlan {
  kind: SharePayload["kind"];
  origin: "wtplus" | "tacet-lab";
  readOnly: boolean;
  members: MemberPlan[];
  team: { name: string; slots: Array<string | null> } | null;
  owned: number;
  added: number;
  skippedEchoes: number;
  canApply: boolean;
  blockers: string[];
}

const round2 = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toString() : "";
};

/** The identity of an echo: name, set, cost, rarity, main stat and its substats (order-free, to 0.01). */
export function echoFingerprint(echo: Record<string, any> | ShareEcho | null | undefined): string | null {
  if (!echo) return null;
  if ("subs" in echo && Array.isArray(echo.subs)) {
    const e = echo as ShareEcho;
    const subs = e.subs.map(([k, v]) => `${k}=${round2(v)}`).sort();
    return [e.key, e.set ?? "", round2(e.cost), round2(e.rarity), e.main ?? "", ...subs].join("|");
  }
  const r = echo as Record<string, any>;
  if (typeof r.echo !== "string" || !r.echo) return null;
  const subs: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const k = r[`echoSubStatsType${i}`];
    const v = r[`echoSubStatsValue${i}`];
    if (typeof k === "string" && k && k !== "none" && v !== null && v !== undefined && v !== "") subs.push(`${k}=${round2(v)}`);
  }
  subs.sort();
  const set = typeof r.echoSet === "string" && r.echoSet !== "none" ? r.echoSet : "";
  return [r.echo, set, round2(r.type), round2(r.rank ?? 5), r.stat ?? "", ...subs].join("|");
}

/** fingerprint → inventory echo ids carrying it, in inventory order */
export function inventoryIndex(echoes: any[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const e of echoes ?? []) {
    const fp = echoFingerprint(e);
    if (!fp || typeof e?.echoId !== "string") continue;
    const list = index.get(fp) ?? [];
    list.push(e.echoId);
    index.set(fp, list);
  }
  return index;
}

/** "Shared · 2026-10-26", made unique among the character's build names. */
export function sharedBuildName(existing: string[], date: string, from?: string): string {
  const base = `Shared · ${date}${from && from !== "Default build" && from !== "Build" ? ` (${from.slice(0, 40)})` : ""}`;
  if (!existing.includes(base)) return base;
  for (let n = 2; ; n++) if (!existing.includes(`${base} ${n}`)) return `${base} ${n}`;
}

const talentLine = (t: Record<string, unknown> | null | undefined): string =>
  ["basic", "skill", "forte", "liberation", "intro"].map((k) => String(t?.[k] ?? 10)).join("/");

function planMember(member: ShareMember, account: AccountData, date: string, index: Map<string, string[]>): MemberPlan {
  const name = characterName(member.charId);
  const record = account.characters?.[member.charId];
  const builds: Array<Record<string, any>> = Array.isArray(record?.builds) ? record.builds : [];
  const plan: MemberPlan = {
    charId: member.charId,
    name,
    status: record ? "add-build" : "new-character",
    buildName: sharedBuildName(builds.map((b) => String(b.name ?? "")), date, member.buildName),
    activeBuildName: record ? String(builds.find((b) => b.id === record.activeBuildId)?.name ?? (builds.length ? builds[0].name : "Default build")) : null,
    weapon: null,
    echoes: [],
    notes: [],
  };
  if (!isKnownCharacter(member.charId)) {
    return { ...plan, status: "skip", reason: `${member.charId} isn't in this app yet, so this build is skipped.` };
  }
  if (member.weapon) {
    const ok = isKnownWeapon(member.weapon.id, member.charId);
    plan.weapon = { id: member.weapon.id, name: weaponName(member.weapon.id, member.charId), ok };
    if (!ok) plan.notes.push(`The weapon ${member.weapon.id} isn't in this app yet (or not for ${name}): the build comes without a weapon.`);
  }
  const used = new Set<string>();
  member.echoes.forEach((echo, slot) => {
    if (!echo) {
      plan.echoes.push({ slot, status: "empty", echoId: null, echo: null });
      return;
    }
    const problem = echoProblem(echo);
    if (problem) {
      plan.echoes.push({ slot, status: "skipped", echoId: null, echo, reason: problem });
      plan.notes.push(`Echo ${slot + 1}: ${problem}, so the slot stays empty.`);
      return;
    }
    const fp = echoFingerprint(echo);
    const owned = (fp ? index.get(fp) : undefined)?.find((id) => !used.has(id));
    if (owned) {
      used.add(owned);
      plan.echoes.push({ slot, status: "owned", echoId: owned, echo });
    } else {
      plan.echoes.push({ slot, status: "new", echoId: null, echo });
    }
  });
  if (record) {
    if (member.talents && talentLine(member.talents) !== talentLine(record.talents)) {
      plan.notes.push(`Talents on the card are ${talentLine(member.talents)}, yours are ${talentLine(record.talents)} — yours stay (talents and level belong to the character, not the build).`);
    }
    if (member.level !== null && String(member.level) !== String(record.characterLevel ?? 90)) {
      plan.notes.push(`The card's ${name} is level ${member.level}, yours is ${record.characterLevel ?? 90} — yours stays.`);
    }
  }
  if (!member.config) plan.notes.push("Gear only: buff toggles, set passives and rotations start at the app's defaults.");
  return plan;
}

export interface PlanOptions {
  now?: Date;
  readOnly?: boolean;
}

/** What importing `payload` into `account` would add. */
export function planImport(payload: SharePayload, account: AccountData, options: PlanOptions = {}): ImportPlan {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(payload.createdAt) ? payload.createdAt : localDate(options.now ?? new Date());
  const index = inventoryIndex(account.echoes ?? []);
  const members = payload.members.map((m) => planMember(m, account, date, index));
  const echoes = members.filter((m) => m.status !== "skip").flatMap((m) => m.echoes);
  const blockers: string[] = [];
  if (options.readOnly) blockers.push("This card comes from a newer Wuthering Tools+ — update the app to import it.");
  if (!members.some((m) => m.status !== "skip")) blockers.push("Nothing on this card is in this app yet.");
  let team: ImportPlan["team"] = null;
  if (payload.kind === "team" && payload.team) {
    const kept = new Set(members.filter((m) => m.status !== "skip").map((m) => m.charId));
    team = { name: payload.team.name, slots: payload.team.characterIds.map((id) => (id && kept.has(id) ? id : null)) };
  }
  return {
    kind: payload.kind,
    origin: payload.origin ?? "wtplus",
    readOnly: !!options.readOnly,
    members,
    team,
    owned: echoes.filter((e) => e.status === "owned").length,
    added: echoes.filter((e) => e.status === "new").length,
    skippedEchoes: echoes.filter((e) => e.status === "skipped").length,
    canApply: blockers.length === 0,
    blockers,
  };
}

export interface ImportResult {
  /** the full new record of every character the import touched */
  characters: Record<string, any>;
  /** echoes to add to the inventory */
  newEchoes: Array<Record<string, unknown>>;
  /** inventory `equipped` entries for characters whose ACTIVE build is the new one (new characters only) */
  equipped: Record<string, Record<string, number>>;
  /** a team to add (importTeam's input), or null */
  team: Record<string, unknown> | null;
  builds: Array<{ charId: string; buildId: string; buildName: string; newCharacter: boolean }>;
}

export interface ApplyOptions {
  now?: Date;
  /** id factory (tests pin it); takes the id length */
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  newId?: (length: number) => string;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T;

/**
 * The records the import writes. Existing characters get one more entry in `builds` and nothing else — the
 * live fields, `activeBuildId` and the other builds are untouched. A character the account lacks is created
 * with the shared build as its only (and so active) build.
 */
export async function applyImport(payload: SharePayload, plan: ImportPlan, account: AccountData, options: ApplyOptions = {}): Promise<ImportResult> {
  if (!plan.canApply) throw new Error(plan.blockers[0] ?? "This card can't be imported.");
  const newId = options.newId ?? ((n: number) => randomString(n));
  const now = (options.now ?? new Date()).getTime();
  const result: ImportResult = { characters: {}, newEchoes: [], equipped: {}, team: null, builds: [] };
  const buildIdOf: Record<string, string> = {};

  for (const [i, member] of payload.members.entries()) {
    const mp = plan.members[i];
    if (!mp || mp.status === "skip") continue;
    const echoIds = mp.echoes.map((e) => {
      if (e.status === "owned") return e.echoId;
      if (e.status !== "new" || !e.echo) return null;
      const echoId = newId(10);
      result.newEchoes.push({ ...inventoryEchoOf(e.echo), echoId });
      return echoId;
    });
    let fields = buildFieldsFromMember(member, echoSlotsOf(echoIds));
    if (mp.weapon && !mp.weapon.ok) {
      fields.weapon = null;
      delete fields.weapons;
    }
    if (!member.config && member.sequence > 0) fields = await withSequence(member.charId, fields, member.sequence);
    if (payload.kind === "build" && payload.rotation && Array.isArray(payload.rotation.actions)) {
      const rotations: any[] = Array.isArray(fields.rotations) ? fields.rotations : [];
      if (!rotations.some((r) => r?.name === payload.rotation!.name)) {
        rotations.push({
          id: newId(10),
          name: payload.rotation.name,
          description: "From a shared Wuthering Tools+ card",
          duration: payload.rotation.duration ?? null,
          actions: clone(payload.rotation.actions).map((a: any) => ({ ...a, id: newId(10) })),
        });
        fields.rotations = rotations;
      }
    }
    const buildId = newId(12);
    // the build's own id / name / timestamps last: nothing in the received fields can override them
    const build = { ...fields, id: buildId, name: mp.buildName, createdAt: now, updatedAt: now };
    buildIdOf[member.charId] = buildId;

    const existing = account.characters?.[member.charId];
    if (existing) {
      const record = clone(existing);
      if (!Array.isArray(record.builds) || record.builds.length === 0) {
        // what the store's ensureCharacterBuilds would do first: today's fields become "Default build"
        const def = { ...extractBuildFields(record), id: newId(12), name: "Default build", createdAt: now, updatedAt: now };
        record.builds = [def];
        record.activeBuildId = def.id;
      }
      record.builds.push(build);
      result.characters[member.charId] = record;
      result.builds.push({ charId: member.charId, buildId, buildName: mp.buildName, newCharacter: false });
    } else {
      const record: Record<string, any> = { ...clone(fields), builds: [build], activeBuildId: buildId };
      if (member.level !== null) record.characterLevel = String(member.level);
      if (member.talents) record.talents = Object.fromEntries(Object.entries(member.talents).map(([k, v]) => [k, String(v)]));
      result.characters[member.charId] = record;
      echoIds.forEach((id, slot) => {
        if (id) result.equipped[id] = { ...(result.equipped[id] ?? {}), [member.charId]: slot };
      });
      result.builds.push({ charId: member.charId, buildId, buildName: mp.buildName, newCharacter: true });
    }
  }

  if (plan.team && payload.team) {
    const slots = plan.team.slots;
    result.team = {
      name: `${payload.team.name} (shared)`,
      characterIds: slots,
      buildIds: slots.map((id) => (id ? (buildIdOf[id] ?? null) : null)),
      actions: (payload.team.actions ?? []).filter((a: any) => {
        const slot = Number(a?.slot); // 0-based (src/calculator/teamRotation.ts)
        return !Number.isFinite(slot) || slots[slot] !== null;
      }),
      duration: payload.team.duration ?? null,
      enemyConfig: payload.team.enemyConfig ?? undefined,
      handoffs: payload.team.handoffs ?? undefined,
      description: payload.team.description ?? "Imported from a shared Wuthering Tools+ card",
    };
  }
  return result;
}
