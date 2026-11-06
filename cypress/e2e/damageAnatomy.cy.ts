// Wuthering Tools+ "Why this number" (src/sim/anatomy/): one sheet from /my-rankings rows, the /account drawer, the
// calculator's engine panel and the palette. The page's own figure is the sheet's figure; the shares add up; the hit's
// factors are named and checked; each step is ranked; a hit that can't be reconciled says so and shows no factor. v3, the
// phone first (David's S26: 412 px at 130 % text), the Cartethyia fixture account plus two synthetic saved rotations.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const RUN = { timeout: 60000 };
const WIDE = 1440;
const NAME_ALL_KINDS = "Why test: every kind of hit";
const NAME_BITE = "Why test: Glacio Bite";

function account(): { character: string; inventory: string } {
  const character = JSON.parse(configOptimizer.data.character);
  // a tick and a Tune Break beside the kit's own attacks, in a saved rotation
  character.characters.Cartethyia.rotations.push({
    id: "why-kinds",
    name: NAME_ALL_KINDS,
    actions: [
      { id: "why-1", order: 0, key: "ElementalEffectAeroErosion", type: "negativeStatus", negativeStatusStacks: 4, count: 3, buffs: [] },
      { id: "why-2", order: 1, key: "TuneBreakDMG", type: "tuneBreak", count: 1, buffs: [] },
    ],
  });
  // Glacio Bite with an Endgame Total DMG: the engine multiplies it in and leaves it out of the parts it reports
  character.characters.Hiyuki = {
    weapon: "EmeraldOfGenesis",
    buffs: { InherentSkillFineSnow: { isEnabled: true, stacks: 3 } },
    customBuffs: { TotalDamageEndgame: 30 },
    rotations: [{ id: "why-bite", name: NAME_BITE, actions: [{ id: "why-b", order: 0, key: "GlacioBiteDMG", type: "forteCircuit", count: 1, buffs: [] }] }],
  };
  return { character: JSON.stringify(character), inventory: configOptimizer.data.inventory as string };
}

const seed = (fontScale?: number) => ({
  onBeforeLoad(win: Window) {
    win.sessionStorage.clear();
    const { character, inventory } = account();
    win.localStorage.setItem("character", character);
    win.localStorage.setItem("inventory", inventory);
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
});

const sheet = () => cy.get("[data-test-anatomy-sheet]");

function openFromRankings(id: string): void {
  cy.get(`[data-test-my-rankings-expand="${id}"]`, RUN).click();
  cy.get(`[data-test-why-number="${id}"]`).click();
  sheet().should("have.attr", "open");
}

/** the sheet has its steps: the engine has answered for the hit on show */
const settled = () => cy.get("[data-test-anatomy-move], [data-test-anatomy-no-moves]", RUN).should("exist");

function expectInsideScreen(what: string): void {
  sheet().then(($d) => {
    const dialog = $d[0] as HTMLDialogElement;
    const width = dialog.ownerDocument.documentElement.clientWidth;
    expect(dialog.scrollWidth, `${what}: the sheet scrolls sideways`).to.be.at.most(dialog.clientWidth);
    const over = Array.from(dialog.querySelectorAll<HTMLElement>("*")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && !el.children.length && r.right > width + 0.5;
    });
    expect(over.map((el) => el.className), `${what}: past the right edge`).to.deep.equal([]);
  });
}

const percentOf = (text: string): number => Number(text.replace(/[^\d.]/g, ""));

describe("Why this number", () => {
  it("opens from a /my-rankings row at 412 px / 130 % on the row's own figure, and walks through all three parts", () => {
    cy.viewport(412, 915);
    cy.visit("/my-rankings", seed(1.3));
    cy.get('[data-test-my-rankings-row="Cartethyia"] [data-test-my-rankings-damage]', RUN).invoke("text").as("rowFigure");
    openFromRankings("Cartethyia");
    settled();

    // the same number as the row, named: which engine, which unit, which enemy
    cy.get<string>("@rowFigure").then((figure) => cy.get("[data-test-anatomy-total]").should("have.text", figure.trim()));
    cy.get("[data-test-anatomy-figure]").should("contain.text", "average damage per rotation").and("contain.text", "this app's calculator").and("contain.text", "enemy level 100, 20 % RES");

    // shares of the rotation: by skill type, then by attack
    cy.get("[data-test-anatomy-share] .an-share__pct").then(($p) => {
      const total = [...$p].reduce((s, el) => s + percentOf(el.textContent ?? ""), 0);
      expect(total, "by skill type").to.be.closeTo(100, 0.5);
    });
    cy.get('[data-test-anatomy-by="attack"]').click().should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-anatomy-share]").should("have.length.at.most", 6);
    cy.get("[data-test-anatomy-show-all]").click();
    cy.get("[data-test-anatomy-share] .an-share__pct").then(($p) => {
      const total = [...$p].reduce((s, el) => s + percentOf(el.textContent ?? ""), 0);
      expect(total, "by attack").to.be.closeTo(100, 1);
    });
    expectInsideScreen("shares");

    // the biggest hit, every factor named with its value, checked against the engine
    cy.get("[data-test-anatomy-hit-select] option").first().should("contain.text", "(biggest)");
    cy.get('[data-test-anatomy-factor="stat"]').should("contain.text", "Max HP").find("[data-test-anatomy-factor-value]").invoke("text").should("match", /^\d[\d,]+$/);
    for (const id of ["multiplier", "dmgBonus", "def", "res"]) cy.get(`[data-test-anatomy-factor="${id}"] [data-test-anatomy-factor-value]`).invoke("text").should("match", /^× /);
    cy.get('[data-test-anatomy-factor="res"]').should("contain.text", "Enemy RES 20.0 %");
    cy.get('[data-test-anatomy-factor="crit"]').should("contain.text", "Crit Rate").and("contain.text", "Crit DMG");
    cy.get("[data-test-anatomy-average]").should("contain.text", "Average hit");
    cy.get("[data-test-anatomy-reconciled]").should("contain.text", "multiply back to the calculator's own figure");

    // what moves it: ranked by this hit, then by the rotation
    const gains = (index: number) => cy.get("[data-test-anatomy-move]").then(($rows) => [...$rows].map((row) => Number((row.querySelectorAll(".an-m__gain b")[index]?.textContent ?? "").replace(/[^\d.]/g, ""))));
    gains(0).then((list) => {
      expect(list.length, "steps").to.be.at.least(6);
      expect(list).to.deep.equal([...list].sort((a, b) => b - a));
    });
    cy.get('[data-test-anatomy-move="substat:HP"]').should("contain.text", "One mid substat roll").and("contain.text", "this hit").and("contain.text", "rotation");
    cy.get('[data-test-anatomy-sort="rotation"]').click().should("have.attr", "aria-pressed", "true");
    gains(1).then((list) => expect(list).to.deep.equal([...list].sort((a, b) => b - a)));
    expectInsideScreen("moves");

    // closing gives focus back to the button (a native <dialog>: Escape is the browser's own, and cy.press doesn't reach
    // its close watcher in Electron, so that was checked in Chromium over CDP)
    cy.get("[data-test-anatomy-close]").click();
    sheet().should("not.have.attr", "open");
    cy.focused().should("have.attr", "data-test-why-number", "Cartethyia");
  });

  it("opens a row's hit from the shares, reads a Negative Status tick and a Tune Break hit, and changes rotation", () => {
    cy.viewport(412, 915);
    cy.visit("/my-rankings", seed(1.3));
    openFromRankings("Cartethyia");
    settled();
    cy.get("[data-test-anatomy-total]").invoke("text").as("best");

    cy.get("[data-test-anatomy-rotation] option").should("have.length.at.least", 3);
    cy.get("[data-test-anatomy-rotation] option").contains(NAME_ALL_KINDS).then(($o) => cy.get("[data-test-anatomy-rotation]").select($o.val() as string));
    cy.get<string>("@best").then((best) => cy.get("[data-test-anatomy-total]").invoke("text").should("not.eq", best));
    settled();

    cy.get('[data-test-anatomy-share="Negative Status"]').click();
    cy.get("[data-test-anatomy-hit-meta]").should("contain.text", "Negative Status").and("contain.text", "lands 3 times");
    cy.get('[data-test-anatomy-factor="levelBase"]').should("contain.text", "Status base");
    cy.get('[data-test-anatomy-factor="motion"]').should("contain.text", "4 stacks");
    cy.get('[data-test-anatomy-factor="stat"]').should("not.exist");
    cy.get("[data-test-anatomy-times]").should("contain.text", "× 3 in this rotation");
    cy.get("[data-test-anatomy-reconciled]").should("exist");
    cy.get('[data-test-anatomy-move^="stacks:"]', RUN).should("contain.text", "4 → 5");

    cy.get('[data-test-anatomy-share="Tune Break"]').click();
    cy.get("[data-test-anatomy-hit-meta]").should("contain.text", "Tune Break");
    cy.get('[data-test-anatomy-factor="enemyType"]').should("contain.text", "Calamity enemy");
    cy.get('[data-test-anatomy-factor="levelBase"]').should("contain.text", "Tune Break base");
    cy.get("[data-test-anatomy-reconciled]").should("exist");
    cy.get('[data-test-anatomy-move="custom:TuneBreakDMGBonus"]', RUN).should("exist");
    cy.get("[data-test-anatomy-flat]").should("contain.text", "Enemy RES");
    expectInsideScreen("Tune Break");
  });

  it("a hit it can't reconcile shows the calculator's figures, no factor, and says so", () => {
    cy.viewport(412, 915);
    cy.visit("/my-rankings", seed(1.3));
    openFromRankings("Hiyuki");
    settled();
    cy.get("[data-test-anatomy-rotation] option").contains(NAME_BITE).then(($o) => cy.get("[data-test-anatomy-rotation]").select($o.val() as string));
    cy.get("[data-test-anatomy-hit-meta]").should("contain.text", "Negative Status");
    cy.get("[data-test-anatomy-factor]").should("not.exist");
    cy.get("[data-test-anatomy-reconciled]").should("not.exist");
    cy.get("[data-test-anatomy-note]").should("contain.text", "aren't shown");
    cy.get("[data-test-anatomy-average]").invoke("text").should("match", /[1-9]/);
    // the steps are engine runs, so they stay
    cy.get('[data-test-anatomy-move="custom:DefReduction"]', RUN).should("exist");
  });

  it("a rotation list that fails to load says so in plain words", () => {
    cy.intercept("GET", "**/presets/data/rotations/Cartethyia.json*", { forceNetworkError: true });
    cy.viewport(412, 915);
    cy.visit("/account", seed(1.3));
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-input]", RUN).type("why this number cart{enter}");
    cy.get("[data-test-anatomy-error]", RUN).should("contain.text", "couldn't finish").and("not.contain.text", "import");
    cy.get("[data-test-anatomy-close]").click();
    sheet().should("not.have.attr", "open");
  });

  it("stacks over the /account drawer, and closing it leaves the drawer open", () => {
    cy.viewport(412, 915);
    cy.visit("/account", seed(1.3));
    cy.get('[data-test-account-card="Cartethyia"]', RUN).click();
    cy.get("[data-test-account-drawer]").should("have.attr", "open");
    cy.get('[data-test-account-drawer] [data-test-why-number="Cartethyia"]', RUN).click();
    sheet().should("have.attr", "open");
    settled();
    cy.get("[data-test-anatomy-close]").click();
    sheet().should("not.have.attr", "open");
    cy.get("[data-test-account-drawer]").should("have.attr", "open");
    cy.focused().should("have.attr", "data-test-why-number", "Cartethyia");
  });

  it("opens from the calculator's engine panel on the panel's rotation, and from the palette on the best one", () => {
    cy.viewport(WIDE, 1200);
    cy.visit("/", seed());
    cy.get('[data-test-calculator-nav="echoes"]').filter(":visible").click();
    cy.get("[data-test-echo-lab-engine]").filter(":visible").find('[data-test-echo-lab-engine-why] [data-test-why-number="Cartethyia"]', RUN).click();
    sheet().should("have.attr", "open");
    settled();
    cy.get("[data-test-anatomy-total]").invoke("text").as("panel");
    sheet().find("[data-test-anatomy-close]").click();
    sheet().should("not.have.attr", "open");

    cy.get("body").type("{ctrl}k");
    // Enter on what was typed: "why …" reads as a question, but the command's title is first, so nothing goes to Claude
    cy.get("[data-test-palette-input]", RUN).type("why this number cart");
    cy.get("[data-test-palette-item]").first().should("have.attr", "data-test-palette-item").and("match", /:anatomy$/);
    cy.get("[data-test-palette-input]").type("{enter}");
    sheet().should("have.attr", "open");
    settled();
    cy.get<string>("@panel").then((panel) => cy.get("[data-test-anatomy-total]").should("have.text", panel));
    // a click on the backdrop closes it
    sheet().then(($d) => $d[0].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    sheet().should("not.have.attr", "open");
  });
});
