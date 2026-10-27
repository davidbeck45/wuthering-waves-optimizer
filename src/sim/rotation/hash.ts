// Wuthering Tools+ — what `/rotation#…` names: one of Riley's teams, solved and traced at the player's account.
//
//   #team=t404                          his team key: the best `mine` row of that team
//   #team=t404-1.0.0.s2.r4-…            his row key (a /rankings row, its picks spelled out): that exact row
//   #chars=Shorekeeper,Lynae,Iuno       three app character keys: the best row over every loadout variant he has
//   &subs=mine|standard|high            the substat spread (default: the account's own echoes)
//   &tab=cue|timeline
//
//   #team=<team code>                   a /rankings team code (his teamcode.ts): its team, at the player's account
//                                       (teamCode.ts reads the team part; the code's own sequences / weapons are not used)
//
// A `team=` value is never used as a team key unread (his rule: `hashTeam()`, never `hashParams().get("team")`). Pure.
import type { RileyPick, SubsMode } from "../engine/rileyRun";

export type RotationTarget =
  | { kind: "team"; teamKey: string; rowKey: string | null; picks: RileyPick[] | null }
  | { kind: "chars"; chars: string[] }
  | { kind: "code"; code: string };

export type RotationTab = "cue" | "timeline";

export interface RotationHash {
  target: RotationTarget | null;
  subs: SubsMode;
  tab: RotationTab;
}

/** His `COMBO_KEY` (page/model.ts): weapon.echo.mainstat.s<seq>.r<rank>[.m][.h][.u<build key>]. */
const COMBO_KEY = /^(\d+)\.(\d+)\.(\d+)\.s(\d+)\.r(\d+)(\.m)?(\.h)?(\.u[0-9a-z]*)?$/;
const TEAM_KEY = /^t\d+$/;

/** A row key's picks (his `picksOfKey`), null where any part is not a combo key. */
export function picksOfRowKey(rowKey: string): RileyPick[] | null {
  const parts = rowKey.split("-");
  if (!TEAM_KEY.test(parts[0] ?? "") || parts.length < 2) return null;
  const picks: RileyPick[] = [];
  for (const k of parts.slice(1)) {
    const p = COMBO_KEY.exec(k);
    if (!p) return null;
    picks.push({ weapon: +p[1]!, echo: +p[2]!, mainstat: +p[3]!, sequence: +p[4]!, refine: +p[5]!, matrix: !!p[6], highSubs: !!p[7], mySubs: !!p[8] });
  }
  return picks;
}

const SUBS: readonly SubsMode[] = ["mine", "standard", "high"];

export function parseRotationHash(hash: string): RotationHash {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const subsRaw = params.get("subs") ?? params.get("tier");
  const subs: SubsMode = SUBS.includes(subsRaw as SubsMode) ? (subsRaw as SubsMode) : "mine";
  const tab: RotationTab = params.get("tab") === "timeline" ? "timeline" : "cue";
  const team = params.get("team")?.trim();
  const chars = params.get("chars")?.trim();
  let target: RotationTarget | null = null;
  if (team) {
    if (TEAM_KEY.test(team)) target = { kind: "team", teamKey: team, rowKey: null, picks: null };
    else {
      const picks = picksOfRowKey(team);
      target = picks ? { kind: "team", teamKey: team.split("-")[0]!, rowKey: team, picks } : { kind: "code", code: team };
    }
  } else if (chars) {
    const list = chars.split(",").map((c) => c.trim()).filter(Boolean);
    if (list.length === 3) target = { kind: "chars", chars: list };
  }
  return { target, subs, tab };
}

export function buildRotationHash(h: Partial<RotationHash> & { target: RotationTarget | null }): string {
  const parts: string[] = [];
  const t = h.target;
  if (t?.kind === "team") parts.push(`team=${t.rowKey ?? t.teamKey}`);
  else if (t?.kind === "chars") parts.push(`chars=${t.chars.map(encodeURIComponent).join(",")}`);
  else if (t?.kind === "code") parts.push(`team=${encodeURIComponent(t.code)}`);
  if (h.subs && h.subs !== "mine") parts.push(`subs=${h.subs}`);
  if (h.tab === "timeline") parts.push("tab=timeline");
  return parts.length ? `#${parts.join("&")}` : "";
}

/** The page for one of his rows / teams / compositions (what the /rankings button and the pickers link to). */
export const rotationPath = (target: RotationTarget, opts: { subs?: SubsMode; tab?: RotationTab } = {}): string =>
  `/rotation${buildRotationHash({ target, ...opts })}`;

/** A stable id for "the same rotation" (the last-team preference, a memo). */
export const targetId = (t: RotationTarget | null): string =>
  !t ? "" : t.kind === "team" ? t.rowKey ?? t.teamKey : t.kind === "chars" ? [...t.chars].sort().join("+") : `code:${t.code}`;
