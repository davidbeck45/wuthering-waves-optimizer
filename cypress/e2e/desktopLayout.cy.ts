// Wuthering Tools+ on desktops and tablets (2026-11-02 desktop audit, track fix-desktop; src/sim/README.md "Desktop and
// tablet"). The v3 UI is seeded through onBeforeLoad (the support file seeds classic): Ryan's side rail from 1024 px,
// his phone header and bottom bar below. Public data only: the Cartethyia calculator fixture and the Echo Lab unit-test
// account (synthesised echoes).
import { configOptimizer } from "./calculator/data/Cartethyia/data";
import * as echoLabModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

type LabAccount = { characters: Record<string, unknown>; echoes: Array<{ echoId: string }>; equipped: Record<string, unknown> };
// Cypress's webpack hands JSON over as the module itself (no default export)
const lab = ((echoLabModule as unknown as { default?: LabAccount }).default ?? echoLabModule) as unknown as LabAccount;

const RUN = { timeout: 60000 };
const PLAN_KEY = "wtplus:echoPlan:v1";

function v3(win: Window): void {
  const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
  settings.config = { ...settings.config, useClassicUi: false };
  win.localStorage.setItem("settings", JSON.stringify(settings));
}

/** the Cartethyia calculator account on the v3 UI */
const seedAccount = {
  onBeforeLoad(win: Window) {
    win.sessionStorage.clear();
    win.localStorage.removeItem(PLAN_KEY);
    win.localStorage.setItem("character", configOptimizer.data.character);
    win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
    v3(win);
  },
};

/** the Echo Lab test account on the v3 UI */
const seedLab = {
  onBeforeLoad(win: Window) {
    win.sessionStorage.clear();
    win.localStorage.setItem("character", JSON.stringify({ characters: lab.characters, activeCharacter: "Cartethyia" }));
    win.localStorage.setItem("inventory", JSON.stringify({ echoes: lab.echoes, equipped: lab.equipped, echoPresets: [], equippedPresets: {} }));
    v3(win);
  },
};

function expectNoSidewaysScroll(label: string): void {
  cy.document().should((doc) => {
    expect(doc.documentElement.scrollWidth, `${label}: page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

describe("desktop and tablet layouts", () => {
  it("Echo Lab lays its verdicts out by the page's width: cards beside the rail at 1024 px, the table from 1280", () => {
    // 1024 px with Ryan's rail left the table ~225 px wider than the window (D1)
    cy.viewport(1024, 768);
    cy.visit("/echo-lab", seedLab);
    cy.get("[data-test-echo-lab-row]", RUN).should("have.length", lab.echoes.length);
    cy.get(".el-thead").should("not.be.visible");
    cy.get('[data-test-echo-lab-verdict]').first().should("be.visible");
    expectNoSidewaysScroll("Echo Lab at 1024");
    // the card says what the gain is; the table's column header does that from 1280
    cy.get("[data-test-echo-lab-row] .el-card-only").filter(":visible").should("have.length.at.least", 1);
    cy.viewport(1280, 800);
    cy.get(".el-thead").should("be.visible");
    cy.get("[data-test-echo-lab-row] .el-card-only").filter(":visible").should("have.length", 0);
    expectNoSidewaysScroll("Echo Lab at 1280");
  });

  it("the calculator fits the window on a desktop and its big number says what it is", () => {
    cy.viewport(1440, 900);
    cy.visit("/", seedAccount);
    cy.get(".calculations__screens", RUN).should("be.visible");
    cy.get("[data-test-live-result-bar-hero]").should(($hero) => {
      expect(getComputedStyle($hero[0], "::after").content, "the caption under the number").to.match(/damage/);
    });
    // Ask's clearance below a fixed-height page made it 80 px taller than the window: the wheel then moved the window (D2)
    cy.document().should((doc) => {
      expect(doc.documentElement.scrollHeight, "page height").to.be.at.most(doc.defaultView!.innerHeight + 1);
    });
  });

  it("puts Ask in the rail on a desktop, docks the open panel beside the page from 1440 px, and floats it on a short window and under the phone header", () => {
    cy.viewport(1440, 900);
    cy.visit("/share", seedAccount);
    cy.get("[data-test-ai-open-rail]").should("be.visible").and("have.attr", "aria-expanded", "false");
    cy.get(".wt-ask-button").should("not.exist");
    cy.get("[data-test-ai-open-rail]").click();
    cy.get("[data-test-ai-panel]").should("be.visible");
    cy.get("[data-test-ai-open-rail]").should("have.attr", "aria-expanded", "true");
    cy.get("html").should("have.class", "wt-ai-docked");
    // the page column ends where the panel starts: nothing on the page sits under it (D13)
    cy.get("[data-test-ai-panel]").then(($panel) => {
      const panelLeft = $panel[0].getBoundingClientRect().left;
      cy.get("#wt-app .contain").should(($contain) => {
        expect($contain[0].getBoundingClientRect().right, "page column's right edge").to.be.at.most(panelLeft + 1);
      });
    });
    expectNoSidewaysScroll("docked at 1440");
    // narrower: the panel lies over the page as before
    cy.viewport(1280, 800);
    cy.get("html").should("not.have.class", "wt-ai-docked");
    cy.get("[data-test-ai-open-rail]").click();
    cy.get("[data-test-ai-panel]").should("not.be.visible");
    // a short laptop window (1366 × 768's ~657 px): the rail has no room for one more item, so Ask floats
    cy.viewport(1366, 657);
    cy.get("[data-test-ai-open-rail]").should("not.exist");
    cy.get(".wt-ask-button").should("be.visible");
    // under the phone header (below 1024 px) there is no rail: the floating button is back
    cy.viewport(1000, 800);
    cy.get("[data-test-ai-open-rail]").should("not.exist");
    cy.get(".wt-ask-button").should("be.visible");
  });

  it("names a plus page once under the phone header at 768 px, and in its own H1 on a desktop", () => {
    cy.viewport(768, 1024);
    cy.visit("/share", seedAccount);
    cy.get(".nav-phone-header").should("contain.text", "Share & import builds");
    cy.get("[data-test-share-page] > header > h1").should(($h1) => {
      expect($h1[0].getBoundingClientRect().width, "the H1 is for screen readers only").to.be.at.most(1);
    });
    cy.viewport(1440, 900);
    cy.get("[data-test-share-page] > header > h1").should(($h1) => {
      expect($h1[0].getBoundingClientRect().width, "the H1 on a desktop").to.be.greaterThan(100);
    });
  });

  it("/my-rankings fits a 768 px tablet: the headers keep to their columns and the pills wrap in the name cell", () => {
    cy.viewport(768, 1024);
    cy.visit("/my-rankings", seedAccount);
    cy.get("[data-test-my-rankings-row]", RUN).should("have.length.at.least", 1);
    cy.get("[data-test-my-rankings-characters] thead th").then(($th) => {
      const cells = [...$th].map((th) => th.getBoundingClientRect());
      for (let i = 1; i < cells.length; i++) {
        expect(cells[i - 1]!.right, `header ${i} ends before header ${i + 1}`).to.be.at.most(cells[i]!.left + 1);
      }
      // each header's text stays inside its own cell (it ran into the next one: "WEAPON BEST ROTATION")
      [...$th].forEach((th, i) => {
        if (th.querySelector(".sr-only")) return;
        const range = th.ownerDocument.createRange();
        range.selectNodeContents(th);
        const text = range.getBoundingClientRect();
        if (text.width) expect(text.right, `header ${i + 1} text`).to.be.at.most(th.getBoundingClientRect().right + 1);
      });
    });
    expectNoSidewaysScroll("/my-rankings at 768");
  });

  it("Echo plan: Mark all done can be undone, and Clear ticks asks first", () => {
    cy.viewport(1440, 900);
    // the Echo Lab account: three armed characters, so the plan has several cards to set
    cy.visit("/echo-plan", {
      onBeforeLoad(win: Window) {
        win.localStorage.removeItem(PLAN_KEY);
        seedLab.onBeforeLoad(win);
      },
    });
    cy.get("[data-test-echo-plan-grid] [data-test-echo-plan-card]", RUN).should("have.length.at.least", 2);
    // one card ticked by hand before the bulk tap
    cy.get("[data-test-echo-plan-grid] [data-test-echo-plan-card]")
      .first()
      .invoke("attr", "data-test-echo-plan-card")
      .then((set) => {
        const first = String(set);
        cy.get(`[data-test-echo-plan-grid] [data-test-echo-plan-done="${first}"]`).first().check();
        cy.get('[data-test-echo-plan-filter="done"]').should("contain.text", "1");
        cy.get("[data-test-echo-plan-mark-all]").click();
        cy.get("[data-test-echo-plan-undo-mark-all]").should("be.visible");
        cy.window().should((win) => {
          expect(Object.keys(JSON.parse(win.localStorage.getItem(PLAN_KEY) ?? "{}").done ?? {}).length, "ticked after Mark all").to.be.greaterThan(1);
        });
        cy.get("[data-test-echo-plan-undo-mark-all]").click();
        // back to exactly the hand tick, its grid snapshot kept
        cy.window().should((win) => {
          const saved = JSON.parse(win.localStorage.getItem(PLAN_KEY) ?? "{}");
          expect(saved.done).to.deep.equal({ [first]: true });
          expect(Object.keys(saved.grid)).to.deep.equal([first]);
        });
        cy.get("[data-test-echo-plan-mark-all]").should("be.visible");
        // a tick after the bulk tap ends the undo: the button is Clear ticks again
        cy.get("[data-test-echo-plan-mark-all]").click();
        cy.get("[data-test-echo-plan-undo-mark-all]").should("be.visible");
        cy.get(`[data-test-echo-plan-done="${first}"]`).first().uncheck();
        cy.get(`[data-test-echo-plan-done="${first}"]`).first().check();
        // Clear ticks forgets every snapshot: it asks, and Cancel keeps them
        cy.get("[data-test-echo-plan-clear-ticks]").should("be.visible").click();
        cy.get(".confirm-dialog .modal-box").should("be.visible").and("contain.text", "Untick all");
        cy.get(".confirm-dialog .modal-action .btn").first().click();
        cy.window().should((win) => {
          expect(Object.keys(JSON.parse(win.localStorage.getItem(PLAN_KEY) ?? "{}").done ?? {}).length, "kept after Cancel").to.be.greaterThan(1);
        });
        cy.get("[data-test-echo-plan-clear-ticks]").click();
        cy.get(".confirm-dialog .modal-action .btn-warning").click();
        cy.window().should((win) => {
          expect(JSON.parse(win.localStorage.getItem(PLAN_KEY) ?? "{}").done).to.deep.equal({});
        });
      });
  });

  it("/endgame puts four floors a row from 1536 px, and two beside the docked assistant", () => {
    // Season 41 (Date only), so the shipped floors are current; no account: the floors show without one
    cy.clock(Date.UTC(2026, 9, 26, 12), ["Date"]);
    cy.viewport(1536, 900);
    cy.visit("/endgame", {
      onBeforeLoad(win: Window) {
        win.sessionStorage.clear();
        v3(win);
      },
    });
    const floors = '[data-test-toa-floors] [data-test-toa-floor^="hazard-"]';
    cy.get(floors, RUN).should("have.length", 4);
    cy.get(floors).should(($f) => {
      const r = [...$f].map((e) => e.getBoundingClientRect());
      expect(r[3]!.top, "the fourth floor on the first floor's row").to.be.closeTo(r[0]!.top, 1);
    });
    // docked, the page is 420 px narrower: four a row were ~250 px each and the team names broke mid-word
    cy.get("[data-test-ai-open-rail]").click();
    cy.get("html").should("have.class", "wt-ai-docked");
    cy.get(floors).should(($f) => {
      const r = [...$f].map((e) => e.getBoundingClientRect());
      expect(r[2]!.top, "the third floor on a second row").to.be.greaterThan(r[0]!.bottom - 1);
      expect(r[0]!.width, "floor width beside the panel").to.be.greaterThan(400);
    });
    expectNoSidewaysScroll("/endgame docked at 1536");
  });

  it("the weapon value bars keep a readable width on a 768 px tablet", () => {
    cy.viewport(768, 1024);
    cy.visit("/weapons", seedAccount);
    cy.get("[data-test-weapons-row]", RUN).first().find(".wv-track").should(($track) => {
      // about 60 px before: the R2-R5 ticks and the "R5" label ran together (D5)
      expect($track[0].getBoundingClientRect().width, "bar width").to.be.greaterThan(400);
    });
    expectNoSidewaysScroll("/weapons at 768");
  });
});
