// The CLI's numbers must be the page's numbers: replay every Cypress golden fixture
// (cypress/e2e/calculator/data/<Name>/data.ts — app-exact stats and damage rows the E2E suite asserts
// in the browser) through the headless engine wrapper and demand identical formatted output.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { displayDamage } from "../../utils/numbers";
import { calcCharacter, type AttackRow } from "./engine";
import { parseExport } from "./exportFile";

// vitest runs from the repo root (jsdom gives import.meta.url an http scheme, so no URL maths here)
const DATA_DIR = join(process.cwd(), "cypress/e2e/calculator/data");
const fixtures = readdirSync(DATA_DIR).filter((name) => existsSync(join(DATA_DIR, name, "data.ts")));

interface Fixture {
  config: unknown;
  dataStats: Array<{ selector: string; value: string }>;
  dataAttacks: Array<{ selector: string; values: string[] }>;
}

describe("CLI parity with the calculator page (Cypress golden fixtures)", () => {
  it("finds the golden fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures)(
    "%s: every stat card and attack row matches the fixture",
    async (name) => {
      const fixture = (await import(/* @vite-ignore */ join(DATA_DIR, name, "data.ts"))) as Fixture;
      const exp = parseExport(fixture.config, name);
      const id = exp.activeCharacter;
      expect(id, "fixture has an active character").toBeTruthy();
      const calc = await calcCharacter(id as string, exp);

      const statBySelector = new Map(calc.stats.map((s) => [s.selector, s.display]));
      for (const { selector, value } of fixture.dataStats) {
        expect(statBySelector.get(selector.replace(/^\./, "")), `${name} ${selector}`).toBe(value);
      }

      // Cypress selects rows by a class derived from the label and reads the matched elements' combined
      // text — the page's attack list *and* the saved rotations' action rows (hit counts folded in) —
      // so a label shared by several rows passes when any of them carries the expected numbers.
      const byLabel = new Map<string, AttackRow[]>();
      for (const row of [...calc.attacks, ...calc.rotations.flatMap((r) => r.attacks)]) {
        byLabel.set(row.label, [...(byLabel.get(row.label) ?? []), row]);
      }
      const shown = (row: AttackRow, count: number): string[] =>
        count === 1
          ? [String(displayDamage(row.healing || row.shield || row.normal))] // a healing / shield row shows one amount
          : [row.normal, row.avg, row.crit].slice(0, count).map((n) => String(displayDamage(n)));
      for (const { values } of fixture.dataAttacks) {
        const [label, ...expected] = values;
        const rows = byLabel.get(label);
        expect(rows, `${name}: attack "${label}" (rows: ${[...byLabel.keys()].join(" | ")})`).toBeDefined();
        const candidates = rows!.map((row) => shown(row, expected.length));
        expect(candidates, `${name}: ${label} [normal, average, crit]`).toContainEqual(expected);
      }
    },
    60_000,
  );
});
