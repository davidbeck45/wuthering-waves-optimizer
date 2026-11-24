// Wuthering Tools+ (batch 5, 2026-11-23, lane riley-pages): Riley31415's Tier List and Value pages inside the app,
// /tier-list and /roster-value (src/sim/rileyPages/). His modules straight from the submodule; Roster value opens on
// the account's roster (ownedSet.ts). Synthetic account: the Cartethyia fixture (one limited resonator set up).
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const S26 = { width: 412, height: 915 };

function seed(opts: { v3?: boolean; big?: boolean; extra?: (win: Window) => void } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      if (opts.v3) {
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      }
      opts.extra?.(win);
    },
    onLoad(win: Window) {
      if (!opts.big) return;
      const style = win.document.createElement("style");
      style.textContent = "html { font-size: 130% !important; }";
      win.document.head.appendChild(style);
    },
  };
}

const loaded = () => cy.get(".wt-riley-pages #loading", { timeout: 180000 }).should("have.attr", "hidden");
const tierRows = () => cy.get(".wt-riley-tierlist .trow:not(.thead) .c.name");
const scoreLine = () => cy.get(".wt-riley-value .summary-label .hint");
const box = (name: string) => cy.get(`.wt-riley-value input[data-name="${name}"]`);

function expectNoSidewaysScroll(what: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${what}: page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

describe("Riley's Tier List and Value pages inside the app", () => {
  it("opens the Tier list from the Tools+ menu, and a team figure opens his team page on /rankings and Back returns", () => {
    cy.viewport(1280, 900);
    cy.visit("/whats-new", seed());
    cy.get("[data-test-nav-rankings]").filter(":visible").first().click();
    cy.get('[data-test-nav-plus-page="/tier-list"]').filter(":visible").first().click();
    cy.location("pathname").should("eq", "/tier-list");
    cy.title().should("contain", "Tier list");
    loaded();
    tierRows().should("have.length.greaterThan", 30);
    cy.get(".wt-riley-tierlist .trow .c.tier").first().should("have.text", "T0");
    cy.get("[data-test-riley-lead]").should("contain.text", "wuwa_calc");
    // his README (it names a frame-data site) stays hidden; the line says what the figures are
    cy.get(".wt-riley-tierlist [data-note='readme']").should("not.be.visible");
    cy.get("[data-test-riley-about] summary").click();
    cy.get("[data-test-riley-about]").should("contain.text", "damage per rotation").and("contain.text", "20 % resistance").and("not.contain.text", "wuwalab");
    // the app is not reloaded by his hash handling: a marker on the window survives
    cy.window().then((win) => { (win as unknown as { wtMarker: number }).wtMarker = 7; });
    cy.get(".wt-riley-tierlist .trow .c.total a").first().click();
    cy.location("pathname").should("eq", "/rankings");
    cy.location("hash").should("match", /(^|[#&])t=/);
    cy.get(".skittle-root.wt-detail", { timeout: 120000 }).should("exist");
    cy.window().its("wtMarker").should("eq", 7);
    cy.go("back");
    cy.location("pathname").should("eq", "/tier-list");
    tierRows().should("have.length.greaterThan", 30);
    cy.window().its("wtMarker").should("eq", 7);
  });

  it("follows a Team Cost, and a link with another Team Cost re-reads it", () => {
    cy.viewport(1280, 900);
    cy.visit("/tier-list", seed());
    loaded();
    cy.get(".wt-riley-tierlist .trow:not(.thead) .c.total").first().invoke("text").then((s0r1) => {
      cy.get(".wt-riley-tierlist #cost").select("s6r5");
      loaded();
      cy.location("hash").should("include", "tc=s6r5");
      cy.get(".wt-riley-tierlist .trow:not(.thead) .c.total").first().invoke("text").should("not.eq", s0r1);
    });
    cy.window().then((win) => { (win as unknown as { wtMarker: number }).wtMarker = 3; });
    // a hash typed over the page (or a link) is read without reloading the app
    cy.window().then((win) => { win.location.hash = "#tc=r0"; });
    cy.get(".wt-riley-tierlist #cost", { timeout: 60000 }).should("have.value", "s0r0");
    cy.window().its("wtMarker").should("eq", 3);
  });

  it("Roster value opens ticked from the account, a tick changes the score, the account's set comes back on request", () => {
    cy.viewport(1280, 900);
    cy.visit("/roster-value", seed());
    loaded();
    cy.title().should("contain", "Roster value");
    // the account owns Cartethyia; 4-stars and Rover forms are everyone's (his engine's rule); Verina and his free
    // 5-stars are not ticked when the account lacks them
    box("Cartethyia").should("be.checked");
    box("Sanhua").should("be.checked");
    box("Havoc Rover").should("be.checked");
    box("Verina").should("not.be.checked");
    box("Encore").should("not.be.checked");
    cy.get("[data-test-riley-owned-line]").invoke("text").should("match", /^Ticked from your account: \d+ resonators\. Change a tick to try a pull\.$/);
    cy.get("[data-test-riley-owned-use-account]").should("not.exist");
    // the top row of the unowned side is the pull that adds most: ticking it moves the account's score
    cy.get(".wt-riley-value .trow:not(.thead) > .sec:nth-child(1) input[data-name]").first().invoke("attr", "data-name").then((name) => {
      const top = String(name);
      scoreLine().invoke("text").then((before) => {
        box(top).check({ force: true });
        scoreLine().invoke("text").should("not.eq", before);
      });
      box(top).should("be.checked");
      cy.get("[data-test-riley-owned-line]").should("contain.text", "Your own ticks").and("contain.text", "1 different from your account");
      // a reload keeps the hand ticks (his key) and says so
      cy.reload();
      loaded();
      box(top).should("be.checked");
      cy.get("[data-test-riley-owned-line]").should("contain.text", "Your own ticks");
      cy.get("[data-test-riley-owned-use-account]").click();
      box(top).should("not.be.checked");
      cy.get("[data-test-riley-owned-line]").should("contain.text", "Ticked from your account");
    });
    // his Reset Account still does what he wrote: his free resonators and Verina
    cy.get(".wt-riley-value .resetlink").click();
    box("Verina").should("be.checked");
    cy.get("[data-test-riley-owned-line]").should("contain.text", "Riley's default roster");
    cy.window().then((win) => expect(win.localStorage.getItem("wuwa.owned.v1")).to.eq(null));
    // the next open is the account's again
    cy.reload();
    loaded();
    box("Verina").should("not.be.checked");
    cy.get("[data-test-riley-owned-line]").should("contain.text", "Ticked from your account");
  });

  it("/rankings first, then Roster value, then Back: each page keeps its own loading box and rows", () => {
    cy.viewport(1280, 900);
    cy.visit("/rankings#tc=s6r5", seed());
    cy.get(".skittle-root:not(.wt-riley-pages) #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root:not(.wt-riley-pages) .trow:not(.thead)", { timeout: 120000 }).should("have.length.greaterThan", 5);
    cy.window().then((win) => { (win as unknown as { wtMarker: number }).wtMarker = 5; });
    cy.get("[data-test-nav-rankings]").filter(":visible").first().click();
    cy.get('[data-test-nav-plus-page="/roster-value"]').filter(":visible").first().click();
    cy.location("pathname").should("eq", "/roster-value");
    loaded();
    box("Cartethyia").should("be.checked");
    cy.go("back");
    cy.location("pathname").should("eq", "/rankings");
    cy.location("hash").should("include", "tc=s6r5");
    cy.get(".skittle-root:not(.wt-riley-pages) #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root:not(.wt-riley-pages) .trow:not(.thead)").should("have.length.greaterThan", 5);
    // /rankings' own line has both pages
    cy.get("[data-test-rankings-to-tierlist]").should("be.visible");
    cy.get("[data-test-rankings-to-value]").should("be.visible");
    cy.go("forward");
    cy.location("pathname").should("eq", "/roster-value");
    loaded();
    box("Cartethyia").should("be.checked");
    cy.window().its("wtMarker").should("eq", 5);
  });

  it("My account is one tap away, never started unasked", () => {
    cy.viewport(1280, 900);
    cy.visit("/tier-list", seed());
    loaded();
    cy.get(".wt-riley-tierlist #cost").should("have.value", "s0r1");
    cy.get("[data-test-riley-mine-button]").should("contain.text", "At my own sequences and weapons").click();
    loaded();
    cy.get(".wt-riley-tierlist #cost").should("have.value", "mine");
    cy.location("hash").should("include", "tc=mine");
    cy.get("[data-test-riley-mine-on]").should("be.visible");
    tierRows().should("have.length.greaterThan", 3);
    // his own select back to a shipped cost brings the button back
    cy.get(".wt-riley-tierlist #cost").select("s6r5");
    cy.get("[data-test-riley-mine-button]").should("be.visible");
  });

  it("follows the account: a character set up since the last visit is ticked, and the line says so", () => {
    cy.viewport(1280, 900);
    cy.visit("/roster-value", seed());
    loaded();
    box("Phrolova").should("not.be.checked");
    cy.window().then((win) => {
      const store = JSON.parse(win.localStorage.getItem("character") ?? "{}") as { characters: Record<string, unknown> };
      store.characters.Phrolova = JSON.parse(JSON.stringify(store.characters.Cartethyia));
      win.localStorage.setItem("character", JSON.stringify(store));
    });
    cy.reload();
    loaded();
    box("Phrolova").should("be.checked");
    cy.get("[data-test-riley-owned-line]").should("contain.text", "your account changed: added Phrolova");
  });

  it("an empty account keeps his default roster and says how to get your own", () => {
    cy.viewport(1280, 900);
    cy.visit("/roster-value", { onBeforeLoad(win) { win.localStorage.removeItem("character"); } });
    loaded();
    box("Verina").should("be.checked");
    cy.get("[data-test-riley-owned-line]").should("contain.text", "Riley's default roster is ticked");
  });

  for (const width of [412, 360]) {
    it(`both pages fit a ${width} px phone at 130 % text, one block at a time`, () => {
      cy.viewport(width, S26.height);
      cy.visit("/tier-list", seed({ v3: true, big: true }));
      loaded();
      cy.get("[data-test-riley-views]").should("be.visible");
      expectNoSidewaysScroll(`tier list ${width}`);
      cy.get(".wt-riley-tierlist .thead .c:visible").should("contain.text", "Main DPS").and("not.contain.text", "Support");
      cy.get('[data-test-riley-view="2"]').click().should("have.attr", "aria-pressed", "true");
      cy.get(".wt-riley-tierlist .thead .c:visible").should("contain.text", "Support").and("not.contain.text", "Main DPS");
      cy.get('[data-test-riley-view="2"]').should(($b) => expect($b[0]!.getBoundingClientRect().height).to.be.at.least(44));
      expectNoSidewaysScroll(`tier list support ${width}`);
      cy.visit("/roster-value", seed({ v3: true, big: true }));
      loaded();
      expectNoSidewaysScroll(`roster value ${width}`);
      cy.get(".wt-riley-value .trow:not(.thead) .c.check:visible").first().should(($c) => {
        const r = $c[0]!.getBoundingClientRect();
        expect(r.height, "tick target height").to.be.at.least(44);
        expect(r.width, "tick target width").to.be.at.least(44);
      });
      box("Cartethyia").should("not.be.visible");
      cy.get('[data-test-riley-view="1"]').click();
      box("Cartethyia").should("be.visible");
      expectNoSidewaysScroll(`roster value owned ${width}`);
    });
  }
});
