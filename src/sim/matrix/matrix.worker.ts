// Wuthering Tools+: Endstate Matrix planner worker — scores any three-resonator team with Riley's
// wuwa_calc engine (solver + team run), the way the rankings page scores his curated teams. One
// message per composition and solve state; every loadout variant of each name and every slot order
// is tried (the first slot leads the fight and needs a no-intro chain) and the best total is kept.
// Twin of wuwa-tools/matrix-plan/run_custom_teams.mjs.
import * as T from "@skittle/teams";
import * as S from "@skittle/solver";
import * as R from "@skittle/teamrun";
import { CAST_NAME } from "@skittle/engine/stats";

// wuwa_calc's Type1 / Attribute are `const enum`s (erased at compile time); their values from engine/stats.ts
const TYPE1_NAME: Record<number, string> = { 4096: "Basic", 8192: "Heavy", 12288: "Skill", 16384: "Liberation", 20480: "Intro", 24576: "Outro", 28672: "Echo", 32768: "Status", 36864: "Break", 40960: "Rupture", 49152: "Hack", 53248: "Utility" };
const ATTR_NAME: Record<number, string> = { 64: "Aero", 128: "Electro", 192: "Fusion", 256: "Glacio", 320: "Spectro", 384: "Havoc", 448: "Physical" };

// loadout variants per resonator, by the role they play somewhere in Riley's teams
const asDps = new Map<string, Set<any>>();
const asSupport = new Map<string, Set<any>>();
for (const team of (T as any).ALL_TEAMS as Array<{ loadouts: any[]; mdps: boolean[] }>) {
  team.loadouts.forEach((l, i) => {
    const bucket = team.mdps[i] ? asDps : asSupport;
    const name: string = l.resonator.name;
    if (!bucket.has(name)) bucket.set(name, new Set());
    bucket.get(name)!.add(l);
  });
}
const variants = (name: string, role: "dps" | "support"): any[] => [...((role === "dps" ? asDps : asSupport).get(name) ?? asDps.get(name) ?? asSupport.get(name) ?? [])];
const cannotLead = new Set<any>();

export interface CatalogEntry {
  name: string;
  dps: boolean;
  support: boolean;
  element: string | null;
}

function catalog(): CatalogEntry[] {
  const names = new Set([...asDps.keys(), ...asSupport.keys()]);
  return [...names].sort().map((name) => {
    const l = (asDps.get(name) ?? asSupport.get(name))!.values().next().value;
    return { name, dps: asDps.has(name), support: asSupport.has(name), element: ATTR_NAME[l.resonator.element] ?? null };
  });
}

function score(msg: { id: number; dps: string; mates: [string, string]; state: string }): Record<string, unknown> {
  const dpsVars = variants(msg.dps, "dps"), m1 = variants(msg.mates[0], "support"), m2 = variants(msg.mates[1], "support");
  if (!dpsVars.length || !m1.length || !m2.length) {
    const missing = [msg.dps, ...msg.mates].filter((n) => !variants(n, "dps").length && !variants(n, "support").length);
    return { id: msg.id, ok: false, error: `no wuwa_calc kit for ${missing.join(", ")}` };
  }
  const filters = { ...(S as any).defaultFilters(), cost: msg.state };
  const orders = (x: any, y: any, z: any): any[][] => [[x, y, z], [x, z, y], [y, x, z], [y, z, x], [z, x, y], [z, y, x]];
  let best: Record<string, unknown> | null = null;
  let lastError = "no playable slot order (no member can lead the fight)";
  for (const a of dpsVars) for (const b of m1) for (const c of m2) for (const order of orders(a, b, c)) {
    if (new Set([a.resonator, b.resonator, c.resonator]).size < 3) continue;
    if (cannotLead.has(order[0])) continue;
    const members = order.map((l) => (S as any).member(l, l === a));
    const key = `matrix-${msg.dps}-${msg.mates.join("-")}-${dpsVars.indexOf(a)}${m1.indexOf(b)}${m2.indexOf(c)}-${order.map((l) => l.resonator.name[0]).join("")}`;
    try {
      const solved = (S as any).solveTeam(key, members, filters, null);
      const combos = members.map((m: any, j: number) => (S as any).comboOf(m.loadout, solved.picks[j]));
      const run = (R as any).runTeam(key, members, combos, true);
      if (best && run.total <= (best.total as number)) continue;
      const bySlot: Array<[string, number]> = run.bySlot instanceof Map ? [...run.bySlot] : Array.isArray(run.bySlot) ? run.bySlot : Object.entries(run.bySlot ?? {});
      const casts: Array<Record<string, unknown>> = [];
      for (const lines of run.rotationLines) for (const line of lines) for (const h of (R as any).hitsOf(line)) {
        if (!(h.avg > 0)) continue;
        casts.push({ member: h.member, name: h.action.name, avg: Math.round(h.avg), cast: CAST_NAME[h.action.cast] ?? null, type: TYPE1_NAME[h.action.type1] ?? null, element: ATTR_NAME[h.action.element] ?? null });
      }
      best = {
        id: msg.id, ok: true, dps: msg.dps, mates: msg.mates, state: msg.state, order: members.map((m: any) => m.name), total: Math.round(run.total),
        bySlot: bySlot.map(([k, v]) => [k, Math.round(v)]),
        picks: members.map((m: any, j: number) => ({ name: m.name, sequence: combos[j].sequence, weapon: combos[j].weapon.name, echo: (S as any).echoLabel(m.loadout, combos[j].echo), mainstat: combos[j].mainstat.name })),
        casts,
      };
    } catch (err) {
      const text = String((err as Error)?.message ?? err);
      if (/leads the team but declares no NOINTRO chain/.test(text)) cannotLead.add(order[0]);
      lastError = text.slice(0, 160);
    }
  }
  return best ?? { id: msg.id, ok: false, error: lastError };
}

// Riley's solver registers its own onmessage when it finds itself in a worker; this worker answers the
// planner's messages instead (assigned after the imports, so it is the handler that stays)
self.onmessage = (event: MessageEvent<any>) => {
  const msg = event.data;
  if (msg?.type === "catalog") self.postMessage({ type: "catalog", entries: catalog() });
  else if (msg?.type === "score") self.postMessage({ type: "score", ...score(msg) });
};
