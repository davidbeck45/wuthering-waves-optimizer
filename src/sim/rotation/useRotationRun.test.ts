// Wuthering Tools+: /rotation runs a team the player saved at the builds it pins — the figure Teams and /energy show
// for it — and every other team at the active builds (2026-11-09 hunt 2, item 2: "Your teams" read 367,567 for a team
// whose pins run 362,854). The loader over a fake client; no engine.
import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import type { RileyClient } from "../engine/rileyClient";
import type { MineSolve, RileyAccount, RileyPick, RunLite } from "../engine/rileyRun";
import type { RotationTarget } from "./hash";
import { useRotationRun } from "./useRotationRun";

const base: RileyAccount = { key: "k", buildsKey: "active", builds: [], entries: {} };
const pins: RileyAccount = { key: "k", buildsKey: "pins", builds: [], entries: {} };
const members = ["Aemeath", "Mornye", "Lynae"];
const pick: RileyPick = { weapon: 0, echo: 0, mainstat: 0, sequence: 0, refine: 1, matrix: false, highSubs: false, mySubs: true };

function fakeClient() {
  const asked: Array<[string, string]> = [];
  const total = (a: RileyAccount | null | undefined): number => (a?.buildsKey === "pins" ? 362_854 : 367_567);
  const client = {
    commit: "test",
    teams: async () => [{ key: "t269", members: members.map((n) => ({ name: n, appKey: n, mainDps: n === "Aemeath" })) }],
    blocked: async () => [],
    teamKeysFor: async (ids: Array<string | null>) => (ids.filter(Boolean).slice().sort().join() === members.slice().sort().join() ? ["t269"] : []),
    solveMine: async (keys: string[], o: { account?: RileyAccount | null } = {}) => {
      asked.push(["solve", o.account?.buildsKey ?? "-"]);
      return keys.map((teamKey) => ({ teamKey, names: members, appKeys: members, status: "ok", fieldable: true, best: { rowKey: `${teamKey}-x`, picks: [pick, pick, pick], total: total(o.account), bySlot: {}, seconds: 25, members: [] } }) as unknown as MineSolve);
    },
    tracedRun: async (teamKey: string, _picks: RileyPick[] | null, o: { account?: RileyAccount | null } = {}) => {
      asked.push(["trace", o.account?.buildsKey ?? "-"]);
      return { teamKey, total: total(o.account), members: [] } as unknown as RunLite;
    },
  } as unknown as RileyClient;
  return { client, asked };
}

/** the page's loader on `target`, with the saved team's own account where `saved` */
async function open(target: RotationTarget, saved: boolean, withAccounts = true) {
  const { client, asked } = fakeClient();
  const key = ref(saved ? "k.pins" : "");
  const accounts = { ofComposition: (ids: ReadonlyArray<string | null | undefined>) => (saved && ids.length === 3 ? pins : base), key };
  let run!: ReturnType<typeof useRotationRun>;
  const wrapper = mount(defineComponent({ setup: () => ((run = useRotationRun(ref(target), ref("mine" as const), ref(base), client, withAccounts ? accounts : null)), () => h("div")) }));
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 50 && run.phase.value !== "ready" && run.phase.value !== "error"; i++) await new Promise((r) => setTimeout(r, 2));
    await nextTick();
  };
  await settle();
  return { run, asked, key, settle, wrapper };
}

describe("/rotation on a team the player saved", () => {
  it("solves and traces it at the builds the team pins", async () => {
    const { run, asked } = await open({ kind: "chars", chars: ["Aemeath", "Mornye", "Lynae"] }, true);
    expect(run.phase.value).toBe("ready");
    expect(asked).toEqual([["solve", "pins"], ["trace", "pins"]]);
    expect((run.run.value as unknown as { total: number }).total).toBe(362_854);
    // his team key names the same three: the same account
    const byKey = await open({ kind: "team", teamKey: "t269", rowKey: null, picks: null }, true);
    expect(byKey.asked).toEqual([["solve", "pins"], ["trace", "pins"]]);
  });

  it("keeps the active builds for a team nobody saved, and for a caller with no saved teams to read", async () => {
    const unsaved = await open({ kind: "chars", chars: ["Aemeath", "Mornye", "Lynae"] }, false);
    expect(unsaved.asked).toEqual([["solve", "active"], ["trace", "active"]]);
    expect((unsaved.run.run.value as unknown as { total: number }).total).toBe(367_567);
    const plain = await open({ kind: "chars", chars: ["Aemeath", "Mornye", "Lynae"] }, true, false);
    expect(plain.asked).toEqual([["solve", "active"], ["trace", "active"]]);
  });

  it("leaves a Team rankings row with its own picks at the account Team rankings showed it at", async () => {
    const row = await open({ kind: "team", teamKey: "t269", rowKey: "t269-0.0.0.s0.r1", picks: [pick, pick, pick] }, true);
    expect(row.asked).toEqual([["solve", "active"], ["trace", "active"]]);
  });

  it("runs again when a saved team's account moves (a pin changed, a pinned build's echoes did)", async () => {
    const { asked, key, settle, run } = await open({ kind: "chars", chars: ["Aemeath", "Mornye", "Lynae"] }, true);
    asked.length = 0;
    key.value = "k.pins2";
    await nextTick();
    await settle();
    expect(run.phase.value).toBe("ready");
    expect(asked).toEqual([["solve", "pins"], ["trace", "pins"]]);
  });
});
