// Wuthering Tools+: "What each level is worth" in the /account character drawer (src/sim/levels/LevelsWorth.vue) —
// what every level-up a character has left adds to damage on their build and what it costs, as a list (each track to
// its top) and as the order to take them in, in the v3 UI. Seeds the Cartethyia optimizer account with saved progress
// (level 50+, two Forte skills below 10, Defier's Thorn at 80), two armed teammates with nothing saved (so a team can
// be fielded) and a character with no weapon. Costs are read against the same pure functions the drawer uses.
import { configOptimizer } from "./calculator/data/Cartethyia/data";
import * as tableModule from "../../src/sim/materials/data/materials.json";
import { count, savedProgressOf, type MaterialsData } from "../../src/sim/materials/costToMax";
import { forteGateMaterial, levelsToday, stepsLeft, sumCosts, trackToTop, TRACKS } from "../../src/sim/levels/levelSteps";
import { costText } from "../../src/sim/levels/levelsView";

// (webpack hands a JSON module over as the namespace; vite as `default`)
const data = ((tableModule as { default?: unknown }).default ?? tableModule) as unknown as MaterialsData;

function seed(options: { fontScale?: number; extra?: Record<string, unknown> } = {}) {
  const character = JSON.parse(configOptimizer.data.character);
  const carte = character.characters.Cartethyia;
  carte.characterLevel = "50+";
  carte.talents = { basic: "6", skill: "10", forte: "10", liberation: "8", intro: "10" };
  carte.weapons = { ...(carte.weapons ?? {}), [carte.weapon]: { ...(carte.weapons?.[carte.weapon] ?? {}), weaponLevel: "80" } };
  // her two teammates in a wuwa_calc team preset, armed and nothing saved; and someone with no weapon
  character.characters.Ciaccona = { weapon: "WoodlandAria" };
  character.characters.Chisa = { weapon: "Kumokiri" };
  character.characters.Jiyan = { characterLevel: "40", talents: { basic: "2" } };
  Object.assign(character.characters, options.extra ?? {});
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

/** the section scores once it is on screen */
const openSection = (key: string): void => {
  cy.get(`[data-test-account-card="${key}"]`, { timeout: 120000 }).click();
  // (Electron reports an animating top-layer dialog at opacity 0: assert it is open instead)
  cy.get("[data-test-account-drawer]").should("have.attr", "open");
  cy.get("[data-test-levels-worth]").scrollIntoView();
  cy.get("[data-test-levels-rows], [data-test-levels-done]", { timeout: 60000 }).should("exist");
};

const percent = (text: string): number => Number(/([+-][\d.,]+)%/.exec(text)![1]!.replace(/,/g, ""));

describe("what each level is worth, in the account drawer", () => {
  it("lists what is left from the saved levels with a gain and a cost each, then the order to take them in", () => {
    cy.viewport(1440, 900);
    const { character, visit } = seed();
    const today = levelsToday(data, savedProgressOf(character.characters.Cartethyia));
    const whole = (track: (typeof TRACKS)[number]["key"]) => trackToTop(data, "Cartethyia", today, today.state, track)!;
    cy.visit("/account", visit);
    openSection("Cartethyia");

    cy.get("[data-test-levels-worth] h3").should("have.text", "What each level is worth");
    cy.get("[data-test-levels-intro]").should("contain.text", "What each level-up still open adds to damage on Cartethyia's build, and what it costs.");
    cy.get('[data-test-levels-from="saved"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-levels-assumed]").should("not.exist"); // everything is saved
    // one line per track with something left: the two Forte skills saved below 10, not the three at 10
    cy.get("[data-test-levels-row]").should("have.length", 4);
    cy.get('[data-test-levels-row="level"]').should("contain.text", "Level 50+ → 90").and("contain.text", costText(whole("level").cost));
    cy.get('[data-test-levels-row="weapon"]').should("contain.text", "Weapon level 80 → 90").and("contain.text", costText(whole("weapon").cost));
    cy.get('[data-test-levels-row="basic"]').should("contain.text", "Normal Attack 6 → 10").and("contain.text", "250,000 Shell Credits");
    cy.get('[data-test-levels-row="liberation"]').should("contain.text", "Resonance Liberation 8 → 10").and("contain.text", "170,000 Shell Credits");
    cy.get('[data-test-levels-row="skill"]').should("not.exist");
    // every percent says what it is a percent of, and what own and team are measured on
    cy.get("[data-test-levels-basis]").should("contain.text", "Own = Cartethyia's average damage per rotation on their best rotation").and("contain.text", "Team = the damage of").and("contain.text", "Enemy level 100, 20 % RES.");
    cy.get('[data-test-levels-row="level"] .lw-gain').should("have.length", 2);
    cy.get('[data-test-levels-row="level"] .lw-gain').first().should("contain.text", "team");
    cy.get('[data-test-levels-row="level"] .lw-gain').last().should("contain.text", "own");
    // the biggest team gain first, and all of it together more than any one line
    cy.get("[data-test-levels-row] .lw-gain:first-child b").then(($gains) => {
      const gains = [...$gains].map((el) => percent(el.textContent ?? ""));
      expect(gains, "team gains, best first").to.deep.equal([...gains].sort((a, b) => b - a));
      expect(gains[0]).to.be.greaterThan(0);
      cy.get("[data-test-levels-everything]").should(($all) => {
        expect(percent($all.text()), "everything together").to.be.greaterThan(gains[0]!);
      });
    });
    const everything = sumCosts(data, TRACKS.map((t) => trackToTop(data, "Cartethyia", today, today.state, t.key)).filter((s) => s !== null).map((s) => s!.cost));
    cy.get("[data-test-levels-everything]").should("contain.text", `${count(everything.credits)} Shell Credits`);
    // a line opens to its materials
    cy.get('[data-test-levels-row="level"] details').should("not.have.attr", "open");
    cy.get('[data-test-levels-row="level"] summary').click();
    cy.get('[data-test-levels-row="level"] details').should("have.attr", "open");
    cy.get('[data-test-levels-row="level"] .lw-chip').should("have.length", whole("level").cost.materials.length);
    cy.get("[data-test-levels-source]").should("contain.text", "the two inherent skills and the eight stat bonuses").and("contain.text", `version ${data.gameVersion}`).and("not.contain.text", "encore");

    // the other view: the order, one step at a time, with a running gain and bill
    cy.get('[data-test-levels-view="path"]').click();
    cy.get('[data-test-levels-view="path"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-levels-path-how]").should("contain.text", "adds the most team damage for its Shell Credits").and("contain.text", "level-ups multiply each other");
    cy.get("[data-test-levels-path-headline]", { timeout: 60000 }).should(($h) => {
      expect($h.text()).to.match(/^The first 3 steps give \+[\d.,]+% team damage for [\d,]+ Shell Credits\.$/);
    });
    // 4 level caps (50+ → 60 → 70 → 80 → 90) + 1 weapon cap + 4 Normal Attack levels + 2 Resonance Liberation levels,
    // less any track the rotation never uses
    expect(stepsLeft(today, today.state)).to.eq(11);
    cy.get("[data-test-levels-step]").then(($steps) => {
      const left = Cypress.$("[data-test-levels-path-inert]").length > 0;
      if (!left) expect($steps.length).to.eq(11);
      else expect($steps.length).to.be.within(1, 10);
      const running = [...$steps].map((el) => Number(/for ([\d,]+) Shell Credits/.exec(el.querySelector(".lw-step__run")!.textContent ?? "")![1]!.replace(/,/g, "")));
      expect(running, "the bill only grows").to.deep.equal([...running].sort((a, b) => a - b));
      if (!left) expect(running.at(-1), "the last running bill is everything's").to.eq(everything.credits);
      expect($steps[0]!.querySelector(".lw-step__n")!.textContent, "numbered from 1").to.eq("1");
      expect($steps[0]!.querySelector(".lw-gain")!.textContent, "each step says what its percent is of").to.match(/^\+[\d.,<]+%\s*team$/);
    });
    // the price is Shell Credits only: the Forte steps from level 7 up say they also take the material those levels need
    // (Normal Attack 7 to 10 and Resonance Liberation 9 and 10 here), and one line under the order says it is not weighed
    cy.get("[data-test-levels-step-gate]").each(($g) => expect($g.text()).to.eq(`1 × ${forteGateMaterial(data, "Cartethyia")!.name}`));
    cy.get("[data-test-levels-step-gate]").then(($g) => {
      cy.get("[data-test-levels-path-gate]")
        .should("contain.text", "The order prices each step in Shell Credits only.")
        .and("contain.text", `${$g.length} of its`)
        .and("contain.text", `also take ${forteGateMaterial(data, "Cartethyia")!.name} (${$g.length} in all, said beside each), which it does not weigh`);
    });
    // one tap for the other order: the biggest gain first. The same steps, the same end
    cy.get("[data-test-levels-step]").then(($steps) => {
      const end = $steps.last().find(".lw-step__run").text();
      const firstByValue = percent($steps.first().find(".lw-gain b").text());
      const count = $steps.length;
      cy.get("[data-test-levels-path-order]").should("contain.text", "Order by the biggest gain instead").click();
      cy.get("[data-test-levels-path-how]", { timeout: 60000 }).should("contain.text", "adds the most team damage at that point").and("not.contain.text", "for its Shell Credits");
      cy.get("[data-test-levels-path-order]").should("contain.text", "Order by gain per Shell Credit instead");
      cy.get("[data-test-levels-path-headline]", { timeout: 60000 }).should("exist");
      cy.get("[data-test-levels-step]").should("have.length", count);
      cy.get("[data-test-levels-step]").last().find(".lw-step__run").should("have.text", end);
      // both orders choose their first step among the same next steps: by the biggest gain it gains at least as much
      cy.get("[data-test-levels-step]").first().find(".lw-gain b").should(($first) => {
        expect(percent($first.text()), "the first step by the biggest gain").to.be.at.least(firstByValue);
      });
      cy.get("[data-test-levels-path-order]").click();
      cy.get("[data-test-levels-path-how]", { timeout: 60000 }).should("contain.text", "for its Shell Credits");
      cy.get("[data-test-levels-path-headline]", { timeout: 60000 }).should("exist");
    });
    cy.get('[data-test-levels-view="list"]').click();
    cy.get("[data-test-levels-row]").should("have.length", 4);

    // from level 1: every track, counted for a new copy
    cy.get('[data-test-levels-from="scratch"]').click();
    cy.get('[data-test-levels-from="scratch"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-levels-intro]").should("contain.text", "counted from a new Cartethyia at level 1 with Defier's Thorn at level 1");
    cy.get("[data-test-levels-row]", { timeout: 60000 }).should("have.length", 7);
    cy.get('[data-test-levels-row="skill"]').should("contain.text", "Resonance Skill 1 → 10").and("contain.text", "280,000 Shell Credits");
    cy.get("[data-test-levels-everything]").should("contain.text", `${count(4_460_260 - 630_000)} Shell Credits`); // Cost to max from level 1, less the inherent skills and stat bonuses
  });

  it("with nothing saved it opens from level 1, and the saved view says the calculator counts everything at the top", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed().visit);
    openSection("Ciaccona");
    cy.get('[data-test-levels-from="scratch"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-levels-row]").should("have.length", 7);
    cy.get('[data-test-levels-from="saved"]').click();
    cy.get("[data-test-levels-done]").should("contain.text", "Nothing left to level").and("contain.text", "Level 90 · weapon level 90 · all five Forte skills at 10.");
    cy.get("[data-test-levels-assumed]").should("contain.text", "has not saved Ciaccona's level, weapon level or Forte levels").and("contain.text", "counts them at the top");
    cy.get("[data-test-levels-row]").should("not.exist");
    cy.get("[data-test-levels-view]").should("not.exist");
    // the way to the place where levels are set
    cy.get("[data-test-levels-set]").click();
    cy.location("pathname").should("eq", "/");
  });

  it("Other levels: a what-if from where the character stands in game, and nothing is saved", () => {
    cy.viewport(1440, 900);
    const { character, visit } = seed();
    cy.visit("/account", visit);
    openSection("Ciaccona");
    cy.get('[data-test-levels-from="custom"]').click();
    cy.get('[data-test-levels-from="custom"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-levels-intro]").should("contain.text", "counted from the levels you set here");
    cy.get("[data-test-levels-try]").should("contain.text", "This is a what-if: nothing here is saved");
    // it opens on what the calculator counts (the top, nothing being saved): nothing left until a level is lowered
    cy.get('[data-test-levels-try-field="level"]').should("have.value", "90");
    cy.get('[data-test-levels-try-field="weapon"]').should("have.value", "90");
    cy.get('[data-test-levels-try-field="liberation"]').should("have.value", "10");
    cy.get("[data-test-levels-done]").should("contain.text", "Nothing left to level");
    cy.get('[data-test-levels-try-field="liberation"]').select("6");
    cy.get('[data-test-levels-try-field="level"]').select("80");
    cy.get("[data-test-levels-row]", { timeout: 60000 }).should("have.length", 2);
    cy.get('[data-test-levels-row="liberation"]').should("contain.text", "Resonance Liberation 6 → 10").and("contain.text", "250,000 Shell Credits");
    cy.get('[data-test-levels-row="level"]').should("contain.text", "Level 80 → 90").and("contain.text", "39 × Premium Resonance Potion · 1 ascension");
    cy.get("[data-test-levels-row] .lw-gain").should("have.length.at.least", 2);
    cy.get('[data-test-levels-view="path"]').click();
    cy.get("[data-test-levels-step]", { timeout: 60000 }).should("have.length", 5); // one level cap, four Resonance Liberation levels
    cy.get("[data-test-levels-path-blind]").should("contain.text", "It does not know what the game unlocks when");
    // the calculator's data is as it was: the what-if wrote nothing
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem("character")!).characters.Ciaccona).to.deep.equal(character.characters.Ciaccona);
      expect(Object.keys(win.localStorage).filter((k) => /level/i.test(k)), "no storage key of its own").to.deep.equal([]);
    });
    // closing and opening the drawer again on the same character keeps the levels tried, for this visit
    cy.get("[data-test-account-drawer-close]").click({ force: true });
    cy.get("[data-test-account-drawer]").should("not.have.attr", "open");
    openSection("Ciaccona");
    cy.get('[data-test-levels-from="custom"]').click();
    cy.get('[data-test-levels-try-field="liberation"]').should("have.value", "6");
    cy.get('[data-test-levels-try-field="level"]').should("have.value", "80");
    cy.get("[data-test-levels-row]", { timeout: 60000 }).should("have.length", 2);
  });

  it("no weapon: says what is missing and shows the steps with their costs only", () => {
    cy.viewport(1440, 900);
    const { character, visit } = seed();
    cy.visit("/account?focus=Jiyan&section=levels", visit);
    cy.get("[data-test-account-drawer]", { timeout: 120000 }).should("have.attr", "open");
    cy.get("[data-test-levels-rows]", { timeout: 60000 }).should("exist");
    cy.get('[data-test-levels-from="saved"]').should("have.attr", "aria-pressed", "true"); // level 40 is saved
    cy.get("[data-test-levels-nogain]").should("contain.text", "No damage figures: Jiyan has no weapon equipped, so nothing can be scored yet. The steps below show what they cost.");
    const today = levelsToday(data, savedProgressOf(character.characters.Jiyan));
    cy.get("[data-test-levels-row]").should("have.length", 2);
    cy.get('[data-test-levels-row="level"]').should("contain.text", "Level 40 → 90").and("contain.text", costText(trackToTop(data, "Jiyan", today, today.state, "level")!.cost));
    cy.get('[data-test-levels-row="basic"]').should("contain.text", "Normal Attack 2 → 10");
    cy.get("[data-test-levels-row] .lw-gain").should("not.exist");
    cy.get("[data-test-levels-view]").should("not.exist"); // no order without figures
    cy.get("[data-test-levels-no-weapon]").should("contain.text", "No weapon equipped, so there is no weapon level here.");
    cy.get("[data-test-levels-assumed]").should("contain.text", "has not saved Jiyan's Resonance Skill, Forte Circuit, Resonance Liberation and Intro Skill levels");
  });

  it("says to reload the page when the cost table cannot load, and scores nothing", () => {
    cy.viewport(1440, 900);
    cy.intercept({ pathname: /\/materials(\.json|-[\w-]+\.js)$/ }, { statusCode: 503, body: "down" });
    cy.visit("/account?focus=Cartethyia&section=levels", seed().visit);
    cy.get("[data-test-account-drawer]", { timeout: 120000 }).should("have.attr", "open");
    cy.get("[data-test-levels-loading]", { timeout: 20000 }).should("contain.text", "The cost table did not load. Reload the page to try again.");
    cy.get("[data-test-levels-rows]").should("not.exist");
  });

  it("opens on the palette's link at this section and fits a 412 px phone at 130 % text: nothing past the edge, 40 px controls", () => {
    cy.viewport(412, 915);
    cy.visit("/account?focus=Cartethyia&section=levels", seed({ fontScale: 1.3 }).visit);
    cy.get("[data-test-account-drawer]", { timeout: 120000 }).should("have.attr", "open");
    cy.get("[data-test-levels-rows]", { timeout: 60000 }).should("exist");
    cy.get("[data-test-levels-worth]").should(($section) => {
      expect($section[0]!.getBoundingClientRect().top, "the section on screen, not below the drawer's fold").to.be.within(0, 915 * 0.5);
    });
    const fits = (): void => {
      cy.document().then((doc) => {
        const width = doc.documentElement.clientWidth;
        const over = [...doc.querySelectorAll("[data-test-levels-worth] *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > width + 0.5;
          })
          .map((el) => `${el.className}:${Math.round(el.getBoundingClientRect().right)}`);
        expect(over, "elements past the right edge").to.deep.equal([]);
        // offsetHeight = layout px (Electron's page-enter scale skews getBoundingClientRect)
        doc.querySelectorAll<HTMLElement>("[data-test-levels-from], [data-test-levels-view], [data-test-levels-row] summary, [data-test-levels-path-more], [data-test-levels-path-order], [data-test-levels-try-field]").forEach((el) => {
          expect(el.offsetHeight, `${el.textContent?.trim().slice(0, 30)} tap height`).to.be.at.least(40);
        });
      });
    };
    fits();
    cy.get('[data-test-levels-view="path"]').click({ force: true });
    cy.get("[data-test-levels-path-headline]", { timeout: 60000 }).should("exist");
    fits();
    cy.get('[data-test-levels-from="scratch"]').click({ force: true });
    cy.get("[data-test-levels-path-more]", { timeout: 60000 }).should("contain.text", "Show all 59 steps");
    cy.get("[data-test-levels-step]").should("have.length", 12);
    cy.get("[data-test-levels-path-more]").click({ force: true });
    cy.get("[data-test-levels-step]").should("have.length", 59);
    cy.get("[data-test-levels-path-more]").should("have.attr", "aria-expanded", "true");
    fits();
    // the what-if's seven pickers, two to a row
    cy.get('[data-test-levels-from="custom"]').click({ force: true });
    cy.get("[data-test-levels-try-field]").should("have.length", 7);
    fits();
    // closing takes the link off the address, as Cost to max's does
    cy.get("[data-test-account-drawer-close]").click({ force: true });
    cy.get("[data-test-account-drawer]").should("not.have.attr", "open");
    cy.location("search").should("eq", "");
  });
});
