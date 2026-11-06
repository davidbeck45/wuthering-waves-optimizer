// Wuthering Tools+ Echo Lab pass 2 (/echo-lab, v3 UI): the "Tuner plan" tab — the budget the player types, the
// ordered plan it buys (now / later / week N), remembered after a reload, the slots where a new echo pays most — and
// "How good is this roll" in an inventory row's detail (percentile, rating, lines to hope for), all inside a phone at
// 412 px with 130 % text. Seeded through onBeforeLoad with the Echo Lab unit-test fixture (public data only:
// Cartethyia, Galbrena, Zani, synthesised "lab" echoes — labtune0003 / labtune0004 are the unfinished ones).
import * as fixtureModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

// Cypress's webpack hands JSON over as the module itself (no default export)
type Account = { characters: Record<string, unknown>; echoes: Array<{ echoId: string }>; equipped: Record<string, unknown> };
const fixture = ((fixtureModule as unknown as { default?: Account }).default ?? fixtureModule) as unknown as Account;

const RUN = { timeout: 60000 };
const BUDGET_KEY = "wtplus:echoLab:tunerBudget";

function seed({ fontScale }: { fontScale?: number } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.setItem("character", JSON.stringify({ characters: fixture.characters, activeCharacter: "Cartethyia" }));
      win.localStorage.setItem("inventory", JSON.stringify({ echoes: fixture.echoes, equipped: fixture.equipped, echoPresets: [], equippedPresets: {} }));
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      if (!fontScale) return;
      const style = win.document.createElement("style");
      style.textContent = `html { font-size: ${fontScale * 100}%; }`;
      win.document.head.appendChild(style);
    },
  };
}

function expectNoHorizontalScroll(label: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${label} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

describe("Echo Lab Tuner plan and roll quality", () => {
  it("plans the Tuners the player types: now, later, by week, remembered after a reload", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=plan", seed());
    cy.get('[data-test-echo-lab-tab="plan"]', RUN).should("have.attr", "aria-selected", "true");
    cy.get("[data-test-echo-lab-plan-intro]").should("contain.text", "Tuners");
    cy.get("[data-test-echo-lab-plan-step]", RUN).should("have.length", 2);
    // nothing typed yet: a ranked list, no "Now"
    cy.get("[data-test-echo-lab-plan-when]").should("not.exist");
    cy.get('[data-test-echo-lab-plan-kpi="now"]').should("contain.text", "type your Tuners");
    cy.get("[data-test-echo-lab-plan-cost]").first().invoke("text").should("match", /^(10|20) Tuners$/);
    cy.get("[data-test-echo-lab-plan-keep]").first().invoke("text").should("match", /^\d+%$/);
    cy.get("[data-test-echo-lab-plan-fresh-row]", RUN).should("have.length.at.least", 1);
    cy.get("[data-test-echo-lab-plan-fresh-keep]").first().invoke("text").should("match", /^\d+%$/);

    // 25 Tuners: the first echo (10 or 20) fits, the second waits
    cy.get("[data-test-echo-lab-plan-tuners]").type("25").blur();
    cy.get("[data-test-echo-lab-plan-step]").first().should("have.attr", "data-when", "now");
    cy.get('[data-test-echo-lab-plan-step][data-when="now"]').should("have.length.at.least", 1);
    cy.get('[data-test-echo-lab-plan-kpi="tuners"] [data-test-echo-lab-plan-kpi-value]').invoke("text").should("match", /^(5|15)$/);
    // the gain says what it is: per rotation, and whose (or how many characters it sums)
    cy.get('[data-test-echo-lab-plan-kpi="now"]').invoke("text").should("match", /\+[\d.]+[kKM]? expected damage per rotation (for \w+|, summed over \d characters)/);
    cy.get("[data-test-echo-lab-plan-fresh-line]").should("contain.text", "full tune");

    // a weekly income gives the rest a week
    cy.get("[data-test-echo-lab-plan-tuners]").clear().type("0").blur();
    cy.get('[data-test-echo-lab-plan-step][data-when="later"]').should("have.length", 2);
    cy.get("[data-test-echo-lab-plan-short]").first().should("contain.text", "Tuner");
    cy.get("[data-test-echo-lab-plan-weekly-toggle]").click();
    cy.get("[data-test-echo-lab-plan-weekly-tuners]").type("10").blur();
    cy.get('[data-test-echo-lab-plan-step][data-when="week"]').should("have.length", 2);
    cy.get("[data-test-echo-lab-plan-when]").first().should("contain.text", "Week");
    cy.get("[data-test-echo-lab-plan-weekly-line]").should("contain.text", "weekly income");

    // remembered in this browser
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem(BUDGET_KEY) ?? "{}")).to.include({ v: 1, tuners: 0, weeklyTuners: 10 });
    });
    cy.reload();
    cy.get("[data-test-echo-lab-plan-tuners]", RUN).should("have.value", "0");
    cy.get("[data-test-echo-lab-plan-weekly-tuners]").should("have.value", "10");
    cy.get('[data-test-echo-lab-plan-step][data-when="week"]', RUN).should("have.length", 2);
    cy.get("[data-test-echo-lab-plan-clear]").click();
    cy.get("[data-test-echo-lab-plan-tuners]").should("have.value", "");
    cy.window().then((win) => expect(win.localStorage.getItem(BUDGET_KEY)).to.eq(null));

    cy.get("[data-test-echo-lab-info=plan]").click();
    cy.get("[data-test-echo-lab-info-panel=plan]").should("be.visible").and("contain.text", "+5n");
  });

  it("rates a roll in the inventory row's detail: percentile, rating and the lines to hope for", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab", seed());
    // Galbrena's main echo, rated where it sits
    cy.get('[data-test-echo-lab-row="8xziafu5n3"]', RUN).click();
    cy.get('[data-test-echo-lab-detail="8xziafu5n3"] [data-test-echo-lab-quality-percentile]', RUN)
      .invoke("text")
      .should("match", /^(Better than \d+%|Top 1%|Bottom 1%)$/);
    cy.get('[data-test-echo-lab-detail="8xziafu5n3"] [data-test-echo-lab-quality]').should("contain.text", "where it sits").and("contain.text", "+25");
    cy.get('[data-test-echo-lab-detail="8xziafu5n3"] [data-test-echo-lab-quality-band]').invoke("text").should("match", /roll|average/);
    cy.get('[data-test-echo-lab-detail="8xziafu5n3"] [data-test-echo-lab-quality-hope]').should("not.exist");
    // an unfinished echo: what to hope for next
    cy.get('[data-test-echo-lab-row="labtune0003"]').click();
    cy.get('[data-test-echo-lab-detail="labtune0003"] [data-test-echo-lab-quality-hope]', RUN).should("contain.text", "Hope for next (at +20)");
    cy.get('[data-test-echo-lab-detail="labtune0003"] [data-test-echo-lab-quality-hope-line]').should("have.length.within", 1, 3);
    // no build can slot it: said plainly, no spinner
    cy.get('[data-test-echo-lab-row="labnoslot01"]').click();
    cy.get('[data-test-echo-lab-detail="labnoslot01"] [data-test-echo-lab-quality-none]').should("contain.text", "no build to rate it on");
  });

  it("stays inside a phone at 412 px with 130 % text", () => {
    cy.viewport(412, 915);
    cy.visit("/echo-lab?tab=plan", seed({ fontScale: 1.3 }));
    cy.get("[data-test-echo-lab-plan-step]", RUN).should("have.length", 2);
    cy.get("[data-test-echo-lab-plan-tuners]").type("15").blur();
    cy.get("[data-test-echo-lab-plan-weekly-toggle]").click();
    cy.get("[data-test-echo-lab-plan-weekly-tuners]").type("20").blur();
    cy.get("[data-test-echo-lab-plan-fresh-row]", RUN).should("exist");
    expectNoHorizontalScroll("tuner plan");
    // a step's echo (name, set, main stat) gets the card's width: the "Now" chip sits under the step number, not
    // beside the set (at 360 px it cut "Sun-sinking Eclipse" to "Sun-sinking…")
    cy.get("[data-test-echo-lab-plan-step]").first().then(($step) => {
      const card = $step[0].getBoundingClientRect();
      const echo = $step[0].querySelector(".plan-card__echo")!.getBoundingClientRect();
      const order = $step[0].querySelector(".plan-card__order")!.getBoundingClientRect();
      const when = $step[0].querySelector("[data-test-echo-lab-plan-when]")!.getBoundingClientRect();
      expect(echo.width, "echo block width").to.be.greaterThan(card.width * 0.6);
      expect(when.top, "chip under the step number").to.be.at.least(order.bottom - 1);
    });
    // seven tabs in a two-column grid since the Set lab (2026-11-04): three full rows, and the last tab fills the fourth
    // (echoLab.css gives an odd last tab both columns, so no hole is left beside it)
    cy.get('[data-test-echo-lab-tab="benchmark"]').then(($b) => {
      const tabs = $b[0].parentElement!.getBoundingClientRect();
      expect($b[0].getBoundingClientRect().width).to.be.within(tabs.width * 0.85, tabs.width);
    });
    cy.get('[data-test-echo-lab-tab="verdicts"]').click();
    cy.get('[data-test-echo-lab-row="labtune0003"]', RUN).click();
    cy.get("[data-test-echo-lab-quality-hope]", RUN).should("be.visible");
    expectNoHorizontalScroll("roll quality");
  });
});
