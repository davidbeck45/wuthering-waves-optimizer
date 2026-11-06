// Wuthering Tools+: "Cost to max" in the /account character drawer (src/sim/materials/MaterialsCostToMax.vue) — the
// Shell Credits, EXP and materials to raise a character and their weapon, from the calculator's saved levels or from
// level 1, in the v3 UI. Seeds the Cartethyia optimizer account with saved progress (level 50+, two Forte skills below
// 10, Defier's Thorn at 80) and an armed Ciaccona with nothing saved. The figures come from the same table and
// function the drawer uses; the from-level-1 total is the one the unit tests cross-check (4,460,260).
import { configOptimizer } from "./calculator/data/Cartethyia/data";
import * as tableModule from "../../src/sim/materials/data/materials.json";
import { costToMax, count, savedProgressOf, type MaterialsData } from "../../src/sim/materials/costToMax";

// (webpack hands a JSON module over as the namespace; vite as `default`)
const data = ((tableModule as { default?: unknown }).default ?? tableModule) as unknown as MaterialsData;

function seed(options: { fontScale?: number; ciaccona?: Record<string, unknown> } = {}) {
  const character = JSON.parse(configOptimizer.data.character);
  const carte = character.characters.Cartethyia;
  carte.characterLevel = "50+";
  carte.talents = { basic: "6", skill: "10", forte: "10", liberation: "8", intro: "10" };
  carte.weapons = { ...(carte.weapons ?? {}), [carte.weapon]: { ...(carte.weapons?.[carte.weapon] ?? {}), weaponLevel: "80" } };
  character.characters.Ciaccona = { weapon: "WoodlandAria", ...options.ciaccona };
  return {
    character,
    visit: {
      onBeforeLoad(win: Window) {
        win.sessionStorage.clear();
        win.localStorage.setItem("character", JSON.stringify(character));
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
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
    },
  };
}

const openDrawer = (key: string): void => {
  cy.get(`[data-test-account-card="${key}"]`, { timeout: 120000 }).click();
  // (Electron reports an animating top-layer dialog at opacity 0: assert it is open instead)
  cy.get("[data-test-account-drawer]").should("have.attr", "open");
  cy.get("[data-test-cost-total]", { timeout: 20000 }).should("exist");
};

describe("cost to max in the account drawer", () => {
  it("opens on the palette's link at that character's Cost to max, and closing takes the link off the address", () => {
    cy.viewport(412, 915);
    const { visit } = seed();
    cy.visit("/account?focus=Cartethyia&section=cost", visit);
    cy.get("[data-test-account-drawer]", { timeout: 120000 }).should("have.attr", "open");
    cy.get("[data-test-account-drawer] .dr__name").should("contain.text", "Cartethyia");
    cy.get("[data-test-cost-total]", { timeout: 20000 }).should("exist");
    cy.get("[data-test-cost-to-max]").should(($section) => {
      const top = $section[0]!.getBoundingClientRect().top;
      expect(top, "Cost to max on screen, not below the drawer's fold").to.be.within(0, 915 * 0.5);
    });
    cy.get("[data-test-account-drawer-close]").click({ force: true });
    cy.get("[data-test-account-drawer]").should("not.have.attr", "open");
    cy.location("search").should("eq", "");
    // the roster keeps scoring under it: nothing brings the drawer back
    cy.get("[data-test-account-card]", { timeout: 120000 }).should("have.length.at.least", 1);
    cy.get("[data-test-account-drawer]").should("not.have.attr", "open");
  });

  it("counts from the saved levels, says what was assumed, and from level 1 adds the inherent skills and stat bonuses", () => {
    cy.viewport(1440, 900);
    const { character, visit } = seed();
    const saved = savedProgressOf(character.characters.Cartethyia);
    const fromSaved = costToMax(data, "Cartethyia", saved, { from: "saved" })!;
    const fromScratch = costToMax(data, "Cartethyia", saved, { from: "scratch" })!;
    cy.visit("/account", visit);
    openDrawer("Cartethyia");

    cy.get("[data-test-cost-to-max] h3").should("have.text", "Cost to max");
    cy.get('[data-test-cost-from="saved"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-cost-to-max] .mat__intro").should("contain.text", "Defier's Thorn to level 90").and("not.contain.text", "stat bonuses");
    cy.get("[data-test-cost-total-credits]").should("have.text", `${count(fromSaved.total.credits)} Shell Credits`);
    cy.get('[data-test-cost-part="level"] summary').should("contain.text", "Level 50+ → 90").and("not.contain.text", "not saved");
    cy.get('[data-test-cost-part="forte"] summary').should("contain.text", "Forte 6 / 10 / 10 / 8 / 10 → 10").and("not.contain.text", "not saved");
    cy.get('[data-test-cost-part="weapon"] summary').should("contain.text", "Weapon 80 → 90");
    cy.get('[data-test-cost-part="extras"] summary').should("contain.text", "not in the total");
    // a part opens to its EXP, ascensions and materials
    cy.get('[data-test-cost-part="level"] summary').click();
    cy.get('[data-test-cost-part="level"]').should("have.attr", "open");
    cy.get('[data-test-cost-part="level"]').should("contain.text", "3 ascensions to go").and("contain.text", "resonator EXP").and("contain.text", "Premium Resonance Potion");

    cy.get('[data-test-cost-from="scratch"]').click();
    cy.get('[data-test-cost-from="scratch"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-cost-total-credits]").should("have.text", "4,460,260 Shell Credits");
    cy.get("[data-test-cost-to-max] .mat__intro").should("contain.text", "both inherent skills and all 8 stat bonuses");
    expect(fromScratch.total.credits).to.eq(4_460_260);
    cy.get("[data-test-cost-total]").should("contain.text", "122 × Premium Resonance Potion").and("contain.text", "135 × Premium Energy Core");
    cy.get('[data-test-cost-part="extras"] summary').should("contain.text", "630,000 Shell Credits").and("not.contain.text", "not in the total");
    cy.get("[data-test-cost-total-materials] li").should("have.length", fromScratch.total.materials.length);
    cy.get("[data-test-cost-to-max]").should("contain.text", "the game's own upgrade tables, version 3.7").and("not.contain.text", "encore");
  });

  it("with nothing saved it opens from level 1, and the saved view says the calculator counts it as maxed", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed().visit);
    openDrawer("Ciaccona");
    cy.get('[data-test-cost-from="scratch"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-cost-total-credits]").should("not.have.text", "0 Shell Credits");
    cy.get('[data-test-cost-from="saved"]').click();
    cy.get("[data-test-cost-assumed]").should("contain.text", "has not saved Ciaccona's level");
    cy.get("[data-test-cost-total]").should("contain.text", "Nothing left to pay");
    cy.get('[data-test-cost-part="level"] summary').should("contain.text", "not saved");
    cy.get('[data-test-cost-part="weapon"] summary').should("contain.text", "not saved");
  });

  it("the saved view's note names only what is really unsaved, and is gone when everything is saved at the top", () => {
    cy.viewport(1440, 900);
    const talents = { basic: "10", skill: "10", forte: "10", liberation: "10", intro: "10" };
    cy.visit("/account", seed({ ciaccona: { talents } }).visit);
    openDrawer("Ciaccona");
    cy.get('[data-test-cost-from="saved"]').click();
    cy.get("[data-test-cost-assumed]").should("contain.text", "has not saved Ciaccona's level or weapon level").and("not.contain.text", "Forte");
    cy.get('[data-test-cost-part="forte"] summary').should("not.contain.text", "not saved");

    cy.visit("/account", seed({ ciaccona: { talents, characterLevel: "90", weapons: { WoodlandAria: { weaponLevel: "90" } } } }).visit);
    openDrawer("Ciaccona");
    cy.get('[data-test-cost-from="saved"]').click();
    cy.get("[data-test-cost-total]").should("contain.text", "Nothing left to pay");
    cy.get("[data-test-cost-assumed]").should("not.exist");
  });

  it("tags Forte as partly saved when only some skills are, and names those as the other Forte levels", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed({ ciaccona: { talents: { intro: "10" } } }).visit);
    openDrawer("Ciaccona");
    cy.get('[data-test-cost-from="saved"]').click();
    cy.get('[data-test-cost-part="forte"] summary').should("contain.text", "partly saved");
    cy.get("[data-test-cost-assumed]").should("contain.text", "has not saved Ciaccona's level, other Forte levels or weapon level");
  });

  it("says so when the equipped weapon is one the table lacks, and counts no weapon cost", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed({ ciaccona: { weapon: "NotInTheTable" } }).visit);
    openDrawer("Ciaccona");
    cy.get("[data-test-cost-weapon-missing]").should("contain.text", "no entry for").and("contain.text", "no weapon cost is counted");
    cy.get('[data-test-cost-part="weapon"]').should("not.exist");
  });

  it("says to reload the page when the table cannot load", () => {
    cy.viewport(1440, 900);
    cy.intercept({ pathname: /\/materials(\.json|-[\w-]+\.js)$/ }, { statusCode: 503, body: "down" });
    cy.visit("/account", seed().visit);
    cy.get('[data-test-account-card="Cartethyia"]', { timeout: 120000 }).click();
    cy.get("[data-test-cost-loading]", { timeout: 20000 }).should("contain.text", "did not load").and("contain.text", "Reload the page");
    cy.get("[data-test-cost-total]").should("not.exist");
  });

  it("fits a 412 px phone at 130 % text: nothing past the edge, 40 px switch and rows", () => {
    cy.viewport(412, 915);
    cy.visit("/account", seed({ fontScale: 1.3 }).visit);
    openDrawer("Cartethyia");
    cy.get('[data-test-cost-from="scratch"]').click();
    cy.get("[data-test-cost-part]").each(($d) => {
      ($d[0] as HTMLDetailsElement).open = true;
    });
    cy.get("[data-test-cost-to-max]").scrollIntoView();
    cy.document().then((doc) => {
      const width = doc.documentElement.clientWidth;
      const over = [...doc.querySelectorAll("[data-test-cost-to-max] *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > width + 0.5;
        })
        .map((el) => `${el.className}:${Math.round(el.getBoundingClientRect().right)}`);
      expect(over, "elements past the right edge").to.deep.equal([]);
      // offsetHeight = layout px (Electron's page-enter scale skews getBoundingClientRect)
      doc.querySelectorAll<HTMLElement>("[data-test-cost-from], [data-test-cost-part] > summary").forEach((el) => {
        expect(el.offsetHeight, `${el.textContent?.trim().slice(0, 30)} tap height`).to.be.at.least(40);
      });
    });
  });
});
