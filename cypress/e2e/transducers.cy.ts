// Wuthering Tools+ Echo Lab's Transducers tab (/echo-lab?tab=transducers) in the v3 UI: the ranking fills from the
// re-roll jobs, the best-use block names the first row's echo, every filter changes the rows and the address, a link
// with filters lands on them, the budget follows N, a row opens with a link to the Re-roll tab, the two switches re-run
// the read, a filter works mid-run, and the tab stays inside a phone at 130 % text. Seeded like echoLab.cy.ts with the
// Echo Lab unit-test fixture (public data only).
import * as fixtureModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

type Account = { characters: Record<string, unknown>; echoes: Array<{ echoId: string }>; equipped: Record<string, unknown> };
const fixture = ((fixtureModule as unknown as { default?: Account }).default ?? fixtureModule) as unknown as Account;

const RUN = { timeout: 90000 };

/** every equipped echo with its fifth line taken off: nothing a Transducer may touch */
function fourLines(): Account["echoes"] {
  return fixture.echoes.map((e) => {
    if (!fixture.equipped[e.echoId]) return e;
    const rest = { ...(e as Record<string, unknown>) };
    delete rest.echoSubStatsType5;
    delete rest.echoSubStatsValue5;
    return rest as Account["echoes"][number];
  });
}

function seed(fontScale?: number, echoes: Account["echoes"] = fixture.echoes) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.setItem("character", JSON.stringify({ characters: fixture.characters, activeCharacter: "Cartethyia" }));
      win.localStorage.setItem("inventory", JSON.stringify({ echoes, equipped: fixture.equipped, echoPresets: [], equippedPresets: {} }));
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

/** the run is done: "N of N echoes read", nothing running */
function waitForRun(): void {
  cy.get("[data-test-tdx-progress]", RUN).should(($p) => {
    const m = $p.text().match(/(\d+) of (\d+) echoes read/);
    expect(m, $p.text()).to.not.equal(null);
    expect(m![1]).to.eq(m![2]);
    expect($p.attr("data-running")).to.eq("no");
  });
}

const query = (): Cypress.Chainable<URLSearchParams> => cy.location("search").then((s) => new URLSearchParams(s));

describe("Echo Lab: Transducers tab", () => {
  it("ranks the echoes, names the best use, filters through the address, plans a budget and opens a row", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=transducers", seed());
    cy.get('[data-test-echo-lab-tab="transducers"]', RUN).should("have.attr", "aria-selected", "true");
    waitForRun();
    cy.get("[data-test-tdx-row]").should("have.length.at.least", 2);
    cy.get("[data-test-tdx-scope]").should("contain.text", "Equipped echoes only");
    // the tab says "keep" where the game says "lock": once, where a player first reads it
    cy.get("[data-test-tdx-keep-is-lock]").should("contain.text", "lock it in the game's Data Modify screen");

    // the best use is the first row
    cy.get("[data-test-tdx-best]").should("be.visible").invoke("attr", "data-key").then((key) => {
      cy.get("[data-test-tdx-row]").first().should("have.attr", "data-test-tdx-row", key).and("have.attr", "data-pays", "yes");
    });
    cy.get("[data-test-tdx-best-gain]").should("contain.text", "rotation damage").and("contain.text", "damage per rotation");
    cy.get("[data-test-tdx-best-top]").should("contain.text", "The best it can roll");

    // Transducers a try = 3 → every row costs 3, address says so
    cy.get('[data-test-tdx-cost="3"]').click();
    query().then((q) => expect(q.get("cost")).to.eq("3"));
    cy.get('[data-test-tdx-row][data-pays="yes"]').each(($row) => expect($row.find("[data-test-tdx-row-lines] .el-chip--lock")).to.have.length(4));
    // lines kept 1 cannot cost 3: the cost clears, never an empty table
    cy.get('[data-test-tdx-keep="1"]').click();
    query().then((q) => {
      expect(q.get("keep")).to.eq("1");
      expect(q.get("cost")).to.eq(null);
    });
    cy.get('[data-test-tdx-cost="any"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-tdx-row]").should("have.length.at.least", 1);
    cy.get('[data-test-tdx-row][data-pays="yes"]').each(($row) => expect($row.find("[data-test-tdx-row-lines] .el-chip--lock")).to.have.length(1));
    cy.get('[data-test-tdx-keep="any"]').click();

    // one resonator
    cy.get('[data-test-tdx-character="Galbrena"]').click();
    query().then((q) => expect(q.get("character")).to.eq("Galbrena"));
    cy.get("[data-test-tdx-row]").each(($row) => expect($row.attr("data-test-tdx-row")).to.match(/^Galbrena\|/));
    cy.get('[data-test-tdx-character=""]').click();
    query().then((q) => expect(q.get("character")).to.eq(null));

    // who and order
    cy.get('[data-test-tdx-who="everyone"]').click();
    query().then((q) => expect(q.get("who")).to.eq("everyone"));
    cy.get("[data-test-tdx-sort]").select("chance");
    query().then((q) => expect(q.get("sort")).to.eq("chance"));
    cy.get("[data-test-tdx-sort]").select("damage");

    // the budget follows N
    cy.get("[data-test-tdx-have]").should("have.value", "3");
    cy.get("[data-test-tdx-budget-summary]").should("contain.text", "of 3");
    cy.get("[data-test-tdx-have]").clear();
    cy.get("[data-test-tdx-have]").type("12");
    cy.get("[data-test-tdx-have]").blur();
    query().then((q) => expect(q.get("have")).to.eq("12"));
    cy.get("[data-test-tdx-budget-summary]").should("contain.text", "of 12");
    cy.get("[data-test-tdx-budget-step]").should("have.length.at.least", 1);

    // the crit question
    cy.get("[data-test-tdx-crit]").should("contain.text", "Is keeping Crit Rate and Crit DMG always right?");

    // a row opens: every lock count, and a link to that resonator on the Re-roll tab
    cy.get("[data-test-tdx-row]").first().as("row").invoke("attr", "data-test-tdx-row").then((key) => {
      const id = String(key).split("|")[0];
      cy.get("@row").find("[data-test-tdx-row-toggle]").should("have.attr", "aria-expanded", "false");
      cy.get("@row").find("[data-test-tdx-row-toggle]").click();
      cy.get("@row").find("[data-test-tdx-row-toggle]").should("have.attr", "aria-expanded", "true");
      cy.get("@row").find("[data-test-tdx-plan]").should("have.length", 5);
      cy.get("@row").find("[data-test-tdx-row-reroll]").should("have.attr", "href", `/echo-lab?tab=reroll&character=${id}`);
      cy.get("@row").find("[data-test-tdx-row-reroll]").click();
      cy.location("search").should("eq", `?tab=reroll&character=${id}`);
      cy.get(`[data-test-echo-lab-reroll-character="${id}"]`).should("have.attr", "aria-pressed", "true");
    });
    // and the Re-roll tab leads back
    cy.get("[data-test-echo-lab-reroll-to-transducers]").click();
    cy.location("search").should("contain", "tab=transducers");
    // the jobs are the Re-roll tab's: nothing to read again
    waitForRun();
  });

  it("lands on the filters a link carries, and keeps working when a filter changes mid-run", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=transducers&keep=2&cost=1&have=5&sort=gain", seed());
    cy.get('[data-test-tdx-keep="2"]', RUN).should("have.attr", "aria-pressed", "true");
    // mid-run: change a filter before the read is done
    cy.get('[data-test-tdx-cost="1"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-tdx-sort]").should("have.value", "gain");
    cy.get("[data-test-tdx-have]").should("have.value", "5");
    cy.get('[data-test-tdx-keep="0"]').click();
    query().then((q) => expect(q.get("keep")).to.eq("0"));
    waitForRun();
    cy.get('[data-test-tdx-row][data-pays="yes"]').each(($row) => expect($row.find("[data-test-tdx-row-lines] .el-chip--lock")).to.have.length(0));
  });

  it("re-runs the read when a switch for what the game does not publish changes", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=transducers", seed());
    waitForRun();
    cy.get("[data-test-tdx-repeat]").should("be.checked").click();
    query().then((q) => expect(q.get("repeat")).to.eq("0"));
    // a new read of every echo, which finishes
    waitForRun();
    cy.get("[data-test-tdx-keep-er]").click();
    query().then((q) => expect(q.get("keepEr")).to.eq("1"));
    waitForRun();
    // back to the defaults: the Re-roll tab's jobs, already read
    cy.get("[data-test-tdx-repeat]").click();
    cy.get("[data-test-tdx-keep-er]").click();
    query().then((q) => {
      expect(q.get("repeat")).to.eq(null);
      expect(q.get("keepEr")).to.eq(null);
    });
    waitForRun();
  });

  it("says what to do when no equipped echo is fully tuned, and lists them with a way to Tune or Feed", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=transducers", seed(undefined, fourLines()));
    cy.get("[data-test-tdx-empty]", RUN).should("contain.text", "No equipped echo has all five substat lines");
    cy.get("[data-test-tdx-row]").should("not.exist");
    cy.get("[data-test-tdx-unfinished] li").should("have.length.at.least", 10).first().should("contain.text", "4 of 5 lines: finish tuning it first");
    cy.get("[data-test-tdx-unfinished] a").first().click();
    cy.get('[data-test-echo-lab-tab="tune"]').should("have.attr", "aria-selected", "true");
    cy.location("search").should("eq", "?tab=tune");
  });

  for (const [width, height] of [
    [412, 915],
    [360, 800],
  ] as const) {
    it(`stays inside a ${width} px phone with 130 % text, a row open`, () => {
      cy.viewport(width, height);
      cy.visit("/echo-lab?tab=transducers", seed(1.3));
      waitForRun();
      cy.get("[data-test-tdx-row-toggle]").first().click();
      cy.get("[data-test-tdx-row-detail]").should("be.visible");
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, "page width").to.be.at.most(doc.documentElement.clientWidth);
        const limit = doc.documentElement.clientWidth;
        const over = [...doc.querySelectorAll<HTMLElement>("[data-test-tdx] *")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > limit + 1 && !el.closest(".tdx__rail");
        });
        expect(over.map((el) => `${el.tagName}.${el.className}`), "past the right edge").to.deep.equal([]);
      });
      // tap targets
      cy.get("[data-test-tdx-cost], [data-test-tdx-keep], [data-test-tdx-row-toggle]").each(($b) => expect($b[0].getBoundingClientRect().height).to.be.at.least(43.5));
      // the tab strip still reads: every tab label inside its button
      cy.get("[data-test-echo-lab-tab]").each(($t) => expect($t[0].scrollWidth, $t.text()).to.be.at.most($t[0].clientWidth + 1));
    });
  }
});
