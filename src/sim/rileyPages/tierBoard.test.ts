// Wuthering Tools+ — the Tier list's Board view model (tierBoard.ts): his drawn table → bands, owned counts, footer.
import { describe, expect, it } from "vitest";
import { costWords, imageFooter, kitPathFor, ownedLine, parseTierTable, placements } from "./tierBoard";

/** A table in the shape his tierlist.ts render() draws: a tier name on the first row of each band, one `.sec` per block. */
function table(): HTMLElement {
  const cell = (name: string | null, fig = "1.00M") => name
    ? `<div class="sec"><div class="c name res"><img class="icon" src="./images/resonators/${name.length}.webp" alt=""><span class="res-label">${name}</span></div><div class="c num total"><a href="./team#t=abc">${fig}</a></div></div>`
    : `<div class="sec"><div class="c"></div><div class="c"></div></div>`;
  const gap = `<div class="c tiergap"></div>`;
  const row = (tier: string | null, a: string | null, b: string | null, c: string | null) =>
    `<div class="trow">${tier ? `<div class="c tier" style="--tier:#e5484d">${tier}</div>${gap}` : ""}${cell(a)}${gap}${cell(b)}${gap}${cell(c)}</div>`;
  const el = document.createElement("div");
  el.innerHTML = `<div class="tgrid"><div class="trow thead"><div class="c"></div><div class="c num modehead">Best Team DPR</div></div>`
    + row("T0", "Camellya", "Shorekeeper", "Verina")
    + row(null, "Carlotta", null, null)
    + row("T1", "Jinhsi", "Zhezhi", null)
    + row("T3", null, "Havoc Rover", "Aero Rover")
    + `</div>`;
  return el;
}

describe("parseTierTable: the board is his drawn table, read back", () => {
  it("puts every drawn name in the block and tier it is drawn in", () => {
    const m = parseTierTable(table());
    expect(m.mode).toBe("DPR");
    expect(placements(m)).toEqual([
      "Main DPS/T0/Camellya", "Main DPS/T0/Carlotta", "Main DPS/T1/Jinhsi",
      "Sub DPS/T0/Shorekeeper", "Sub DPS/T1/Zhezhi", "Sub DPS/T3/Havoc Rover",
      "Support/T0/Verina", "Support/T3/Aero Rover",
    ]);
    // empty tiers stay as empty bands, five per block
    expect(m.blocks.every((b) => b.bands.map((x) => x.tier).join() === "T0,T1,T2,T3,T4")).toBe(true);
    const cam = m.blocks[0]!.bands[0]!.entries[0]!;
    expect(cam).toEqual({ name: "Camellya", icon: "./images/resonators/8.webp", figure: "1.00M", href: "./team#t=abc" });
  });
  it("reads the DPS mode off his heading", () => {
    const el = table();
    el.querySelector(".modehead")!.textContent = "Best Team DPS";
    expect(parseTierTable(el).mode).toBe("DPS");
  });
});

describe("the owned line", () => {
  const m = parseTierTable(table());
  it("counts the owned among T0 and T1 of the block", () => {
    expect(ownedLine(m.blocks[0]!, new Set(["Camellya", "Jinhsi", "Verina"]))).toBe("You own 2 of the 3 main DPS in T0 and T1.");
    expect(ownedLine(m.blocks[2]!, new Set(["Verina"]))).toBe("You own 1 of the 1 supports in T0 and T1.");
    expect(ownedLine(m.blocks[1]!, new Set())).toBe("You own 0 of the 2 sub DPS in T0 and T1.");
  });
  it("says nothing without an account", () => {
    expect(ownedLine(m.blocks[0]!, null)).toBeNull();
  });
});

describe("the picture's footer", () => {
  it("names the Team Cost in words, the Matrix, the date and the credit", () => {
    expect(imageFooter("s6r5", true, "2026-11-23")).toBe(
      "Team Cost: S6R5 all · Matrix Buffs on · 2026-11-23 · Tiers by Riley31415's wuwa_calc · made with Wuthering Tools+",
    );
    expect(costWords("s0r1")).toBe("Team Cost: S0R1 all");
    expect(costWords("mine")).toContain("My account");
  });
  it("links a brief only where one exists", () => {
    expect(kitPathFor("Havoc Rover", new Set(["Havoc Rover"]))).toBe("/kit/havoc-rover");
    expect(kitPathFor("Nobody", new Set())).toBeNull();
  });
});
