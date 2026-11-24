// Wuthering Tools+ (batch 5, 2026-11-23, lane check-pages): the second check of Tier list and Roster value
// (src/sim/rileyPages/) living beside /rankings. Each test here was red before the fix it names.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

type RouterHost = { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } };
/** In-app navigation, as a menu link or a RouterLink does it (no page load). */
function push(to: string): void {
  cy.window().then((win) => {
    const host = [...win.document.querySelectorAll("*")].find((el) => "__vue_app__" in el) as unknown as RouterHost;
    return host.__vue_app__.config.globalProperties.$router.push(to);
  });
}
const rileyLoaded = () => cy.get(".wt-riley-pages #loading", { timeout: 180000 }).should("have.attr", "hidden");

describe("Tier list and Roster value beside /rankings (second check)", () => {
  it("Tier list opened first: /rankings at My account still says how many teams are solved so far", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/tier-list");
    rileyLoaded();
    cy.window().then((win) => { (win as unknown as { wtMarker: number }).wtMarker = 11; });
    push("/rankings#tc=mine&own=0&r=Cartethyia");
    // the same look as rankingsSoFar.cy.ts: the docked box names the solve and counts it while rows are on screen
    cy.get(".skittle-root:not(.wt-riley-pages)", { timeout: 90000 }).should(($root) => {
      expect($root.hasClass("wt-sofar"), "rows so far on screen").to.eq(true);
      expect($root.find("#loading .status-text").text()).to.eq("Solving teams at your account");
      expect($root.find("#loading .progress-count").text()).to.match(/^\d+ of 10$/);
      expect($root.find("#loading .wt-sofar-note").text()).to.contain("so far");
    });
    cy.get(".skittle-root:not(.wt-riley-pages) #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.window().its("wtMarker").should("eq", 11);
  });
});

describe("Roster value: ticks naming a resonator his roster no longer has (second check)", () => {
  it("a name his engine dropped is not counted: ticks equal to the account read as the account's, with no button", () => {
    cy.viewport(1280, 900);
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/roster-value");
    rileyLoaded();
    cy.window().then((win) => {
      const account = JSON.parse(win.localStorage.getItem("wtplus:rosterValue.applied")!) as string[];
      expect(account).to.include("Cartethyia");
      // ticks kept by his own site or an older backup, with a name his roster has since dropped (no record of plus writing them)
      win.localStorage.setItem("wuwa.owned.v1", JSON.stringify([...account, "Nobody"]));
      win.localStorage.removeItem("wtplus:rosterValue.applied");
    });
    cy.reload();
    rileyLoaded();
    cy.get(".wt-riley-value input[data-name='Nobody']").should("not.exist");
    cy.get("[data-test-riley-owned-line]").should("contain.text", "Ticked from your account").and("not.contain.text", "different");
    cy.get("[data-test-riley-owned-use-account]").should("not.exist");
    // and plus wrote the same names on record: the next account change is followed, and no "removed Nobody" is ever said
    cy.window().then((win) => {
      win.localStorage.setItem("wuwa.owned.v1", JSON.stringify([...JSON.parse(win.localStorage.getItem("wuwa.owned.v1")!), "Nobody"]));
      win.localStorage.setItem("wtplus:rosterValue.applied", win.localStorage.getItem("wuwa.owned.v1")!);
    });
    cy.reload();
    rileyLoaded();
    cy.get("[data-test-riley-owned-line]").should("contain.text", "Ticked from your account").and("not.contain.text", "Nobody");
  });
});

describe("Tier list and Roster value controls stay on their page (second check)", () => {
  it("after /rankings, a Team Cost or Matrix change here reaches no listener of /rankings' table, and the page still follows it", () => {
    cy.viewport(1280, 900);
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=s6r5");
    cy.get(".skittle-root:not(.wt-riley-pages) #loading", { timeout: 180000 }).should("have.attr", "hidden");
    push("/tier-list");
    rileyLoaded();
    // his table.ts listens for `change` on the whole document (#cost, #matrixToggle) and runs a /rankings pass under
    // the new Team Cost: off-screen, on the same workers, as this page solves
    const seen: string[] = [];
    cy.document().then((doc) => doc.addEventListener("change", (e) => seen.push((e.target as Element).id || (e.target as Element).tagName)));
    cy.get(".wt-riley-tierlist #cost").select("s6r5");
    rileyLoaded();
    cy.location("hash").should("include", "tc=s6r5");
    cy.get(".wt-riley-tierlist #matrixToggle").check();
    rileyLoaded();
    cy.location("hash").should("include", "mx=true");
    push("/roster-value#tc=s3m");
    rileyLoaded();
    cy.get(".wt-riley-value #cost").should("have.value", "s3r1mdps");
    cy.get(".wt-riley-value #cost").select("s6r5");
    rileyLoaded();
    cy.get(".wt-riley-value input[data-name='Cartethyia']").uncheck();
    cy.get(".wt-riley-value .summary-label .hint").should("contain.text", "Neutral Matrix Score");
    cy.then(() => expect(seen, "change events that reached the document").to.deep.eq([]));
  });
});

describe("Tier list and Roster value on a 360 x 800 phone at 130 % text (second check)", () => {
  for (const page of ["/tier-list", "/roster-value"]) {
    it(`${page}: the first row starts above the bottom bar, under the lead, the account line and the button`, () => {
      cy.viewport(360, 800);
      cy.visit("/");
      cy.importCharacterData(configOptimizer);
      cy.visit(page, {
        onBeforeLoad(win) {
          const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
          settings.config = { ...settings.config, useClassicUi: false };
          win.localStorage.setItem("settings", JSON.stringify(settings));
        },
        onLoad(win) {
          const style = win.document.createElement("style");
          style.textContent = "html { font-size: 130% !important; }";
          win.document.head.appendChild(style);
        },
      });
      rileyLoaded();
      cy.get("[data-test-riley-mine-button]").should("be.visible");
      cy.window().should((win) => {
        const bar = parseFloat(win.getComputedStyle(win.document.documentElement).getPropertyValue("--nav-bottom-h")) || 0;
        expect(bar, "bottom bar measured").to.be.greaterThan(0);
        const first = [...win.document.querySelectorAll(".wt-riley-pages .trow:not(.thead) .c.name")].find((c) => c.getBoundingClientRect().height > 0)!;
        expect(first, "a row shown").to.exist;
        expect(first.getBoundingClientRect().bottom, "first row's bottom edge").to.be.at.most(win.innerHeight - bar);
      });
      // the page still says what it is: the heading is there for a screen reader, the top bar shows the name
      cy.get(".wt-riley-title").should("exist");
    });
  }
});

describe("His mode headings from the keyboard (second check)", () => {
  it("Tier list's 'Best Team DPR' and Roster value's 'Neutral Score Gain' switch with Enter or Space and keep the focus", () => {
    cy.viewport(1280, 900);
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/tier-list");
    rileyLoaded();
    cy.get(".wt-riley-tierlist .modehead").first().should("have.attr", "tabindex", "0").and("have.attr", "role", "button").and("contain.text", "DPR");
    cy.get(".wt-riley-tierlist .modehead").first().focus().trigger("keydown", { key: "Enter" });
    cy.get(".wt-riley-tierlist .modehead").first().should("contain.text", "DPS").and("have.attr", "tabindex", "0");
    cy.focused().should("have.class", "modehead");
    cy.focused().trigger("keydown", { key: " " });
    cy.get(".wt-riley-tierlist .modehead").first().should("contain.text", "DPR");
    cy.visit("/roster-value");
    rileyLoaded();
    cy.get(".wt-riley-value .modehead").first().should("have.attr", "role", "button").and("contain.text", "Neutral Score");
    cy.get(".wt-riley-value .modehead").first().focus().trigger("keydown", { key: "Enter" });
    cy.get(".wt-riley-value .modehead").first().should("contain.text", "Account DPR");
    cy.focused().should("have.class", "modehead");
  });
});

describe("The My account line says what a resonator not set up runs at (second check)", () => {
  it("names his free 5-stars run from S2 (Jianxin, whose team page reads 'Jianxin S2'), not only S0 with R1", () => {
    cy.viewport(1280, 900);
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    // the line is up as soon as the Team Cost is My account; the solve behind it need not finish here
    cy.visit("/tier-list#tc=mine");
    cy.get("[data-test-riley-mine-on]", { timeout: 60000 })
      .should("contain.text", "4-stars and Rover forms at S6")
      .and("contain.text", "Jianxin at S2");
  });
});

/** WCAG contrast of an element's text on what is painted behind it (its own and its ancestors' backgrounds). */
function contrastOf(win: Window, el: Element): number {
  const ctx = win.document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const rgba = (css: string): number[] => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
  };
  const layers: number[][] = [];
  for (let e: Element | null = el; e; e = e.parentElement) {
    const c = rgba(win.getComputedStyle(e).backgroundColor);
    if (c[3]! > 0) layers.push(c);
    if (c[3]! >= 1) break;
  }
  let bg = [255, 255, 255];
  for (const c of layers.reverse()) bg = bg.map((v, i) => v * (1 - c[3]!) + c[i]! * c[3]!);
  const lum = (c: number[]): number => {
    const f = (v: number): number => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
  };
  const [a, b] = [lum(rgba(win.getComputedStyle(el).color)), lum(bg)].sort((x, y) => y - x);
  return (a! + 0.05) / (b! + 0.05);
}

describe("Tier names readable on every theme (second check)", () => {
  for (const theme of ["light", "dark"]) {
    it(`T0 to T4 read at 4.5:1 or more on the ${theme} theme`, () => {
      cy.viewport(1280, 900);
      cy.visit("/tier-list", {
        onBeforeLoad(win) {
          const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
          settings.config = { ...settings.config, theme };
          win.localStorage.setItem("settings", JSON.stringify(settings));
        },
      });
      rileyLoaded();
      cy.get(".wt-riley-tierlist .trow .c.tier").should("have.length", 5);
      cy.window().then((win) => {
        for (const el of win.document.querySelectorAll(".wt-riley-tierlist .trow .c.tier")) {
          expect(contrastOf(win, el), `${el.textContent} on ${theme}`).to.be.at.least(4.5);
        }
      });
    });
  }
});
