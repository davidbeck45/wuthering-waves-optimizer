import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/aiAccount.json";
import { parseExport } from "../cli/exportShape";
import { accountChangedText, accountSnapshot, buildStaticSystemPrompt, pageContextText, STATIC_SYSTEM_PROMPT, substatTierTable, systemBlocks, systemMessage } from "./prompt";

const exp = parseExport(fixture, "aiAccount.json");

describe("static system prompt", () => {
  it("is byte-stable and carries no date or account data (it is the cache prefix)", () => {
    expect(buildStaticSystemPrompt()).toBe(STATIC_SYSTEM_PROMPT);
    expect(STATIC_SYSTEM_PROMPT).not.toMatch(/20\d\d-\d\d-\d\d|\b20\d\d\b/);
    expect(STATIC_SYSTEM_PROMPT).not.toContain("Aemeath");
    expect(STATIC_SYSTEM_PROMPT).not.toContain("Everbright");
    // ≈ 2K tokens: room under the 3K the plan allows
    expect(STATIC_SYSTEM_PROMPT.length / 4).toBeLessThan(3000);
  });

  it("states the role, grounding rule, engine limits, glossary, style and safety", () => {
    for (const phrase of [
      "Wuthering Tools+",
      "Every number you state",
      "must come from a tool result in this conversation",
      "His team numbers are damage per second (DPS)",
      "never with a rotation's total damage",
      "the app's team DPS is about 0.96 of Riley's",
      "Energy Regen reads 0",
      "score damage only",
      "takes its first variant",
      "level 100, 20 % resistance",
      "S0–S6",
      "R1–R5",
      "4-3-3-1-1",
      "Sonata sets",
      "\"My account\" tier",
      "Never claim you changed",
      "Settings › Import replaces the whole app database",
      "Prydwen or Game8",
    ]) {
      expect(STATIC_SYSTEM_PROMPT, phrase).toContain(phrase);
    }
  });

  it("lists the substat tiers from the app's table with expected and median rolls", () => {
    const table = substatTierTable();
    expect(table.split("\n")).toHaveLength(13);
    expect(table).toContain("- Crit Rate: 6.3 / 6.9 / 7.5 / 8.1 / 8.7 / 9.3 / 9.9 / 10.5 % · expected 7.5 · median 7.5");
    expect(table).toContain("- ATK (flat): 30 / 40 / 50 / 60 · expected 44 · median 40");
    expect(STATIC_SYSTEM_PROMPT).toContain(table);
  });
});

describe("account snapshot and per-turn messages", () => {
  it("snapshots the account compactly with display names", () => {
    const s = accountSnapshot(exp);
    expect(s.split("\n")[0]).toBe("# Account snapshot");
    expect(s).toContain("Totals: 3 of 4 characters set up");
    expect(s).toContain("Active character in the calculator: Aemeath.");
    expect(s).toContain('- Aemeath: S6 · Everbright Polestar R5 · build "Default build" (2 builds) · 1 saved rotation');
    expect(s).toMatch(/1\. "wuwa_calc Aemeath[^"]*" — Aemeath \+ Mornye \+ Lynae · 40 actions/);
    expect(accountSnapshot(exp)).toBe(s);
  });

  it("puts both system blocks behind cache breakpoints", () => {
    const blocks = systemBlocks("snap");
    expect(blocks).toEqual([
      { type: "text", text: STATIC_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: "snap", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("writes page context and account-changed notes as mid-conversation system messages", () => {
    expect(pageContextText({ route: "/my-rankings", title: "My roster rankings", activeCharacter: "YangyangXuanling" })).toBe(
      "Page context: The player is on /my-rankings (My roster rankings). Active character in the calculator: Yangyang: Xuanling.",
    );
    expect(systemMessage("x")).toEqual({ role: "system", content: "x" });
    const note = accountChangedText(accountSnapshot(exp));
    expect(note).toMatch(/^The player's data changed/);
    expect(note).not.toContain("# Account snapshot");
    expect(note).toContain("Totals: 3 of 4");
  });
});
