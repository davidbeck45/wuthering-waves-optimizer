import { describe, it, expect } from "vitest";
import {
  parseActionLine,
  rankActionMatches,
  matchActionLine,
  matchActionLines,
  groupCandidates,
  formatActionGroup,
  type MatchableAction,
  type MatchCandidate,
} from "../../src/utils/actionTextMatch";

const ACTIONS: MatchableAction[] = [
  { key: "basic1", label: "Basic Attack", group: "Basic" },
  { key: "heavy1", label: "Heavy Attack", group: "Basic" },
  { key: "skill1", label: "Resonance Skill", group: "Skill" },
  { key: "outro1", label: "Outro Skill", group: "Outro" },
  { key: "outro2", label: "Outro: Wildfire Mark", group: "Outro" },
  { key: "coord1", label: "Coordinated Attack", group: "Skill" },
  { key: "lib1", label: "Resonance Liberation", group: "Liberation" },
];

describe("parseActionLine", () => {
  it("defaults count to 1 when there is no suffix", () => {
    expect(parseActionLine("Heavy Attack")).toEqual({ text: "Heavy Attack", count: 1 });
  });

  it("parses an 'x2' suffix", () => {
    expect(parseActionLine("Heavy Attack x2")).toEqual({ text: "Heavy Attack", count: 2 });
  });

  it("parses a '×2' suffix", () => {
    expect(parseActionLine("Heavy Attack ×2")).toEqual({ text: "Heavy Attack", count: 2 });
  });

  it("parses a '*3' suffix with no surrounding whitespace", () => {
    expect(parseActionLine("Heavy Attack*3")).toEqual({ text: "Heavy Attack", count: 3 });
  });

  it("is case-insensitive on the multiplier symbol", () => {
    expect(parseActionLine("Heavy Attack X4")).toEqual({ text: "Heavy Attack", count: 4 });
  });

  it("trims surrounding whitespace", () => {
    expect(parseActionLine("  Heavy Attack  ")).toEqual({ text: "Heavy Attack", count: 1 });
  });
});

describe("rankActionMatches", () => {
  it("returns an entry for every input action, never dropping any", () => {
    const ranked = rankActionMatches("zzzzz", ACTIONS);
    expect(ranked).toHaveLength(ACTIONS.length);
    expect(new Set(ranked.map((c) => c.key))).toEqual(new Set(ACTIONS.map((a) => a.key)));
  });

  it("sorts results descending by score", () => {
    const ranked = rankActionMatches("Attack", ACTIONS);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score);
    }
  });

  it("scores an exact match at 1.0", () => {
    const ranked = rankActionMatches("Heavy Attack", ACTIONS);
    expect(ranked[0].key).toBe("heavy1");
    expect(ranked[0].score).toBe(1.0);
  });

  it("scores every action for an empty/whitespace-only query as 0", () => {
    const ranked = rankActionMatches("   ", ACTIONS);
    expect(ranked.every((c) => c.score === 0)).toBe(true);
  });

  it("preserves input order on exact ties (stable sort)", () => {
    const tiedActions: MatchableAction[] = [
      { key: "a", label: "Same" },
      { key: "b", label: "Same" },
      { key: "c", label: "Same" },
    ];
    const ranked = rankActionMatches("Same", tiedActions);
    expect(ranked.map((c) => c.key)).toEqual(["a", "b", "c"]);
  });
});

describe("matchActionLine", () => {
  it("returns status 'matched' with score 1.0 for an exact match", () => {
    const result = matchActionLine("Heavy Attack", ACTIONS);
    expect(result.status).toBe("matched");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].key).toBe("heavy1");
    expect(result.candidates[0].score).toBe(1.0);
  });

  it("produces 'ambiguous' for a prefix that matches multiple labels", () => {
    const result = matchActionLine("Outr", ACTIONS);
    expect(result.status).toBe("ambiguous");
    const keys = result.candidates.map((c) => c.key);
    expect(keys).toContain("outro1");
    expect(keys).toContain("outro2");
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  it("produces 'unmatched' with empty candidates for a clearly unrelated query", () => {
    const result = matchActionLine("zzzzz", ACTIONS);
    expect(result.status).toBe("unmatched");
    expect(result.candidates).toEqual([]);
  });

  it("returns 'unmatched' when there are no actions to match against", () => {
    const result = matchActionLine("Heavy Attack", []);
    expect(result.status).toBe("unmatched");
    expect(result.candidates).toEqual([]);
  });

  it("parses and strips an 'x2' suffix before matching", () => {
    const result = matchActionLine("Heavy Attack x2", ACTIONS);
    expect(result.text).toBe("Heavy Attack");
    expect(result.count).toBe(2);
    expect(result.status).toBe("matched");
    expect(result.candidates[0].key).toBe("heavy1");
  });

  it("parses and strips a '×2' suffix before matching", () => {
    const result = matchActionLine("Heavy Attack ×2", ACTIONS);
    expect(result.text).toBe("Heavy Attack");
    expect(result.count).toBe(2);
  });

  it("parses and strips a '*3' suffix before matching", () => {
    const result = matchActionLine("Heavy Attack*3", ACTIONS);
    expect(result.text).toBe("Heavy Attack");
    expect(result.count).toBe(3);
  });

  it("defaults count to 1 when there is no suffix", () => {
    const result = matchActionLine("Heavy Attack", ACTIONS);
    expect(result.text).toBe("Heavy Attack");
    expect(result.count).toBe(1);
  });

  it("matches a small typo via the bigram Dice fallback tier", () => {
    const result = matchActionLine("Corrdinated Attack", ACTIONS);
    // Top candidate should be the intended action with reasonable confidence,
    // even though it falls into the bigram-Dice fallback tier (not an exact/
    // prefix/token/substring match).
    const ranked = rankActionMatches("Corrdinated Attack", ACTIONS);
    expect(ranked[0].key).toBe("coord1");
    expect(ranked[0].score).toBeGreaterThan(0.35);
    expect(["matched", "ambiguous"]).toContain(result.status);
  });

  it("strips a trailing newline from raw but preserves other original formatting", () => {
    const result = matchActionLine("Heavy Attack\n", ACTIONS);
    expect(result.raw).toBe("Heavy Attack");
  });
});

describe("matchActionLines", () => {
  it("skips blank lines entirely", () => {
    const results = matchActionLines("Heavy Attack\n\n   \nBasic Attack", ACTIONS);
    expect(results).toHaveLength(2);
    expect(results[0].candidates[0].key).toBe("heavy1");
    expect(results[1].candidates[0].key).toBe("basic1");
  });

  it("preserves line order", () => {
    const results = matchActionLines("Basic Attack\nHeavy Attack\nResonance Skill", ACTIONS);
    expect(results.map((r) => r.candidates[0]?.key)).toEqual(["basic1", "heavy1", "skill1"]);
  });

  it("handles a full multi-line paste with counts and blank lines", () => {
    const pasted = [
      "Basic Attack x3",
      "",
      "Heavy Attack",
      "  ",
      "Resonance Liberation x1",
    ].join("\n");
    const results = matchActionLines(pasted, ACTIONS);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ text: "Basic Attack", count: 3, status: "matched" });
    expect(results[1]).toMatchObject({ text: "Heavy Attack", count: 1, status: "matched" });
    expect(results[2]).toMatchObject({ text: "Resonance Liberation", count: 1, status: "matched" });
  });

  it("returns an empty array for blank input", () => {
    expect(matchActionLines("", ACTIONS)).toEqual([]);
    expect(matchActionLines("\n\n  \n", ACTIONS)).toEqual([]);
  });
});

// Realistic labels: most attacks don't say what type they are.
const KIT: MatchableAction[] = [
  { key: "intro", label: "Feint Shot DMG", group: "intro" },
  { key: "stage1", label: "Stage 1 DMG", group: "basic" },
  { key: "heavy", label: "Heavy Attack DMG", group: "basic" },
  { key: "skillA", label: "Anchors Aweigh DMG", group: "skill" },
  { key: "skillB", label: "Mist Bullet DMG", group: "skill" },
  { key: "forteMist", label: "Mist Bullet DMG", group: "forteCircuit" },
  { key: "lib", label: "To the Horizon DMG", group: "liberation" },
  { key: "libHeal", label: "To the Horizon Healing", group: "liberation" },
  { key: "outro", label: "Wildfire Mark DMG", group: "outro" },
  { key: "interlude", label: "Interlude Strike", group: "skill" },
];

describe("type-aware matching", () => {
  it("finds an intro attack by a partial type alias even though its label doesn't say 'intro'", () => {
    const ranked = rankActionMatches("int", KIT);
    const intro = ranked.find((c) => c.key === "intro")!;
    expect(intro.score).toBe(0.7);
    expect(intro.matchedBy).toBe("group");
  });

  it("still ranks a label prefix above a type match", () => {
    const ranked = rankActionMatches("int", KIT);
    expect(ranked[0].key).toBe("interlude");
    expect(ranked[0].matchedBy).toBe("label");
    expect(ranked[1].key).toBe("intro");
  });

  it("resolves a pasted 'Intro' line to the character's only intro", () => {
    const result = matchActionLine("Intro", KIT);
    expect(result.status).toBe("matched");
    expect(result.candidates[0].key).toBe("intro");
  });

  it("makes a pasted 'Skill' line ambiguous across the skill attacks", () => {
    const result = matchActionLine("Skill", KIT);
    expect(result.status).toBe("ambiguous");
    expect(result.candidates.every((c) => c.group === "skill")).toBe(true);
  });

  it("looks the group up case-insensitively", () => {
    const actions: MatchableAction[] = [{ key: "fc", label: "Something", group: "FORTECIRCUIT" }];
    expect(rankActionMatches("forte", actions)[0].score).toBe(0.8);
  });

  it("ignores single-character queries for type aliases", () => {
    // "i" still hits "Feint" as a label substring, but never the intro type alias.
    const intro = rankActionMatches("i", KIT).find((c) => c.key === "intro")!;
    expect(intro.matchedBy).toBe("label");
    expect(intro.score).toBeLessThan(0.7);
  });

  it("scopes '<type> <text>' queries to that type's labels", () => {
    const ranked = rankActionMatches("lib horizon", KIT);
    expect(ranked[0].group).toBe("liberation");
    expect(ranked.slice(0, 2).map((c) => c.key).sort()).toEqual(["lib", "libHeal"]);
  });

  it("accepts a colon after the type alias", () => {
    expect(rankActionMatches("skill: anchors", KIT)[0].key).toBe("skillA");
  });

  it("tries the longest alias first", () => {
    const actions: MatchableAction[] = [
      { key: "outroSkill", label: "Outro Skill", group: "outro" },
      { key: "wildfire", label: "Outro: Wildfire Mark", group: "outro" },
    ];
    // "outro skill" is the alias, so only "wildfire" is scored against labels.
    expect(rankActionMatches("outro skill wildfire", actions)[0].key).toBe("wildfire");
  });

  it("uses a '<Type>: <label>' line to pick one of two attacks sharing a label", () => {
    const result = matchActionLine("Forte Circuit: Mist Bullet DMG x2", KIT);
    expect(result).toMatchObject({ status: "matched", count: 2 });
    expect(result.candidates[0].key).toBe("forteMist");
  });
});

describe("groupCandidates", () => {
  const candidate = (key: string, group: string, score: number): MatchCandidate => ({
    key,
    label: key,
    group,
    score,
    matchedBy: "label",
  });

  it("orders buckets by their best score", () => {
    const groups = groupCandidates([candidate("a", "outro", 0.9), candidate("b", "intro", 0.6), candidate("c", "outro", 0.5)]);
    expect(groups.map((g) => g.group)).toEqual(["outro", "intro"]);
    expect(groups[0].items.map((c) => c.key)).toEqual(["a", "c"]);
  });

  it("falls back to game order when scores tie", () => {
    const groups = groupCandidates(rankActionMatches("", KIT));
    expect(groups.map((g) => g.group)).toEqual(["intro", "basic", "skill", "forteCircuit", "liberation", "outro"]);
  });

  it("caps items per group and in total", () => {
    const many = [
      ...["a", "b", "c", "d", "e"].map((k) => candidate(k, "skill", 0.9)),
      ...["f", "g", "h"].map((k) => candidate(k, "basic", 0.8)),
    ];
    const groups = groupCandidates(many, { perGroup: 4, total: 6 });
    expect(groups[0].items).toHaveLength(4);
    expect(groups[1].items).toHaveLength(2);
  });
});

describe("formatActionGroup", () => {
  it("formats known type keys and passes unknown ones through", () => {
    expect(formatActionGroup("forteCircuit")).toBe("Forte Circuit");
    expect(formatActionGroup("tuneBreak")).toBe("Tune Break");
    expect(formatActionGroup("echo")).toBe("echo");
    expect(formatActionGroup(undefined)).toBe("");
  });
});
