// Wuthering Tools+ resonator briefs (/kit and /kit/<name>, src/sim/kits/) in the v3 UI at the S26's 412 px and 130 %
// text: the list filters and searches, a brief opens from it, the "On your account" block reads the account, the
// brief's links lead to pages that exist, an unknown name and a failed load both say so, and nothing scrolls sideways.
// Seeded through onBeforeLoad with public data only: upstream's Cartethyia golden fixture (her build, nobody else).
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const S26 = { width: 412, height: 915 };
const TITLE = " — Wuthering Waves Calculator & Optimizer";

function seed() {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      const style = win.document.createElement("style");
      style.textContent = "html { font-size: 130%; }";
      win.document.head.appendChild(style);
    },
  };
}

function expectNoHorizontalScroll(what: string): void {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth, `${what} page width`).to.be.at.most(win.document.documentElement.clientWidth);
    expect(win.innerWidth, `${what} layout viewport`).to.eq(S26.width);
  });
}

/** the pages a brief may link to */
const ROUTES = ["/kit", "/rankings", "/my-rankings", "/account", "/weapons", "/echo-plan", "/rotation", "/build-team"];

describe("resonator briefs", () => {
  beforeEach(() => cy.viewport(S26.width, S26.height));

  it("lists the briefs with the account's own first, and filters by element, role and search", () => {
    cy.visit("/kit", seed());
    cy.title().should("eq", `Resonator briefs${TITLE}`);
    cy.get("[data-test-kit-count]").invoke("text").should("match", /^\s*\d+ briefs · 1 on your account\s*$/);
    // the account's one character, with her sequence and weapon rank
    cy.get("[data-test-kit-mine] [data-test-kit-row]").should("have.length", 1);
    cy.get('[data-test-kit-mine] [data-test-kit-row="cartethyia"]').should("contain.text", "Cartethyia").and("contain.text", "S2 · Defier's Thorn R1");
    cy.get("[data-test-kit-others] [data-test-kit-row]").its("length").should("be.gte", 40);
    expectNoHorizontalScroll("the list");

    // element: only that element is left, and her own row stays (she is Aero)
    cy.get('[data-test-kit-element="Fusion"]').click().should("have.attr", "aria-pressed", "true");
    cy.get('[data-test-kit-row="aemeath"]').should("exist");
    cy.get('[data-test-kit-row="cartethyia"]').should("not.exist");
    cy.get('[data-test-kit-row="jiyan"]').should("not.exist");
    cy.get("[data-test-kit-count]").invoke("text").should("match", /^\s*\d+ of \d+ briefs\s*$/);
    cy.get('[data-test-kit-element="all"]').click();

    // role: the sustain supports, not a main DPS
    cy.get('[data-test-kit-role="sustain"]').click();
    cy.get('[data-test-kit-row="shorekeeper"]').should("exist");
    cy.get('[data-test-kit-row="aemeath"]').should("not.exist");
    cy.get('[data-test-kit-role="all"]').click();

    // search, by the name the app shows
    cy.get("[data-test-kit-search]").type("aem");
    cy.get("[data-test-kit-row]").should("have.length", 1).first().should("have.attr", "data-test-kit-row", "aemeath");
    cy.get("[data-test-kit-search]").clear().type("rover aero");
    cy.get("[data-test-kit-row]").should("have.length", 1).first().should("have.attr", "data-test-kit-row", "aero-rover");

    // nothing matches: say so, and one tap brings the list back
    cy.get("[data-test-kit-search]").clear().type("zzz");
    cy.get("[data-test-kit-row]").should("not.exist");
    cy.get("[data-test-kit-empty]").should("contain.text", "No brief matches").and("contain.text", "zzz");
    cy.get("[data-test-kit-clear]").click();
    cy.get("[data-test-kit-search]").should("have.value", "");
    cy.get('[data-test-kit-row="cartethyia"]').should("exist");
  });

  it("opens a brief from the list: every section, read against the account, with links that lead somewhere", () => {
    cy.visit("/kit", seed());
    cy.get('[data-test-kit-row="cartethyia"]').click();
    cy.location("pathname").should("eq", "/kit/cartethyia");
    cy.title().should("eq", `Cartethyia: resonator brief${TITLE}`);
    cy.get("[data-test-kit-title]").should("have.text", "Cartethyia");
    cy.get("[data-test-kit-account]", { timeout: 20000 }).should("be.visible");

    // whose figures these are, and in which unit
    cy.get("[data-test-kit-basis]").should("contain.text", "wuwa_calc's team DPS").and("contain.text", "his standard builds").and("contain.text", "not your account's");

    // on your account: owned at S2 with her weapon; alone, so Riley's best team and who is missing; no roster ranking saved
    cy.get("[data-test-kit-owned]").should("have.text", "You have Cartethyia at S2 with Defier's Thorn at R1.");
    cy.get("[data-test-kit-next]").invoke("text").should("match", /^You are at S2\. No sequence changes how Cartethyia is played/);
    cy.get("[data-test-kit-missing-members]").should("contain.text", "You cannot field one of Cartethyia's top teams yet").and("contain.text", "you are missing");
    cy.get("[data-test-kit-ranked]").should("not.exist");
    cy.get("[data-test-kit-rank]").should("have.attr", "href", "/my-rankings");
    cy.get('[data-test-kit-link="cost"]').should("have.attr", "href", "/account?focus=Cartethyia&section=cost");
    cy.get('[data-test-kit-link="weapons"]').should("have.attr", "href", "/weapons?focus=Cartethyia");
    cy.get('[data-test-kit-link="echo-plan"]').should("have.attr", "href", "/echo-plan");
    cy.get('[data-test-kit-link="build"]').should("not.exist"); // no team of hers she can field yet

    // the sections of the brief
    cy.get("[data-test-kit-role-section]").should("contain.text", "Cartethyia is a main DPS");
    cy.get("[data-test-kit-loop]").its("length").should("be.gte", 1);
    cy.get("[data-test-kit-cue]").invoke("attr", "href").should("match", /^\/rotation#chars=[A-Za-z]+,[A-Za-z]+,[A-Za-z]+$/);
    cy.get("[data-test-kit-no-changes]").should("be.visible");
    cy.get("[data-test-kit-sequence]").should("have.length", 6);
    cy.get("[data-test-kit-build]").its("length").should("be.gte", 1);
    cy.get("[data-test-kit-build]").first().should("contain.text", "Main stats").and("contain.text", "-cost").and("contain.text", "Substats, in order");
    cy.get("[data-test-kit-cost]").should("have.length", 9);
    // the Team Cost nearest to her S2 (one main DPS at S2) is the one that stands open; the rest are one line each
    cy.get('[data-test-kit-cost="s2r1mdps"]').should("have.attr", "open");
    cy.get('[data-test-kit-cost="s2r1mdps"] > summary').should("contain.text", "nearest to yours");
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team]').its("length").should("be.gte", 1);
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team-dps]').first().invoke("text").should("match", /^[\d.,]+[KM]? team DPS, wuwa_calc$/);
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team]').first().should("contain.text", "S2");
    cy.get('[data-test-kit-cost="s0r1"]').should("not.have.attr", "open");
    cy.get('[data-test-kit-cost="s0r1"] > summary').invoke("text").should("match", /S0R1 all.+ · .+team DPS/);
    cy.get('[data-test-kit-cost="s6r5"]').should("not.have.attr", "open");
    cy.get("[data-test-kit-ladder-seq]").should("contain.text", "Team DPS").and("contain.text", "S6");
    cy.get("[data-test-kit-signature]").should("contain.text", "the signature");
    expectNoHorizontalScroll("the brief");

    // a collapsed Team Cost opens on a tap and shows its team
    cy.get('[data-test-kit-cost="s6r5"] > summary').click();
    cy.get('[data-test-kit-cost="s6r5"] [data-test-kit-team]').first().should("be.visible").and("contain.text", "S6");
    expectNoHorizontalScroll("the brief with a Team Cost open");

    // every link inside the brief goes to a page of the app
    cy.get("[data-test-kit-brief] a[href]").each(($a) => {
      const href = $a.attr("href")!;
      if (href.startsWith("#")) return; // the section chips
      const path = href.split(/[?#]/)[0]!;
      expect(ROUTES.some((r) => path === r || path.startsWith(`${r}/`)), href).to.eq(true);
    });

    // Riley's table at that Team Cost, on the teams with these three
    cy.get('[data-test-kit-cost="s0r1"] [data-test-kit-team-rankings]').first().invoke("attr", "href").should("match", /^\/rankings#r=[A-Za-z]+,[A-Za-z]+,[A-Za-z]+$/);
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team-rankings]').first().invoke("attr", "href").should("match", /^\/rankings#tc=s2m&r=/);
    cy.get('[data-test-kit-cost="s6r5"] [data-test-kit-team-rankings]').first().invoke("attr", "href").should("match", /^\/rankings#tc=s6r5&r=/);
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team-mine]').first().invoke("attr", "href").should("match", /^\/rankings#tc=mine&r=.+&sb=m$/);
  });

  it("the brief's links arrive: Cost to max opens her drawer, whose Kit brief link comes back", () => {
    cy.visit("/kit/cartethyia", seed());
    cy.get('[data-test-kit-link="cost"]', { timeout: 20000 }).click();
    cy.location("pathname").should("eq", "/account");
    cy.get("[data-test-account-drawer]", { timeout: 60000 }).should("have.attr", "open");
    cy.get("[data-test-account-drawer] [data-test-account-open-kit]").should("have.attr", "href", "/kit/cartethyia").click();
    cy.location("pathname").should("eq", "/kit/cartethyia");
    cy.get("[data-test-kit-title]").should("have.text", "Cartethyia");

    // the team's link into Team rankings lands on his table with the team's three resonators picked
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team-rankings]', { timeout: 20000 }).first().click();
    cy.location("pathname").should("eq", "/rankings");
    cy.location("hash").should("match", /^#tc=s2m&r=.*Cartethyia/);
  });

  it("a resonator who is not on the account, an address under another name, and a name nobody has", () => {
    cy.visit("/kit/aemeath", seed());
    cy.get("[data-test-kit-owned]", { timeout: 20000 }).should("have.text", "Aemeath is not on your account in this app: no weapon is equipped on them.");
    cy.get('[data-test-kit-link="cost"]').should("not.exist");
    cy.get('[data-test-kit-link="rank"]').should("exist");
    cy.get("[data-test-kit-changes] [data-test-kit-change]").should("have.length", 1).first().should("contain.text", "S1 changes only the opener");
    expectNoHorizontalScroll("a brief of a resonator not owned");

    // an app key is an address too: it settles on the brief's own
    cy.visit("/kit/RoverAeroMale", seed());
    cy.location("pathname").should("eq", "/kit/aero-rover");
    cy.get("[data-test-kit-title]").invoke("text").should("match", /^Rover Aero/);

    cy.visit("/kit/nobody-at-all", seed());
    cy.get("[data-test-kit-missing]").should("contain.text", "No brief for “nobody-at-all”");
    cy.get("[data-test-kit-missing] a").should("have.attr", "href", "/kit");
    cy.get("[data-test-kit-account]").should("not.exist");
  });

  it("says so when the brief does not load, and Try again loads it", () => {
    // the briefs are a file of their own, fetched by the page; under the dev server (what CI runs) it is this address
    let fail = true;
    // (the page's own module import of that address, "…kits.json?import&url", is left alone: only the data is lost)
    cy.intercept("GET", /\/src\/sim\/kits\/data\/kits\.json(?!.*import)/, (req) => {
      if (fail) req.destroy();
      else req.continue();
    }).as("briefs");
    cy.visit("/kit/cartethyia", seed());
    cy.get("[data-test-kit-failed]", { timeout: 20000 }).should("contain.text", "Cartethyia's brief did not load");
    cy.get("[data-test-kit-title]").should("have.text", "Cartethyia"); // who it is about still shows, from the small index
    cy.then(() => {
      fail = false;
    });
    cy.get("[data-test-kit-retry]").click();
    cy.get("[data-test-kit-account]", { timeout: 20000 }).should("be.visible");
    cy.get("[data-test-kit-failed]").should("not.exist");
  });
});
