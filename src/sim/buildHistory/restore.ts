// Wuthering Tools+ build history — putting a version back. `planRestore` (pure) says what a restore would change and
// where each echo comes from; `applyRestore` first saves the build as it is now ("before a restore"), then writes the
// version through the stores' own actions: `ensureCharacterBuilds`, the inventory's `saveEcho` for an echo the
// inventory no longer holds, one `$patch` of the character record (upstream's `applyBuildFields`, the same split
// `equipBuild` makes), and `applyEchoLoadout` for the echo pointers and the `equipped` map.
//
// A restore writes into the build the character wears now (`activeBuildId`); their other builds, level, talents,
// substat weights, notes, portrait and build-card colour stay as they are.
import { applyBuildFields, extractBuildFields } from "../../characters/buildFields";
import { randomString } from "../../utils/strings";
import { characterName, buildFieldsFromMember, echoProblem, echoSlotsOf, inventoryEchoOf, type ShareEcho } from "../share/buildCodec";
import { echoFingerprint } from "../share/mergePreview";
import { gearDiff } from "./diff";
import { hasBuild, recordVersion, versionOf, type HistoryStorage, type HistoryVersion, type RecordResult } from "./history";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Build-scoped fields a version never carries (the share format leaves them out): a restore keeps today's. */
const KEEP_FIELDS = ["customPortrait", "customPortraitTransform", "buildCardPrimaryColor", "notes", "progressOverrides", "buildStatus", "buildComplete"];

export interface RestoreAccount {
  characters: Record<string, any>;
  echoes: any[];
  equipped: Record<string, Record<string, number>>;
}

export interface RestoreEcho {
  slot: number;
  /** owned: an inventory echo with exactly these stats; new: added back to the inventory; skipped: the slot stays empty */
  status: "owned" | "new" | "empty" | "skipped";
  echoId: string | null;
  echo: ShareEcho | null;
  /** other characters wearing that inventory echo today (both will wear it) */
  wornBy: string[];
  reason?: string;
}

export interface RestorePlan {
  charId: string;
  versionId: string;
  /** the build the restore writes into: the one worn now (its id, `null` with no builds list yet) */
  targetBuildName: string;
  targetBuildId: string | null;
  /** the build the version was taken from */
  versionBuildName: string;
  echoes: RestoreEcho[];
  /** what changes, now → the version, one line per weapon / sequence / slot */
  changes: string[];
  /** echoes, builds and character fields, in words (the confirm lists these after the changes) */
  notes: string[];
  /** nothing a restore writes differs from now */
  identical: boolean;
  newEchoes: number;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T;

function activeBuildName(record: Record<string, any> | undefined): string {
  const builds: any[] = Array.isArray(record?.builds) ? record!.builds : [];
  return String(builds.find((b) => b.id === record?.activeBuildId)?.name ?? builds[0]?.name ?? "Default build");
}

/** Each slot's echo: an inventory echo with the same stats (the one worn there now first, then one nobody else wears),
 *  else added back, unless the game could not drop it. */
function matchEchoes(charId: string, version: HistoryVersion, account: RestoreAccount): RestoreEcho[] {
  const record = account.characters?.[charId];
  const wornNow: string[] = Array.from({ length: 5 }, (_, i) => record?.echoes?.[i]?.echoId ?? null).filter(Boolean);
  const byFp = new Map<string, string[]>();
  for (const e of account.echoes ?? []) {
    const fp = echoFingerprint(e);
    if (!fp || typeof e?.echoId !== "string") continue;
    byFp.set(fp, [...(byFp.get(fp) ?? []), e.echoId]);
  }
  const others = (id: string): string[] => Object.keys(account.equipped?.[id] ?? {}).filter((c) => c !== charId);
  const used = new Set<string>();
  return version.payload.members[0].echoes.map((echo, slot) => {
    if (!echo) return { slot, status: "empty", echoId: null, echo: null, wornBy: [] };
    const problem = echoProblem(echo);
    if (problem) return { slot, status: "skipped", echoId: null, echo, wornBy: [], reason: problem };
    const ids = (byFp.get(echoFingerprint(echo) ?? "") ?? []).filter((id) => !used.has(id));
    const pick =
      ids.find((id) => id === record?.echoes?.[slot]?.echoId) ??
      ids.find((id) => wornNow.includes(id)) ??
      ids.find((id) => others(id).length === 0) ??
      ids[0];
    if (!pick) return { slot, status: "new", echoId: null, echo, wornBy: [] };
    used.add(pick);
    return { slot, status: "owned", echoId: pick, echo, wornBy: others(pick) };
  });
}

/** What restoring `version` would do to the character today. */
export function planRestore(charId: string, version: HistoryVersion, account: RestoreAccount): RestorePlan {
  const record = account.characters?.[charId];
  const member = version.payload.members[0];
  const now = record ? versionOf(charId, record, account.echoes ?? [], "manual").payload.members[0] : null;
  const diff = now ? gearDiff(charId, now, member) : null;
  const echoes = matchEchoes(charId, version, account);
  const targetBuildName = activeBuildName(record);
  const notes: string[] = [];
  const name = characterName(charId);
  for (const e of echoes) {
    if (e.status === "new") notes.push(`Slot ${e.slot + 1}: no echo in your inventory has these stats any more, so it is added back to the inventory.`);
    if (e.status === "skipped") notes.push(`Slot ${e.slot + 1} stays empty: ${e.reason}.`);
    if (e.status === "owned" && e.wornBy.length) notes.push(`Slot ${e.slot + 1}: that echo is also worn by ${e.wornBy.map((c) => characterName(c)).join(", ")} now; both will wear it.`);
  }
  if (version.buildName !== targetBuildName) notes.push(`This version was saved from the build “${version.buildName}”; it is written into “${targetBuildName}”, the build ${name} wears now.`);
  else notes.push(`Written into “${targetBuildName}”, the build ${name} wears now. Other builds are not touched.`);
  if (diff?.characterNotes.length) notes.push(`${diff.characterNotes.join(", ")}: level and talents belong to the character, so today's stay.`);
  // a character with no weapon and no echoes today has no build to keep (recordVersion stores nothing for them)
  if (hasBuild(record)) notes.push("The build as it is now is saved to the history first (“Before a restore”).");
  return {
    charId,
    versionId: version.id,
    targetBuildName,
    targetBuildId: typeof record?.activeBuildId === "string" ? record.activeBuildId : null,
    versionBuildName: version.buildName,
    echoes,
    changes: diff?.summary ?? [],
    notes,
    identical: !!diff?.identical && echoes.every((e) => e.status !== "new"),
    newEchoes: echoes.filter((e) => e.status === "new").length,
  };
}

/** The character record after the restore (pure): the version's build fields over today's record. */
export function restoredRecord(current: Record<string, any>, version: HistoryVersion, echoIds: Array<string | null>): Record<string, any> {
  const member = version.payload.members[0];
  const fields = buildFieldsFromMember(member, echoSlotsOf(echoIds));
  // per-weapon settings: today's for every other weapon, the version's refinement and level for its own
  const weapons: Record<string, any> = clone(current?.weapons ?? {}) ?? {};
  if (member.weapon) {
    const w: Record<string, any> = { ...(weapons[member.weapon.id] ?? {}), refinement: String(member.weapon.rank) };
    if (member.weapon.level !== null) w.weaponLevel = String(member.weapon.level);
    else delete w.weaponLevel;
    weapons[member.weapon.id] = w;
  }
  fields.weapons = weapons;
  for (const k of KEEP_FIELDS) if (current && k in current) fields[k] = clone(current[k]);
  return applyBuildFields(current ?? {}, fields);
}

/** The stores' actions a restore uses (the real Pinia stores, or stand-ins in tests). */
export interface RestoreStores {
  character: {
    characters: Record<string, any>;
    ensureCharacterBuilds(characterId: string): void;
    // eslint-disable-next-line no-unused-vars -- the parameter of a function type
    $patch(fn: (state: any) => void): void;
    applyEchoLoadout(characterId: string, options: { echoIds?: Array<string | null>; presetId?: string | null; fillSlots?: number }): void;
  };
  inventory: {
    echoes: any[];
    equipped: Record<string, Record<string, number>>;
    saveEcho(data: Record<string, unknown>): void;
  };
}

export interface RestoreOutcome {
  /** the "before a restore" version (or why none was stored: same as the newest) */
  before: RecordResult;
  plan: RestorePlan;
  addedEchoes: string[];
}

/** Nothing was restored: the character wears another build than the one the confirm named (another tab switched it). */
export class RestoreRefused extends Error {
  constructor(charName: string, named: string, now: string) {
    super(`${charName} wears “${now}” now, not “${named}” that the question named (another tab switched it, perhaps), so nothing was restored. Press Restore again to see what it changes now.`);
    this.name = "RestoreRefused";
  }
}

export interface RestoreOptions {
  storage?: HistoryStorage;
  now?: number;
  /** the build the confirm named (`RestorePlan.targetBuildId`): anything else worn now refuses, nothing written */
  intoBuildId?: string | null;
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  newId?: (length: number) => string;
}

/** Restores `version` as the character's current build. Plans again from the stores, so a stale plan never writes. */
export function applyRestore(stores: RestoreStores, charId: string, version: HistoryVersion, options: RestoreOptions = {}): RestoreOutcome {
  const now = options.now ?? Date.now();
  const newId = options.newId ?? ((n: number) => randomString(n));
  const account = (): RestoreAccount => ({ characters: stores.character.characters, echoes: stores.inventory.echoes, equipped: stores.inventory.equipped });
  const plan = planRestore(charId, version, account());
  // the confirm said which build is written into: a tap after another tab switched builds must not write another one
  if (options.intoBuildId !== undefined && plan.targetBuildId !== options.intoBuildId) {
    const named = (stores.character.characters[charId]?.builds ?? []).find((b: any) => b?.id === options.intoBuildId)?.name ?? "the build it named";
    throw new RestoreRefused(characterName(charId), String(named), plan.targetBuildName);
  }

  // 1. the build as it is now goes into the history before anything is written
  const before = recordVersion(charId, stores.character.characters[charId], stores.inventory.echoes, "before-restore", { storage: options.storage, now });

  // 2. echoes the inventory lacks go back in
  const addedEchoes: string[] = [];
  const echoIds = plan.echoes.map((e) => {
    if (e.status === "owned") return e.echoId;
    if (e.status !== "new" || !e.echo) return null;
    const echoId = newId(10);
    stores.inventory.saveEcho({ ...inventoryEchoOf(e.echo), echoId });
    addedEchoes.push(echoId);
    return echoId;
  });

  // 3. the record: the version's build fields; the active build's stored entry follows the live fields
  stores.character.ensureCharacterBuilds(charId);
  const next = restoredRecord(clone(stores.character.characters[charId]), version, echoIds);
  const builds: any[] = Array.isArray(next.builds) ? next.builds : [];
  const i = builds.findIndex((b) => b?.id === next.activeBuildId);
  if (i >= 0) {
    const b = builds[i];
    builds[i] = { id: b.id, name: b.name, createdAt: b.createdAt, updatedAt: now, ...extractBuildFields(next) };
  }
  stores.character.$patch((state: any) => {
    state.characters[charId] = next;
  });

  // 4. the echo pointers and the inventory's `equipped` map, as the echoes panel writes them
  stores.character.applyEchoLoadout(charId, { echoIds, presetId: null, fillSlots: 5 });
  return { before, plan, addedEchoes };
}
