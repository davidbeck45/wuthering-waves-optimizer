// Wuthering Tools+: "Over time" on What's new › Your numbers (src/sim/numbersLog/trends.ts, NumbersTrends.vue): the
// numbers log seeded in its stored form (log.ts `encodeLog`) and read as one line per figure: the rows, an opened chart
// with its marks and their words, the points as a list, the keyboard, the one-record state, and a 360 px phone.
const LOG_KEY = "wtplus:numbers:log:v1";

type Sig = [string | null, number, number, string, string, string, string, string, string];
interface Seed {
  at: number;
  build: string;
  auto?: boolean;
  characters: Array<{ id: string; damage: number; sig: Sig }>;
  teams: Array<{ id: string; name: string; source: 0 | 2; damage: number; def: string; members: string[] }>;
}
function storedLog(entries: Seed[]): string {
  const table: string[] = [];
  const idx = (text: string | null): number => {
    if (text === null) return -1;
    const at = table.indexOf(text);
    return at >= 0 ? at : table.push(text) - 1;
  };
  const e = entries.map((x) => ({
    t: x.at,
    b: idx(x.build),
    o: x.auto === false ? 0 : 1,
    c: x.characters.map((c) => [idx(c.id), idx(`${c.id} loop`), c.damage, idx(c.sig[0]), c.sig[1], c.sig[2], idx(c.sig[3]), idx(c.sig[4]), idx(c.sig[5]), idx(c.sig[6]), idx(c.sig[7]), idx(c.sig[8])]),
    m: x.teams.map((t) => [idx(t.id), idx(t.name), t.source, t.damage, idx(t.def), ...t.members.map(idx)]),
  }));
  const last = entries[entries.length - 1];
  return JSON.stringify({ v: 1, s: table, e, seen: [idx("v6:seeded:1:i-"), idx(last.build), last.at] });
}

const BUILD_A = "0.0.1+e95d4e6+aaaaaaaaaaaa";
const BUILD_B = "0.0.1+e95d4e6+bbbbbbbbbbbb";
// noon UTC: the same calendar day in every time zone the spec may run in
const NOV_9 = Date.UTC(2026, 10, 9, 12, 0);
const NOV_12 = Date.UTC(2026, 10, 12, 12, 0);
const NOV_14 = Date.UTC(2026, 10, 14, 12, 0);
const NOV_15 = Date.UTC(2026, 10, 15, 12, 0);
const NOW = Date.UTC(2026, 10, 16, 12, 0);
const TRIO = ["Cartethyia", "Ciaccona", "Chisa"];
const sig = (rec = "rec00001", he = "he000001"): Sig => ["Kumokiri", 1, 0, "hw000001", "hs000001", "hl000001", he, "ho000001", rec];

function entry(at: number, build: string, over: { chisa?: number; chisaSig?: Sig; mine?: number | null; stock?: number } = {}): Seed {
  return {
    at,
    build,
    characters: [
      { id: "Cartethyia", damage: 3_000_000, sig: sig("reccart1") },
      { id: "Chisa", damage: over.chisa ?? 1_000_000, sig: over.chisaSig ?? sig() },
      { id: "Ciaccona", damage: 500_000, sig: sig("recciac1") },
    ],
    teams: [
      ...(over.mine === null ? [] : [{ id: "team-mine", name: "My Cartethyia team", source: 0 as const, damage: over.mine ?? 5_000_000, def: "def00001", members: TRIO }]),
      { id: "wuwa_calc:Cartethyia · Ciaccona + Chisa", name: "Cartethyia · Ciaccona + Chisa", source: 2, damage: over.stock ?? 5_500_000, def: "", members: TRIO },
    ],
  };
}
// his Chisa's echoes changed with an app update in between; the team could not be fielded on 14 Nov
const CHISA_2 = sig("rec00002", "he000002");
const LOG = storedLog([
  entry(NOV_9, BUILD_A),
  entry(NOV_12, BUILD_B, { chisa: 1_100_000, chisaSig: CHISA_2, mine: 5_150_000 }),
  entry(NOV_14, BUILD_B, { chisa: 1_100_000, chisaSig: CHISA_2, mine: null }),
  entry(NOV_15, BUILD_B, { chisa: 1_150_000, chisaSig: CHISA_2, mine: 5_300_000, stock: 5_600_000 }),
]);

function seed(log: string) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", JSON.stringify({ activeCharacter: "Chisa", characters: { Chisa: { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "1" } } } } }));
      win.localStorage.setItem(LOG_KEY, log);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
  };
}

const row = (key: string): string => `[data-test-trend-row][data-key="${key}"]`;

describe("your numbers over time", () => {
  beforeEach(() => cy.clock(NOW, ["Date"]));

  it("lists one line per figure that moved, biggest change first, folds the rest, and keeps stock teams behind a switch", () => {
    cy.visit("/whats-new?tab=numbers", seed(LOG));
    cy.get("[data-test-trends]").should("contain.text", "scaled to its own lowest and highest value");
    cy.get('[data-test-trends-group="saved"] [data-test-trend-row]').should("have.length", 1);
    cy.get(row("t:team-mine")).within(() => {
      cy.get("[data-test-trend-spark] polyline").should("have.length", 1); // the gap on 14 Nov splits nothing drawn: 9 → 12 is one stretch, 15 alone
      cy.get("[data-test-trend-figures]").should("contain.text", "5.00M").and("contain.text", "9 Nov").and("contain.text", "5.30M").and("contain.text", "15 Nov");
      cy.get("[data-test-trend-change]").should("contain.text", "up 6.0 % of the first figure, +300,000 damage since 9 Nov");
    });
    cy.get('[data-test-trends-group="characters"] [data-test-trend-row]').should("have.length", 1).first().should("have.attr", "data-key", "c:Chisa");
    cy.get('[data-test-trends-unmoved="characters"]').should("have.text", "2 characters did not move in any record.");
    cy.get('[data-test-trends-group="stock"]').should("not.exist");
    cy.get("[data-test-trends-stock-toggle]").should("contain.text", "Show stock teams (1)").click();
    cy.get('[data-test-trends-group="stock"] [data-test-trend-row]').should("have.length", 1);
  });

  it("opens a row into a chart with a point per record, the marks' words, and the points as a list", () => {
    cy.visit("/whats-new?tab=numbers", seed(LOG));
    cy.get(`${row("t:team-mine")} button`).first().should("have.attr", "aria-expanded", "false").click();
    cy.location("search").should("contain", "trend=t:team-mine");
    cy.get(`${row("t:team-mine")} button`).first().should("have.attr", "aria-expanded", "true");
    cy.get("[data-test-trend-chart]").should("contain.text", "The scale starts at zero; one step to the right is one record");
    cy.get("[data-test-trend-mark]").should("have.length", 1).and("contain.text", "UB");
    cy.get("[data-test-trend-step]").should("have.length", 2);
    // newest step first: across the gap, nothing recorded explains it
    cy.get("[data-test-trend-step-text]").eq(0).should("have.text", "No recorded cause.");
    cy.get("[data-test-trend-step]").eq(1).should("contain.text", "U B").and("contain.text", "5,000,000 → 5,150,000 (+3.0 % of the figure before)");
    cy.get("[data-test-trend-step-text]").eq(1).should("contain.text", "Chisa's build changed.").and("contain.text", "The app was updated between the two records too");
    cy.get("[data-test-trend-points] li").should("have.length", 4).eq(2).should("contain.text", "not in this record (the team could not be fielded then)");
    cy.get("[data-test-trend-readout]").should("contain.text", "Record 4 of 4").and("contain.text", "5,300,000 damage per rotation");
    cy.get("[data-test-trend-plot]").focus().type("{leftarrow}{leftarrow}{leftarrow}");
    cy.get("[data-test-trend-readout]").should("contain.text", "Record 1 of 4").and("contain.text", "5,000,000 damage per rotation");
    // a reload keeps the open row (it is in the address); closing it takes it out
    cy.reload();
    cy.get("[data-test-trend-chart]").should("exist");
    cy.get(`${row("t:team-mine")} button`).first().click();
    cy.get("[data-test-trend-chart]").should("not.exist");
    cy.location("search").should("not.contain", "trend=");
  });

  it("draws no line from one record, and says it starts with the next", () => {
    cy.visit("/whats-new?tab=numbers", seed(storedLog([entry(NOV_15, BUILD_A)])));
    cy.get("[data-test-numbers]").should("have.attr", "data-state", "first");
    cy.get("[data-test-trends-first]").should("contain.text", "The line over time starts with the next record");
    cy.get("[data-test-trends]").should("not.exist");
  });

  it("breaks a team's line where the team-aware buffs switch was flipped", () => {
    const log = storedLog([entry(NOV_9, BUILD_A), { ...entry(NOV_12, BUILD_A, { mine: 4_000_000 }), auto: false }, { ...entry(NOV_15, BUILD_A, { mine: 4_400_000 }), auto: false }]);
    cy.visit("/whats-new?tab=numbers&trend=t:team-mine", seed(log));
    cy.get(row("t:team-mine")).within(() => {
      cy.get("[data-test-trend-note]").should("contain.text", "the line breaks there");
      cy.get("[data-test-trend-change]").should("contain.text", "up 10.0 % of the first figure, +400,000 damage since 12 Nov");
    });
    cy.get("[data-test-trend-step-text]").last().should("have.text", "The team-aware buffs switch was turned off.");
  });

  it("fits a 360 px phone with the chart open", () => {
    cy.viewport(360, 740);
    cy.visit("/whats-new?tab=numbers&trend=t:team-mine", seed(LOG));
    cy.get("[data-test-trend-chart]").should("be.visible");
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollWidth, "no sideways scroll").to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get("[data-test-trend-plot]").should(($p) => {
      expect($p[0].getBoundingClientRect().right).to.be.at.most(Cypress.$("html")[0].clientWidth);
    });
  });
});
