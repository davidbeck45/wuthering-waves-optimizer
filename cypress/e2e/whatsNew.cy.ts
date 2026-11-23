// Wuthering Tools+: "What's new on Tools+" (src/sim/whatsNew/): the plus features by the day they reached the site, each
// with where it is and an Open link that lands on a real page; the unseen marker (a dot on the plus pages menu, a line
// in the menu, a card on /account) that opening the page clears; and a phone at 130 % text.
// Then its second part, "Your numbers" (src/sim/numbersLog/): what moved in the account's own figures between two
// records and why, from a log seeded with synthetic entries, and once for real: score, change a build, score again.
const SEEN_KEY = "wtplus:whatsNew:seen";
const LOG_KEY = "wtplus:numbers:log:v1";

interface SeedOptions {
  /** a character with a weapon: "an account" */
  account?: boolean;
  /** the stored marker, as the page writes it */
  seen?: string[] | null;
  /** the numbers log, as recordRanking.ts stores it */
  log?: string;
  fontScale?: number;
}

// ---- a synthetic numbers log, in the stored form (log.ts `encodeLog`: every string once in a table, indexes in the rows)
/** weapon, refinement, sequence, then the hashes of the weapon, chain, levels, echoes, the rest, and the whole record */
type Sig = [string | null, number, number, string, string, string, string, string, string];
interface LogCharacter {
  id: string;
  rotation: string;
  damage: number;
  sig: Sig;
}
interface LogTeam {
  id: string;
  name: string;
  /** 0 yours · 1 curated · 2 wuwa_calc */
  source: 0 | 1 | 2;
  damage: number;
  def: string;
  members: string[];
}
interface LogSeedEntry {
  at: number;
  build: string;
  importedAt?: number;
  characters: LogCharacter[];
  teams: LogTeam[];
}
function storedLog(entries: LogSeedEntry[]): string {
  const table: string[] = [];
  const idx = (text: string | null): number => {
    if (text === null) return -1;
    const at = table.indexOf(text);
    return at >= 0 ? at : table.push(text) - 1;
  };
  const e = entries.map((x) => ({
    t: x.at,
    b: idx(x.build),
    o: 0,
    ...(x.importedAt ? { i: x.importedAt } : {}),
    c: x.characters.map((c) => [idx(c.id), idx(c.rotation), c.damage, idx(c.sig[0]), c.sig[1], c.sig[2], idx(c.sig[3]), idx(c.sig[4]), idx(c.sig[5]), idx(c.sig[6]), idx(c.sig[7]), idx(c.sig[8])]),
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
const NOV_15 = Date.UTC(2026, 10, 15, 12, 0);
const NOW = Date.UTC(2026, 10, 16, 12, 0);

const sig = (over: Partial<Record<"weapon" | "hw" | "hs" | "hl" | "he" | "ho" | "rec", string>> & { refinement?: number; sequence?: number } = {}): Sig => [
  over.weapon ?? "Kumokiri",
  over.refinement ?? 1,
  over.sequence ?? 0,
  over.hw ?? "hw000001",
  over.hs ?? "hs000001",
  over.hl ?? "hl000001",
  over.he ?? "he000001",
  over.ho ?? "ho000001",
  over.rec ?? "rec00001",
];
const TRIO = ["Cartethyia", "Ciaccona", "Chisa"];
/** Chisa 1,000,000 · Cartethyia 3,000,000 · Ciaccona 500,000 · his team 5,000,000 · a stock team 5,500,000 */
function logEntry(at: number, build: string, over: { chisa?: number; chisaSig?: Sig; cartethyia?: number; mine?: number; stock?: number; importedAt?: number } = {}): LogSeedEntry {
  return {
    at,
    build,
    importedAt: over.importedAt,
    characters: [
      { id: "Cartethyia", rotation: "Cartethyia solo loop", damage: over.cartethyia ?? 3_000_000, sig: sig({ weapon: "DefiersThorn", hw: "hwcart01", rec: "reccart1" }) },
      { id: "Chisa", rotation: "Chisa quickswap", damage: over.chisa ?? 1_000_000, sig: over.chisaSig ?? sig() },
      { id: "Ciaccona", rotation: "Ciaccona support loop", damage: 500_000, sig: sig({ weapon: "WoodlandAria", hw: "hwciac01", rec: "recciac1" }) },
    ],
    teams: [
      { id: "team-mine", name: "My Cartethyia team", source: 0, damage: over.mine ?? 5_000_000, def: "def00001", members: TRIO },
      { id: "wuwa_calc:Cartethyia · Ciaccona + Chisa", name: "Cartethyia · Ciaccona + Chisa", source: 2, damage: over.stock ?? 5_500_000, def: "", members: TRIO },
    ],
  };
}

function seed(options: SeedOptions = {}) {
  return {
    onBeforeLoad(win: Window) {
      if (options.account) {
        win.localStorage.setItem("character", JSON.stringify({ activeCharacter: "Chisa", characters: { Chisa: { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "1" } } } } }));
      }
      if (options.seen) win.localStorage.setItem(SEEN_KEY, JSON.stringify({ v: 1, ids: options.seen }));
      if (options.log) win.localStorage.setItem(LOG_KEY, options.log);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      if (!options.fontScale) return;
      const style = win.document.createElement("style");
      style.textContent = `html { font-size: ${options.fontScale * 100}%; }`;
      win.document.head.appendChild(style);
    },
  };
}

const allIds = (): Cypress.Chainable<string[]> =>
  cy.get("[data-test-whats-new-entry]").then(($li) => [...$li].map((li) => li.getAttribute("data-test-whats-new-entry") as string));

describe("what's new on Tools+", () => {
  it("lists the plus features by day, newest first, each with where it is and an Open link", () => {
    cy.visit("/whats-new", seed());
    cy.title().should("eq", "What's new on Tools+ — Wuthering Waves Calculator & Optimizer");
    cy.get("[data-test-whats-new] h1").should("have.text", "What's new on Tools+");
    cy.get("[data-test-whats-new-group]").should("have.length.at.least", 3).then(($groups) => {
      const dates = [...$groups].map((g) => g.getAttribute("data-date") as string);
      expect(dates, "release days, newest first").to.deep.eq([...dates].sort().reverse());
      expect(new Set(dates).size, "one group per day").to.eq(dates.length);
    });
    cy.get("[data-test-whats-new-group]").first().find("h2").invoke("text").should("match", /\d{1,2} [A-Z][a-z]+ 20\d\d/);
    cy.get("[data-test-whats-new-entry]").should("have.length.at.least", 20).each(($li) => {
      expect($li.find("h3").text().trim(), "a title").to.have.length.greaterThan(3);
      expect($li.find("[data-test-whats-new-where]").text(), "where it is").to.contain("Where");
      expect($li.find("[data-test-whats-new-open]").attr("href"), "an Open link").to.match(/^\//);
    });
    // Ryan's own page is linked, not copied
    cy.get("[data-test-whats-new-updates]").should("have.attr", "href", "/updates");
    // the hub marks the page, and the palette finds it
    cy.get("[data-test-nav-rankings]").click();
    cy.get('[data-test-nav-plus-page="/whats-new"]').should("have.attr", "aria-current", "page");
  });

  it("opens a real page from every Open link", () => {
    cy.visit("/whats-new", seed({ account: true }));
    cy.get("[data-test-whats-new-open]").then(($links) => {
      const hrefs = [...new Set([...$links].map((a) => a.getAttribute("href") as string))];
      expect(hrefs.length, "distinct targets").to.be.greaterThan(8);
      // {character} was filled in from the account
      expect(hrefs.some((h) => h.includes("focus=Chisa")), "a link that names a character of the account").to.eq(true);
      expect(hrefs.filter((h) => h.includes("{")), "no placeholder left in a link").to.have.length(0);
      for (const href of hrefs) {
        cy.get(`[data-test-whats-new-open][href="${href}"]`).first().click();
        // a page's chunk loads on its first visit, and the dev server builds it on demand: Teams alone can take seconds
        cy.location({ timeout: 30000 }).should((loc) => expect(loc.pathname + loc.search, `Open → ${href}`).to.contain(href.split("?")[0]));
        cy.get("[data-test-not-found]").should("not.exist");
        // an entry about this page itself (or its Your numbers tab) stays on it; every other link leaves it
        if (href.split("?")[0] !== "/whats-new") cy.get("[data-test-whats-new]").should("not.exist");
        cy.visit("/whats-new", seed({ account: true }));
        cy.get("[data-test-whats-new]").should("exist");
      }
    });
  });

  it("shows no dot in a browser with no account", () => {
    cy.visit("/today", seed());
    cy.get("[data-test-nav-rankings]").should("be.visible");
    cy.get("[data-test-nav-plus-dot]").should("not.exist");
    cy.get("[data-test-nav-rankings]").click();
    cy.get("[data-test-nav-plus-news]").should("not.exist");
    cy.get("[data-test-nav-plus-new]").should("not.exist");
    cy.visit("/whats-new", seed());
    cy.get("[data-test-whats-new-fresh]").should("not.exist");
    cy.get("[data-test-whats-new-fresh-note]").should("not.exist");
  });

  it("marks the newest day as new for an account that never opened the page, and opening it clears the dot", () => {
    cy.visit("/today", seed({ account: true }));
    cy.get("[data-test-nav-plus-dot]").should("be.visible");
    cy.get("[data-test-nav-rankings]").click();
    cy.get("[data-test-nav-plus-news]").should("be.visible").invoke("text").should("match", /^\s*\d+ new things? on Tools\+ in the latest update/);
    cy.get("[data-test-nav-plus-new]").invoke("text").should("match", /^\d+ new$/);
    cy.get("[data-test-nav-plus-news]").click();
    cy.location("pathname").should("eq", "/whats-new");
    // only the newest day's entries carry New, and the note counts them
    cy.get("[data-test-whats-new-group]").first().find("[data-test-whats-new-entry]").its("length").then((newest) => {
      cy.get("[data-test-whats-new-fresh]").should("have.length", newest);
      cy.get("[data-test-whats-new-group]").first().find("[data-test-whats-new-fresh]").should("have.length", newest);
      cy.get("[data-test-whats-new-fresh-note]").should("contain.text", `${newest} new thing`);
    });
    // opened: the dot is gone at once, the marker holds every id, and it stays gone on other pages and after a reload
    cy.get("[data-test-nav-plus-dot]").should("not.exist");
    allIds().then((ids) => {
      cy.window().then((win) => {
        const marker = JSON.parse(win.localStorage.getItem(SEEN_KEY) ?? "null");
        expect(marker?.v).to.eq(1);
        expect(marker?.ids).to.deep.eq(ids);
      });
    });
    cy.get("[data-test-nav-rankings]").click();
    cy.get("[data-test-nav-plus-news]").should("not.exist");
    cy.get('[data-test-nav-plus-page="/today"]').click();
    cy.location("pathname").should("eq", "/today");
    cy.get("[data-test-nav-plus-dot]").should("not.exist");
    cy.reload();
    cy.get("[data-test-nav-rankings]").should("be.visible");
    cy.get("[data-test-nav-plus-dot]").should("not.exist");
    cy.visit("/whats-new");
    cy.get("[data-test-whats-new-entry]").should("have.length.at.least", 20);
    cy.get("[data-test-whats-new-fresh]").should("not.exist");
  });

  it("counts what was added since the last visit, on the menu and on My account's card", () => {
    cy.visit("/whats-new", seed());
    allIds().then((ids) => {
      // he saw everything but three entries
      const seen = ids.slice(3);
      cy.visit("/account", seed({ account: true, seen }));
      cy.get("[data-test-whats-new-card]").should("be.visible");
      cy.get("[data-test-whats-new-card-text]").should("have.text", "3 new things on Tools+ since your last visit");
      cy.get("[data-test-nav-plus-dot]").should("be.visible");
      cy.get("[data-test-whats-new-card]").click();
      cy.location("pathname").should("eq", "/whats-new");
      cy.get("[data-test-whats-new-fresh]").should("have.length", 3);
      for (const id of ids.slice(0, 3)) cy.get(`[data-test-whats-new-entry="${id}"] [data-test-whats-new-fresh]`).should("exist");
      cy.get("[data-test-whats-new-fresh-note]").should("contain.text", "3 new things on Tools+ since your last visit");
      // back on the account page the card is gone
      cy.go("back");
      cy.location("pathname").should("eq", "/account");
      cy.get("[data-test-account]").should("exist");
      cy.get("[data-test-whats-new-card]").should("not.exist");
      cy.get("[data-test-nav-plus-dot]").should("not.exist");
    });
  });

  // David's S26 width at 130 % text; 360 px at 100 % (at 130 % Ryan's v3 header fits 360 by less than Electron's scrollbar)
  it("fits a phone", () => {
    for (const [width, height, fontScale] of [
      [412, 915, 1.3],
      [360, 800, 1.3], // David's S26 at 130 % text, at the narrowest width the phone layout budgets for
      [360, 800, 1],
    ] as const) {
      cy.viewport(width, height);
      cy.visit("/whats-new", seed({ account: true, fontScale }));
      cy.get("[data-test-whats-new-entry]").should("have.length.at.least", 20);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, `/whats-new width at ${width}`).to.be.at.most(doc.documentElement.clientWidth);
      });
      cy.get("[data-test-whats-new-open]").first().then(($a) => {
        // the layout box, not the painted one: DaisyUI's button pops in through a scale for its first quarter second
        expect($a[0].offsetHeight, "Open is a 40 px tap target").to.be.at.least(40);
        expect($a[0].getBoundingClientRect().right, "Open inside the viewport").to.be.at.most(width);
      });
    }
  });
});

describe("what moved in your numbers", () => {
  const row = (id: string): string => `[data-test-numbers-move][data-id="${id}"]`;

  it("says so when there is no account, and when there is one but no record yet", () => {
    cy.visit("/whats-new?tab=numbers", seed());
    cy.get('[data-test-whats-new-tab="numbers"]').should("have.attr", "aria-current", "page");
    cy.get("[data-test-numbers]").should("have.attr", "data-state", "no-account");
    cy.get("[data-test-numbers-no-account]").should("contain.text", "No account in this browser yet");
    cy.get("[data-test-whats-new-entry]").should("not.exist"); // the other part of the page
    cy.visit("/whats-new?tab=numbers", seed({ account: true }));
    cy.get("[data-test-numbers]").should("have.attr", "data-state", "empty");
    cy.get("[data-test-numbers-empty]").should("contain.text", "No record yet").find('a[href="/account"]').should("exist");
  });

  it("reads the first record ever as the first: nothing to compare", () => {
    cy.clock(NOW, ["Date"]);
    cy.visit("/whats-new?tab=numbers", seed({ account: true, log: storedLog([logEntry(NOV_15, BUILD_A)]) }));
    cy.get("[data-test-numbers]").should("have.attr", "data-state", "first");
    cy.get("[data-test-numbers-first]").should("contain.text", "Nothing to compare yet. This is the first record, taken on 15 Nov").and("contain.text", "3 characters and 2 teams");
    cy.get("[data-test-numbers-move]").should("not.exist");
  });

  it("lists what moved between two records, with the change and the cause of each", () => {
    cy.clock(NOW, ["Date"]);
    const before = logEntry(NOV_12, BUILD_A);
    // he changed Chisa's echoes: her own figure and both teams she is in moved; the stock team and his own tie no longer
    const after = logEntry(NOV_15, BUILD_A, { chisa: 1_100_000, chisaSig: sig({ he: "he000002", rec: "rec00002" }), mine: 5_150_000, stock: 5_610_000 });
    cy.visit("/whats-new?tab=numbers", seed({ account: true, log: storedLog([before, after]) }));
    cy.get("[data-test-numbers]").should("have.attr", "data-state", "compared");
    cy.get("[data-test-numbers-newest]").should("contain.text", "15 Nov");
    cy.get("[data-test-numbers-since] option:checked").should("contain.text", "the one before").and("contain.text", "12 Nov");
    cy.get("[data-test-numbers-summary]").should("have.text", "3 figures moved, 2 did not.");
    // this log was seeded, not scored here: the page says the newest record is behind and where a new one comes from
    cy.get("[data-test-numbers-stale]").should("contain.text", "since the last record").find('a[href="/account"]').should("contain.text", "Open My account");
    // no import and no app update between these two: neither is said
    cy.get("[data-test-numbers-import]").should("not.exist");
    cy.get("[data-test-numbers-app-update]").should("not.exist");

    cy.get("[data-test-numbers-characters] [data-test-numbers-move]").should("have.length", 1);
    cy.get(row("Chisa")).within(() => {
      cy.get("[data-test-numbers-figures]").invoke("text").should("match", /1,000,000\s*→\s*(to)?\s*1,100,000/);
      cy.get("[data-test-numbers-change]").should("contain.text", "+10.0 %").and("contain.text", "of the old figure");
      cy.get("[data-test-numbers-cause]").should("have.text", "You changed this build: echoes.");
      cy.get("[data-test-numbers-to-rankings]").should("have.attr", "href", "/my-rankings?focus=Chisa&tab=rotations");
      cy.get('[data-test-why-number="Chisa"]').should("exist");
    });
    cy.get("[data-test-numbers-teams] [data-test-numbers-move]").should("have.length", 2);
    cy.get(row("team-mine")).within(() => {
      cy.get("[data-test-numbers-change]").should("contain.text", "+3.0 %");
      cy.get("[data-test-numbers-cause]").should("have.text", "Chisa's build changed.");
    });
    cy.get(row("wuwa_calc:Cartethyia · Ciaccona + Chisa")).find("[data-test-numbers-change]").should("contain.text", "+2.0 %");
    // biggest change first
    cy.get("[data-test-numbers-move]").then(($rows) => expect([...$rows].map((r) => r.getAttribute("data-id"))).to.deep.eq(["Chisa", "team-mine", "wuwa_calc:Cartethyia · Ciaccona + Chisa"]));
    cy.get("[data-test-numbers-basis]").should("contain.text", "this app's engine").and("contain.text", "level 100");

    // Why this number opens from the row
    cy.get(`${row("Chisa")} [data-test-why-number="Chisa"]`).click();
    cy.get("[data-test-anatomy-sheet], [data-test-anatomy]").should("exist");
  });

  it("compares with an older record he picks, and says an app update and an import once each", () => {
    cy.clock(NOW, ["Date"]);
    const first = logEntry(NOV_9, BUILD_A);
    // 12 Nov: a Settings import brought another weapon for Chisa
    const second = logEntry(NOV_12, BUILD_A, { chisa: 900_000, chisaSig: sig({ weapon: "EmeraldOfGenesis", hw: "hw000002", rec: "rec00002" }), mine: 4_900_000, importedAt: NOV_12 - 60_000 });
    // 15 Nov: an app update moved Cartethyia, and no build changed
    const third = logEntry(NOV_15, BUILD_B, { chisa: 900_000, chisaSig: sig({ weapon: "EmeraldOfGenesis", hw: "hw000002", rec: "rec00002" }), mine: 4_900_000, cartethyia: 3_090_000 });
    cy.visit("/whats-new?tab=numbers", seed({ account: true, log: storedLog([first, second, third]) }));

    // newest against the one before: only the update
    cy.get("[data-test-numbers-summary]").should("have.text", "1 figure moved, 4 did not.");
    cy.get("[data-test-numbers-app-update]").should("have.length", 1).and("contain.text", "The app was updated between these two records");
    cy.get('[data-test-numbers-to-whats-new]').should("have.attr", "href", "/whats-new");
    cy.get('[data-test-numbers-to-updates]').should("have.attr", "href", "/updates");
    cy.get("[data-test-numbers-import]").should("not.exist");
    cy.get(`${row("Cartethyia")} [data-test-numbers-cause]`).should("have.text", "An app update: no build in it changed.");
    cy.get(`${row("Cartethyia")} [data-test-numbers-change]`).should("contain.text", "+3.0 %");

    // since 9 Nov: the import is in the stretch, said once at the top, and no row says "you"
    cy.get("[data-test-numbers-since] option").should("have.length", 2);
    cy.get("[data-test-numbers-since] option").eq(1).invoke("text").should("match", /since\s+9 Nov/);
    cy.get("[data-test-numbers-since]").select(1);
    cy.get("[data-test-numbers-summary]").should("have.text", "3 figures moved, 2 did not.");
    cy.get("[data-test-numbers-import]").should("have.length", 1).and("contain.text", "An import or a restored backup replaced your account on 12 Nov");
    cy.get("[data-test-numbers-app-update]").should("have.length", 1);
    // her build differs AND the app was updated in the stretch: the row says both, it cannot split the move between them
    const TOO = " The app was updated between the two records too, so part of this may be the update.";
    cy.get(`${row("Chisa")} [data-test-numbers-cause]`).should("have.text", `This build is different: weapon (Kumokiri → Emerald Of Genesis).${TOO}`);
    cy.get(`${row("Chisa")} [data-test-numbers-change]`).should("contain.text", "−10.0 %");
    cy.get(`${row("team-mine")} [data-test-numbers-cause]`).should("have.text", `Chisa's build changed.${TOO}`);
    cy.get(`${row("Cartethyia")} [data-test-numbers-cause]`).should("have.text", "An app update: no build in it changed.");
    cy.get("[data-test-numbers] [data-test-numbers-cause]").each(($p) => expect($p.text()).not.to.match(/You changed/));
  });

  it("lists a character and a team that appeared or went as that, not as a move", () => {
    cy.clock(NOW, ["Date"]);
    const before = logEntry(NOV_12, BUILD_A);
    const after = logEntry(NOV_15, BUILD_A);
    after.characters = after.characters.filter((c) => c.id !== "Ciaccona");
    after.characters.push({ id: "Phoebe", rotation: "Phoebe absolution loop", damage: 2_000_000, sig: sig({ weapon: "LuminousHymn", hw: "hwphoe01", rec: "recphoe1" }) });
    after.teams = [{ id: "wuwa_calc:Cartethyia · Phoebe + Chisa", name: "Cartethyia · Phoebe + Chisa", source: 2, damage: 6_000_000, def: "", members: ["Cartethyia", "Phoebe", "Chisa"] }];
    cy.visit("/whats-new?tab=numbers", seed({ account: true, log: storedLog([before, after]) }));
    cy.get("[data-test-numbers-summary]").should("have.text", "No figure moved (2 compared) · 2 new · 3 gone.");
    cy.get("[data-test-numbers-move]").should("not.exist");
    cy.get('[data-test-numbers-appeared] [data-id="Phoebe"]').should("contain.text", "Phoebe").and("contain.text", "2.00M");
    cy.get("[data-test-numbers-appeared] li").should("have.length", 2);
    cy.get('[data-test-numbers-gone] [data-id="Ciaccona"]').should("contain.text", "it was 500K");
    cy.get("[data-test-numbers-gone] li").should("have.length", 3);
  });

  it("leaves the What's new dot alone until the other part of the page is shown", () => {
    cy.visit("/whats-new?tab=numbers", seed({ account: true, log: storedLog([logEntry(NOV_12, BUILD_A), logEntry(NOV_15, BUILD_A, { chisa: 1_050_000 })]) }));
    cy.get("[data-test-numbers]").should("exist");
    cy.get("[data-test-nav-plus-dot]").should("be.visible");
    cy.get('[data-test-whats-new-tab="features"]').click();
    cy.location("search").should("eq", "");
    cy.get("[data-test-whats-new-entry]").should("have.length.at.least", 20);
    cy.get("[data-test-nav-plus-dot]").should("not.exist");
    cy.get('[data-test-whats-new-tab="numbers"]').click();
    cy.location("search").should("eq", "?tab=numbers");
    cy.get("[data-test-numbers-move]").should("have.length", 1);
  });

  /** /account on a one-character account (kept across visits of one test), scored on this visit */
  const visit = (edit?: (characters: Record<string, any>) => void) =>
    cy.visit("/account", {
      onBeforeLoad(win: Window) {
        win.sessionStorage.clear(); // score on this visit
        const stored = win.localStorage.getItem("character");
        const data = stored ? JSON.parse(stored) : { activeCharacter: "Chisa", characters: { Chisa: { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "1" } } } } };
        edit?.(data.characters);
        win.localStorage.setItem("character", JSON.stringify(data));
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
    });

  /** Make the ranking this browser saved look like the last app build's: another build id, three days old, and
   *  `edit` applied to it. Resolves with how many records it changed. */
  function ageSavedRanking(win: Window, edit: (ranking: any) => void): Promise<number> {
    return new Promise((resolve, reject) => {
      const open = win.indexedDB.open("wtplus-results", 1);
      open.onupgradeneeded = () => {
        // not there yet: the same two stores the app makes (persist/resultStore.ts)
        if (!open.result.objectStoreNames.contains("meta")) open.result.createObjectStore("meta", { keyPath: "key" });
        if (!open.result.objectStoreNames.contains("data")) open.result.createObjectStore("data");
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(["meta", "data"], "readwrite");
        const metas = tx.objectStore("meta");
        const data = tx.objectStore("data");
        let changed = 0;
        const all = metas.getAll();
        all.onsuccess = () => {
          for (const meta of all.result) {
            if (meta.cache !== "ranking") continue;
            const get = data.get(meta.key);
            get.onsuccess = () => {
              const ranking = JSON.parse(get.result);
              edit(ranking);
              data.put(JSON.stringify(ranking), meta.key);
              metas.put({ ...meta, build: "0.0.1+e95d4e6+olderbuild00", savedAt: meta.savedAt - 3 * 86_400_000 });
              changed += 1;
            };
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve(changed);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }

  it("records a real ranking, and after a build change says what moved and why", () => {
    // the first visit: one record, nothing to compare
    visit();
    cy.get("[data-test-numbers-card]").should("exist");
    cy.get("[data-test-numbers-card-first]", { timeout: 120000 }).should("contain.text", "Nothing to compare yet. This is the first record, taken just now.");
    cy.window().then((win) => expect(JSON.parse(win.localStorage.getItem(LOG_KEY) ?? "{}").e, "one entry").to.have.length(1));

    // a reload with nothing changed: the ranking comes back from the saved results and is not recorded again
    cy.reload();
    cy.get("[data-test-account-source]", { timeout: 120000 }).should("have.attr", "data-state", "live");
    cy.get("[data-test-numbers-card-first]").should("exist");
    cy.wait(1500);
    cy.window().then((win) => expect(JSON.parse(win.localStorage.getItem(LOG_KEY) ?? "{}").e, "still one entry").to.have.length(1));

    // he refines the weapon to R5 and comes back
    visit((characters) => {
      characters.Chisa.weapons = { ...(characters.Chisa.weapons ?? {}), Kumokiri: { ...(characters.Chisa.weapons?.Kumokiri ?? {}), refinement: "5" } };
    });
    cy.get('[data-test-numbers-card][data-state="compared"]', { timeout: 120000 }).should("exist");
    cy.get("[data-test-numbers-card-since]").should("contain.text", "1 figure moved");
    cy.get('[data-test-numbers-card] [data-test-numbers-move][data-id="Chisa"]').within(() => {
      cy.get("[data-test-numbers-cause]").should("have.text", "You changed this build: weapon refinement (R1 → R5).");
      cy.get("[data-test-numbers-change]").invoke("text").should("match", /^\s*\+\d+\.\d %/);
    });
    cy.window().then((win) => expect(JSON.parse(win.localStorage.getItem(LOG_KEY) ?? "{}").e, "two entries").to.have.length(2));

    // See all: the full list, with the same row and the links to dig
    cy.get("[data-test-numbers-card-all]").click();
    cy.location().should((loc) => expect(loc.pathname + loc.search).to.eq("/whats-new?tab=numbers"));
    cy.get("[data-test-numbers]").should("have.attr", "data-state", "compared");
    cy.get("[data-test-numbers-stale]").should("not.exist"); // the log is as new as the account
    cy.get('[data-test-numbers-move][data-id="Chisa"] [data-test-numbers-cause]').should("have.text", "You changed this build: weapon refinement (R1 → R5).");
    cy.get('[data-test-numbers-move][data-id="Chisa"] [data-test-numbers-to-rankings]').click();
    cy.location("pathname").should("eq", "/my-rankings");
    cy.location("search").should("contain", "focus=Chisa");
  });

  it("after an app update, the first visit already says what the update moved", () => {
    visit();
    cy.get("[data-test-numbers-card-first]", { timeout: 120000 }).should("exist");
    cy.get("[data-test-account-source]", { timeout: 120000 }).should("have.attr", "data-state", "live"); // the ranking is saved by now
    // the state the site is in on the first visit after an update: the last build's ranking in the Saved results
    // (here with Chisa a tenth lower, as if the update raised her), and a log that has never seen that build
    cy.window()
      .then((win) =>
        ageSavedRanking(win, (ranking) => {
          for (const c of ranking.characters) if (c.best) c.best.avgDamage *= 0.9;
        }),
      )
      .should("eq", 1);
    cy.window().then((win) => win.localStorage.removeItem(LOG_KEY));
    visit();
    cy.get('[data-test-numbers-card][data-state="compared"]', { timeout: 120000 }).should("exist");
    cy.get("[data-test-numbers-card-app-update]").should("have.text", "The app was updated between the two.");
    cy.get('[data-test-numbers-card] [data-test-numbers-move][data-id="Chisa"]').within(() => {
      cy.get("[data-test-numbers-change]").should("contain.text", "+11.1 %");
      cy.get("[data-test-numbers-cause]").should("have.text", "An app update: no build in it changed.");
    });
    cy.window().then((win) => {
      const log = JSON.parse(win.localStorage.getItem(LOG_KEY) ?? "{}");
      expect(log.e, "the last build's record, then this one's").to.have.length(2);
      expect(log.s[log.e[0].b], "the older record names the build that scored it").to.eq("0.0.1+e95d4e6+olderbuild00");
      expect(log.e[0].t, "and keeps the time it was saved").to.be.lessThan(log.e[1].t - 2 * 86_400_000);
    });
    // the full list says it once, with where to read what changed
    cy.get("[data-test-numbers-card-all]").click();
    cy.get("[data-test-numbers-app-update]").should("have.length", 1).find('a[href="/updates"]').should("exist");
    cy.get("[data-test-numbers-summary]").should("have.text", "1 figure moved, 0 did not.");

    // a second visit on the same build: the saved ranking is this build's now, nothing more is recorded
    visit();
    cy.get("[data-test-account-source]", { timeout: 120000 }).should("have.attr", "data-state", "live");
    cy.wait(1500);
    cy.window().then((win) => expect(JSON.parse(win.localStorage.getItem(LOG_KEY) ?? "{}").e, "still two entries").to.have.length(2));
  });

  it("fits a phone", () => {
    const log = storedLog([logEntry(NOV_12, BUILD_A), logEntry(NOV_15, BUILD_B, { chisa: 1_100_000, chisaSig: sig({ he: "he000002", rec: "rec00002" }), mine: 5_150_000, stock: 5_610_000, importedAt: NOV_15 - 1000 })]);
    for (const [width, height, fontScale] of [
      [412, 915, 1.3],
      [360, 800, 1.3], // David's S26 at 130 % text, at the narrowest width the phone layout budgets for
      [360, 800, 1],
    ] as const) {
      cy.viewport(width, height);
      cy.visit("/whats-new?tab=numbers", seed({ account: true, log, fontScale }));
      cy.get("[data-test-numbers-move]").should("have.length", 3);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, `Your numbers width at ${width}`).to.be.at.most(doc.documentElement.clientWidth);
      });
      cy.get("[data-test-numbers-to-rankings]").first().then(($a) => expect($a[0].offsetHeight, "a 40 px tap target").to.be.at.least(40));
      cy.get("[data-test-numbers-since]").then(($s) => expect($s[0].offsetHeight, "the picker is a 40 px tap target").to.be.at.least(40));
    }
  });
});
