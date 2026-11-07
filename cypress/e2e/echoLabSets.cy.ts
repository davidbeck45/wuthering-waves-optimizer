// Wuthering Tools+ Echo Lab "Set lab" (/echo-lab?tab=sets, v3 UI): every set layout on the echoes a character wears, only
// the labels changed. Your layout reads ±0, the list ranks best first, a condition is printed and so is the figure if it
// never holds, a layout the main echo can't carry says so, a pending team figure is worked out on request, the shape and
// main-echo filters, another character, the links to the optimizer's set filter and to Farm next, the palette, and the tab
// inside a phone at 412 and 360 px with 130 % text. Seeded through onBeforeLoad with the Echo Lab unit-test fixture (public
// data only: Cartethyia, Galbrena, Zani), the teammates of Cartethyia's wuwa_calc team presets armed with a weapon (no
// echoes) so a team is fieldable.
import * as fixtureModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

// Cypress's webpack hands JSON over as the module itself (no default export)
type Echo = Record<string, unknown> & { echoId: string };
type Account = { characters: Record<string, unknown>; echoes: Echo[]; equipped: Record<string, unknown> };
const fixture = ((fixtureModule as unknown as { default?: Account }).default ?? fixtureModule) as unknown as Account;

const RUN = { timeout: 90000 };
const TEAMMATES = { Ciaccona: "WoodlandAria", Chisa: "Kumokiri", Qiuyuan: "EmeraldSentence", Shorekeeper: "StellarSymphony", Phoebe: "LuminousHymn" };

function seed({ fontScale, active = "Galbrena", teammates = true, optimizerSets }: { fontScale?: number; active?: string; teammates?: boolean; optimizerSets?: string[] } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      const characters: Record<string, unknown> = { ...fixture.characters };
      if (teammates) for (const [id, weapon] of Object.entries(TEAMMATES)) characters[id] = { weapon };
      if (optimizerSets) characters[active] = { ...(characters[active] as object), optimizer: { echoSets: optimizerSets, mainEchoes: [] } };
      win.localStorage.setItem("character", JSON.stringify({ characters, activeCharacter: active }));
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

const pctOf = (text: string): number => {
  const m = /([+−±-])(\d+\.\d+)%/.exec(text);
  if (!m) throw new Error(`no percentage in "${text}"`);
  return (m[1] === "−" || m[1] === "-" ? -1 : 1) * Number(m[2]);
};

function expectInside(label: string): void {
  cy.document().then((doc) => {
    const width = doc.documentElement.clientWidth;
    expect(doc.documentElement.scrollWidth, `${label}: page width`).to.be.at.most(width);
    const past = [...doc.querySelectorAll<HTMLElement>("[data-test-echo-lab-sets] *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && el.children.length === 0 && r.right > width + 0.5;
    });
    expect(
      past.map((el) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`),
      `${label}: nothing past the right edge`,
    ).to.deep.equal([]);
  });
}

const rows = (): Cypress.Chainable<JQuery<HTMLElement>> => cy.get("[data-test-echo-lab-sets-row]", RUN);

describe("Echo Lab: Set lab", () => {
  it("reads your layout at zero, ranks the rest, and prints how every condition was counted", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=sets", seed({ teammates: false }));
    cy.get('[data-test-echo-lab-tab="sets"]', RUN).should("have.attr", "aria-selected", "true");
    cy.get("[data-test-echo-lab-sets-intro]").should("contain.text", "only the set changed");
    // the calculator's character is the one picked, and the address says so
    cy.get("[data-test-echo-lab-sets-character]", RUN).should("have.value", "Galbrena");
    rows().should("have.length", 12);
    cy.location("search").should("contain", "character=Galbrena");
    cy.get("[data-test-echo-lab-sets-meta]").invoke("text").should("match", /^[\d,]+ layouts scored, \d+ different results/);

    // no team to field here: the ranking is own gain, and each row says why there is no team figure
    cy.get('[data-test-echo-lab-sets-sort="team"]').should("not.exist");
    cy.get('[data-test-echo-lab-sets-sort="own"]').should("have.attr", "aria-pressed", "true");
    rows().first().find("[data-test-echo-lab-sets-team-note]").should("contain.text", "not in a team you can field");

    // best first
    cy.get("[data-test-echo-lab-sets-gain]").then(($gains) => {
      const gains = [...$gains].map((el) => pctOf(el.textContent ?? ""));
      expect(gains).to.deep.equal([...gains].sort((a, b) => b - a));
    });

    // your layout, wherever it ranks: ±0, no change in Energy Regen, and its switches are named as yours
    cy.get('[data-test-echo-lab-sets-shape="3+2"]').click();
    cy.get("[data-test-echo-lab-sets-yours]").closest("[data-test-echo-lab-sets-row]").as("yours");
    cy.get("@yours").find("[data-test-echo-lab-sets-gain]").should("have.text", "±0.00%");
    cy.get("@yours").find("[data-test-echo-lab-sets-er]").should("have.text", "no change");
    cy.get("@yours").find("[data-test-echo-lab-sets-assumption]").first().should("contain.text", "Your calculator's switch");
    cy.get('[data-test-echo-lab-sets-shape="all"]').click();

    // a conditional layout: assumed on for the whole rotation, the condition in the game's words, the figure if it never holds
    cy.get('[data-test-echo-lab-sets-shape="5"]').click();
    cy.get("[data-test-echo-lab-sets-assumption]").filter(':contains("Assumed: on for the whole rotation")').should("have.length.at.least", 1);
    cy.get("[data-test-echo-lab-sets-floor]").first().invoke("text").should("match", /If they never hold: [+−±]\d+\.\d\d% own damage/);

    // every row but yours is a 5-piece now, and each one your main echo can't carry says so with a real main echo beside it
    cy.get("[data-test-echo-lab-sets-row]").not(':has([data-test-echo-lab-sets-yours])').each(($row) => {
      expect($row.find("[data-test-echo-lab-sets-name]").text()).to.match(/ 5-piece/);
    });
    cy.get("[data-test-echo-lab-sets-main]").first().should("contain.text", "Needs another main echo").and("contain.text", "in its place");
    cy.get("[data-test-echo-lab-sets-keeps-main]").check();
    cy.get("[data-test-echo-lab-sets-main]").should("not.exist");
    cy.get("[data-test-echo-lab-sets-keeps-main]").uncheck();
    cy.get('[data-test-echo-lab-sets-shape="all"]').click();

    // ranking with no condition held reorders the list, and details name what the layout gives and needs
    cy.get('[data-test-echo-lab-sets-sort="floor"]').click();
    cy.get("[data-test-echo-lab-sets-best]").should("not.be.empty");
    rows().first().find("[data-test-echo-lab-sets-details]").click();
    rows().first().find("[data-test-echo-lab-sets-owned]").should("contain.text", "In your inventory");
    cy.get('[data-test-echo-lab-sets-sort="own"]').click();

    // more rows
    cy.get("[data-test-echo-lab-sets-more]").click();
    rows().should("have.length", 24);

    // another character: their own list, the address follows, and the ranking you chose stays
    cy.get('[data-test-echo-lab-sets-sort="floor"]').click();
    cy.get("[data-test-echo-lab-sets-character]").select("Zani");
    cy.location("search").should("contain", "character=Zani");
    cy.get("[data-test-echo-lab-sets-best]", RUN).should("not.be.empty");
    rows().should("have.length", 12);
    cy.get("[data-test-echo-lab-sets-answer]").should("contain.text", "Eternal Radiance 5-piece");
    cy.get('[data-test-echo-lab-sets-sort="floor"]').should("have.attr", "aria-pressed", "true");

    // back to a character already worked out: straight from the cache, no run started
    cy.get("[data-test-echo-lab-sets-character]").select("Galbrena");
    cy.get("[data-test-echo-lab-sets-progress]").should("not.exist");
    cy.get("[data-test-echo-lab-sets-answer]").should("contain.text", "Flamewing's Shadow 3-piece");
  });

  it("works out team figures on request, and ranks by them", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=sets&character=Cartethyia", seed({ active: "Cartethyia" }));
    cy.get('[data-test-echo-lab-sets-sort="team"]', RUN).should("have.attr", "aria-pressed", "true");
    rows();
    // exact figures first, your layout among them at zero
    cy.get("[data-test-echo-lab-sets-yours]").closest("[data-test-echo-lab-sets-row]").find("[data-test-echo-lab-sets-team-gain]").should("have.text", "±0.00%");
    cy.get("[data-test-echo-lab-sets-team-gain]").then(($gains) => {
      const gains = [...$gains].map((el) => pctOf(el.textContent ?? ""));
      expect(gains).to.deep.equal([...gains].sort((a, b) => b - a));
    });
    // the team by its one name: not its stored name, which carries the import's tiers and engine
    cy.get("[data-test-echo-lab-sets-answer]").should("contain.text", "Team: Cartethyia · ").and("not.contain.text", "(wuwa_calc)");
    // the rank counts only the rows with a figure until they are all in
    cy.get("[data-test-echo-lab-sets-rank]").invoke("text").should("match", /ranks \d+ of the \d+ with a team figure so far, \d+ still to work out|first so far, \d+ still to work out/);
    // what is left has its button, and the figure arrives in place
    cy.get("[data-test-echo-lab-sets-more]").click();
    cy.get("[data-test-echo-lab-sets-divider]").should("contain.text", "Without a team figure yet");
    cy.get("[data-test-echo-lab-sets-team-run]").first().then(($btn) => {
      const key = $btn.attr("data-test-echo-lab-sets-team-run") as string;
      cy.wrap($btn).click();
      cy.get(`[data-test-echo-lab-sets-row="${key}"]`, RUN).find("[data-test-echo-lab-sets-team-gain]", RUN).invoke("text").should("match", /^[+−±]\d+\.\d\d%$/);
    });
  });

  it("links a layout to the optimizer's set filter, and your own layout to Farm next", () => {
    cy.viewport(1440, 900);
    // four sets already in the filter: a tap replaces them, it must not leave a stale one behind
    cy.visit("/echo-lab?tab=sets&character=Cartethyia", seed({ active: "Cartethyia", teammates: false, optimizerSets: ["FreezingFrost", "VoidThunder", "SierraGale", "MoltenRift"] }));
    rows();
    // your layout goes to Farm next, on this character
    cy.get('[data-test-echo-lab-sets-shape="5"]').click();
    cy.get("[data-test-echo-lab-sets-yours]").closest("[data-test-echo-lab-sets-row]").find("[data-test-echo-lab-sets-farm]").should("contain.text", "Farm next").click();
    cy.get('[data-test-echo-lab-tab="farm"]').should("have.attr", "aria-selected", "true");
    cy.get("[data-test-echo-lab-farm-character]", RUN).should("have.value", "Cartethyia");
    cy.get("[data-test-echo-lab-farm-row]", RUN).each(($row) => {
      expect($row.attr("data-test-echo-lab-farm-row")).to.match(/^Cartethyia\|/);
    });

    // any other layout replaces the optimizer's set filter with its sets and opens the optimizer on this character
    cy.get('[data-test-echo-lab-tab="sets"]').click();
    cy.get('[data-test-echo-lab-sets-shape="3+2"]').click();
    cy.get("[data-test-echo-lab-sets-optimizer]").first().then(($btn) => {
      const key = $btn.attr("data-test-echo-lab-sets-optimizer") as string;
      const sets = key.split("+").map((part) => part.split(":")[0]);
      // it asks first and names what it replaces; Cancel leaves the page and the filter alone
      cy.wrap($btn).click();
      cy.get(".confirm-dialog .modal-box").should("contain.text", "This replaces the filter saved there").and("contain.text", "Molten Rift");
      cy.get(".confirm-dialog .modal-action .btn").first().click();
      cy.get(".confirm-dialog .modal-box").should("not.exist");
      cy.location("pathname").should("eq", "/echo-lab");
      cy.window().then((win) => {
        const saved = JSON.parse(win.localStorage.getItem("character") ?? "{}").characters.Cartethyia.optimizer.echoSets;
        expect(saved).to.have.length(4);
      });
      cy.get(`[data-test-echo-lab-sets-optimizer="${key}"]`).click();
      cy.get(".confirm-dialog .modal-action .btn-primary").click();
      cy.location("pathname").should("eq", "/");
      // what the optimizer itself shows: those sets on, and nothing else
      cy.get("[data-test-optimizer-workspace-echo-sets]", RUN).should("be.visible");
      cy.get("[data-test-optimizer-workspace-echo-set].border-primary").then(($on) => {
        expect([...$on].map((el) => el.getAttribute("data-test-optimizer-workspace-echo-set")).sort()).to.deep.equal([...sets].sort());
      });
    });
  });

  it("never filters the optimizer to a set you own none of, and says when one set of a layout is missing", () => {
    const sonataOf = (key: string): string[] => key.split("+").map((part) => part.split(":")[0]!);
    const owned = new Set(fixture.echoes.map((e) => e.echoSet as string));
    const has = (key: string): boolean[] => sonataOf(key).map((set) => owned.has(set));
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=sets&character=Cartethyia", seed({ active: "Cartethyia", teammates: false, optimizerSets: ["MoltenRift"] }));
    rows();
    cy.get("[data-test-echo-lab-sets-more]").click();
    // nothing to build from: the row goes to Farm next and says why, so the saved filter is never swapped for an empty one
    cy.get("[data-test-echo-lab-sets-row]").then(($rows) => {
      const keys = [...$rows].map((row) => row.getAttribute("data-test-echo-lab-sets-row") as string).filter((key) => key !== "none");
      const none = keys.find((key) => has(key).every((h) => !h));
      expect(none, "a layout of sets this account owns none of").to.be.a("string");
      cy.get(`[data-test-echo-lab-sets-row="${none}"]`).as("none");
      cy.get("@none").find("[data-test-echo-lab-sets-optimizer]").should("not.exist");
      cy.get("@none").find("[data-test-echo-lab-sets-farm]").should("contain.text", "Farm next");
      cy.get("@none").find("[data-test-echo-lab-sets-unowned]").should("contain.text", "You own none");
      // a layout with one set missing still filters, and the confirm says what the optimizer can't use
      const half = keys.find((key) => has(key).some((h) => h) && has(key).some((h) => !h));
      expect(half, "a layout with one set owned and one not").to.be.a("string");
      cy.get(`[data-test-echo-lab-sets-optimizer="${half}"]`).click();
      cy.get(".confirm-dialog .modal-box").should("contain.text", "You own no").and("contain.text", "This replaces the filter saved there");
    });
  });

  it("stops on Cancel, starts again, and leaves no old state over the next character", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=verdicts", seed({ teammates: false }));
    cy.get('[data-test-echo-lab-tab="sets"]', RUN).click();
    cy.get("[data-test-echo-lab-sets-cancel]", RUN).click();
    cy.get("[data-test-echo-lab-sets-cancelled]", RUN).should("contain.text", "Cancelled");
    cy.get("[data-test-echo-lab-sets-cancelled] button").click();
    rows().should("have.length", 12);
    cy.get("[data-test-echo-lab-sets-cancelled]").should("not.exist");
    cy.get("[data-test-echo-lab-sets-character]").select("Zani");
    cy.get("[data-test-echo-lab-sets-best]", RUN).should("not.be.empty");
    cy.get("[data-test-echo-lab-sets-error]").should("not.exist");
  });

  it("says so when the link's character can't be shown, until you pick someone", () => {
    cy.viewport(1440, 900);
    // armed with a weapon, no echoes: not a built character
    cy.visit("/echo-lab?tab=sets&character=Chisa", seed());
    cy.get("[data-test-echo-lab-sets-character]", RUN).should("have.value", "Galbrena");
    cy.get("[data-test-echo-lab-left-out]").should("contain.text", "Chisa can't be shown here").and("contain.text", "Showing Galbrena instead");
    rows().should("have.length.at.least", 1);
    // the Re-roll tab moves on the same way, so it carries the same note
    cy.get('[data-test-echo-lab-tab="reroll"]').click();
    cy.get("[data-test-echo-lab-left-out]").should("contain.text", "Chisa can't be shown here");
    cy.get('[data-test-echo-lab-tab="sets"]').click();
    cy.get("[data-test-echo-lab-sets-character]", RUN).select("Zani");
    cy.get("[data-test-echo-lab-left-out]").should("not.exist");
  });

  it("is in the palette", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab", seed({ teammates: false }));
    cy.get('[data-test-echo-lab-tab="verdicts"]', RUN).should("have.attr", "aria-selected", "true");
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-input]").type("which set");
    cy.contains("[data-test-palette-item]", "Which set is best for this character?").click();
    cy.get('[data-test-echo-lab-tab="sets"]', RUN).should("have.attr", "aria-selected", "true");
    cy.get("[data-test-echo-lab-sets-character]", RUN).should("have.value", "Galbrena");
  });

  for (const width of [412, 360]) {
    it(`stays inside a ${width} px phone at 130 % text`, () => {
      cy.viewport(width, 915);
      cy.visit("/echo-lab?tab=sets&character=Cartethyia", seed({ fontScale: 1.3, active: "Cartethyia" }));
      rows();
      expectInside("list");
      // the block that says what a row assumed keeps the game's whole sentence: a phone cut it after two lines
      cy.get("[data-test-echo-lab-sets-assumption] .block").should("have.length.at.least", 1).each(($text) => {
        expect($text[0]!.scrollHeight, $text.text().slice(0, 40)).to.be.at.most($text[0]!.clientHeight + 1);
      });
      // a layout's name has the card's width, not what its icons leave (it ran to five lines beside them at 360 px)
      cy.get("[data-test-echo-lab-sets-name]").first().then(($name) => {
        const card = $name[0].closest("[data-test-echo-lab-sets-row]")!.getBoundingClientRect();
        expect($name[0].getBoundingClientRect().width, "name width").to.be.greaterThan(card.width * 0.8);
      });
      cy.get("[data-test-echo-lab-sets-details]").first().click();
      expectInside("details open");
      cy.get('[data-test-echo-lab-sets-shape="5"]').click();
      expectInside("5-piece filter");
      cy.get("[data-test-echo-lab-sets-character]").select("Galbrena");
      cy.get("[data-test-echo-lab-sets-best]", RUN).should("not.be.empty");
      rows();
      expectInside("another character");
      // the tab strip keeps all seven tabs on the page
      cy.get("[data-test-echo-lab-tab]").should("have.length", 7).each(($tab) => {
        expect($tab[0].getBoundingClientRect().right, $tab.text()).to.be.at.most(width);
      });
    });
  }
});
