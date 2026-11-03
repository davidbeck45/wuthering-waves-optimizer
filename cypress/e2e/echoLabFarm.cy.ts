// Wuthering Tools+ Echo Lab "Farm next" (/echo-lab?tab=farm, v3 UI): one ranked list of the echo to farm for every
// slot of every five-echo build — team gain first, then the slots without a team figure, a pending team figure worked
// out on request, the character filter, the own-gain order, a row's details (other main stats), kept after a reload —
// and the tab inside a phone at 412 and 360 px with 130 % text. Seeded through onBeforeLoad with the Echo Lab unit-test
// fixture (public data only: Cartethyia, Galbrena, Zani), the teammates of three wuwa_calc team presets armed with a
// weapon (no echoes) so those teams are fieldable, and Cartethyia's last echo stripped to one flat DEF line so a new
// echo there is the clear first pick.
import * as fixtureModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

// Cypress's webpack hands JSON over as the module itself (no default export)
type Echo = Record<string, unknown> & { echoId: string };
type Account = { characters: Record<string, unknown>; echoes: Echo[]; equipped: Record<string, unknown> };
const fixture = ((fixtureModule as unknown as { default?: Account }).default ?? fixtureModule) as unknown as Account;

const RUN = { timeout: 90000 };
const TEAMMATES = { Ciaccona: "WoodlandAria", Chisa: "Kumokiri", Qiuyuan: "EmeraldSentence", Shorekeeper: "StellarSymphony", Phoebe: "LuminousHymn" };

function account(): Account {
  const characters: Record<string, unknown> = { ...fixture.characters };
  for (const [id, weapon] of Object.entries(TEAMMATES)) characters[id] = { weapon };
  const echoes = fixture.echoes.map((e) => {
    if (e.echoId !== "bk6b3jp0d4") return e;
    const weak: Echo = { ...e, echoSubStatsType1: "DEF_FLAT", echoSubStatsValue1: 40 };
    for (const n of [2, 3, 4, 5]) Object.assign(weak, { [`echoSubStatsType${n}`]: null, [`echoSubStatsValue${n}`]: null });
    return weak;
  });
  return { characters, echoes, equipped: fixture.equipped };
}

function seed({ fontScale, keepSession = false }: { fontScale?: number; keepSession?: boolean } = {}) {
  return {
    onBeforeLoad(win: Window) {
      if (!keepSession) win.sessionStorage.clear();
      const a = account();
      win.localStorage.setItem("character", JSON.stringify({ characters: a.characters, activeCharacter: "Cartethyia" }));
      win.localStorage.setItem("inventory", JSON.stringify({ echoes: a.echoes, equipped: a.equipped, echoPresets: [], equippedPresets: {} }));
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
  const m = /([+−-])(\d+\.\d+)%/.exec(text);
  if (!m) throw new Error(`no percentage in "${text}"`);
  return (m[1] === "+" ? 1 : -1) * Number(m[2]);
};

function expectInside(label: string): void {
  cy.document().then((doc) => {
    const width = doc.documentElement.clientWidth;
    expect(doc.documentElement.scrollWidth, `${label}: page width`).to.be.at.most(width);
    const past = [...doc.querySelectorAll<HTMLElement>("[data-test-echo-lab-farm] *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && el.children.length === 0 && r.right > width + 0.5;
    });
    expect(
      past.map((el) => `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}"`),
      `${label}: nothing past the right edge`,
    ).to.deep.equal([]);
  });
}

describe("Echo Lab: Farm next", () => {
  it("ranks every slot by team gain, works out a pending team figure, filters, re-orders and keeps it after a reload", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=farm", seed());
    cy.get('[data-test-echo-lab-tab="farm"]', RUN).should("have.attr", "aria-selected", "true");
    cy.get("[data-test-echo-lab-farm-intro]").should("contain.text", "levelled to +25");
    cy.get("[data-test-echo-lab-farm-odds]").should("contain.text", "drop odds are not modelled");
    cy.get("[data-test-echo-lab-farm-row]", RUN).should("have.length", 12);
    cy.get("[data-test-echo-lab-farm-try]").should("contain.text", "50 Tuners");
    cy.get('[data-test-echo-lab-tab="farm"]').should("contain.text", "15");

    // the stripped echo is the first pick, with an exact team figure, its own gain, odds and cost
    cy.get("[data-test-echo-lab-farm-row]").first().as("first");
    cy.get("@first").should("have.attr", "data-test-echo-lab-farm-row", "Cartethyia|4");
    cy.get("@first").find("[data-test-echo-lab-farm-first]").should("contain.text", "Farm first");
    cy.get("@first").find("[data-test-echo-lab-farm-main]").invoke("text").should("match", /^Cost 1 · (HP|ATK|DEF) %$/);
    cy.get("@first").find("[data-test-echo-lab-farm-set]").should("contain.text", "Windward Pilgrimage");
    cy.get("@first").find("[data-test-echo-lab-farm-team-gain]").invoke("text").should("match", /^\+\d+\.\d\d%$/);
    cy.get("@first").find("[data-test-echo-lab-farm-gain]").invoke("text").should("match", /^\+\d+\.\d\d%$/);
    cy.get("@first").find("[data-test-echo-lab-farm-chance]").invoke("text").should("match", /^(\d+%|over 99%|100%)$/);
    cy.get("@first").find("[data-test-echo-lab-farm-cost]").invoke("text").should("match", /^\d+ Tuners$/);

    // team rows best first by team gain, then the divider and the rows without a team figure
    cy.get("[data-test-echo-lab-farm-team-gain]").then(($g) => {
      const gains = [...$g].map((el) => pctOf(el.textContent ?? ""));
      expect(gains.length).to.be.at.least(2);
      for (let i = 1; i < gains.length; i++) expect(gains[i - 1]).to.be.at.least(gains[i]);
    });
    cy.get("[data-test-echo-lab-farm-divider]").should("contain.text", "Without a team figure");

    // a pending team figure, on request: the row gets a figure and joins the ranked team rows above the divider
    cy.get("[data-test-echo-lab-farm-more]").click();
    cy.get("[data-test-echo-lab-farm-row]").should("have.length", 15);
    cy.get("[data-test-echo-lab-farm-team-gain]").its("length").then((before) => {
      cy.get("[data-test-echo-lab-farm-team-run]").first().invoke("attr", "data-test-echo-lab-farm-team-run").then((key) => {
        cy.get(`[data-test-echo-lab-farm-team-run="${key}"]`).click();
        cy.get(`[data-test-echo-lab-farm-row="${key}"] [data-test-echo-lab-farm-team-gain]`, RUN).invoke("text").should("match", /^[+±−]\d+\.\d\d%$/);
        cy.get("[data-test-echo-lab-farm-team-gain]").should("have.length", Number(before) + 1);
      });
    });

    // the character filter
    cy.get("[data-test-echo-lab-farm-character]").select("Zani");
    cy.get("[data-test-echo-lab-farm-row]").should("have.length", 5).each(($r) => expect($r.attr("data-test-echo-lab-farm-row")).to.match(/^Zani\|/));
    cy.get("[data-test-echo-lab-farm-character]").select("all");

    // by own gain: best first, team figures or not
    cy.get('[data-test-echo-lab-farm-sort="own"]').click().should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-echo-lab-farm-divider]").should("not.exist");
    cy.get("[data-test-echo-lab-farm-gain]").then(($g) => {
      const gains = [...$g].map((el) => pctOf(el.textContent ?? ""));
      for (let i = 1; i < gains.length; i++) expect(gains[i - 1]).to.be.at.least(gains[i]);
    });
    cy.get('[data-test-echo-lab-farm-sort="team"]').click();

    // a row's details: the spread, the main stat alone, the other main stats it could take
    cy.get('[data-test-echo-lab-farm-details="Cartethyia|4"]').should("have.attr", "aria-expanded", "false").click().should("have.attr", "aria-expanded", "true");
    cy.get('[data-test-echo-lab-farm-detail="Cartethyia|4"] [data-test-echo-lab-farm-spread]').should("contain.text", "1 try in 10").and("contain.text", "before any substat");
    cy.get('[data-test-echo-lab-farm-detail="Cartethyia|4"] [data-test-echo-lab-farm-alt]').should("have.length.at.least", 2);
    cy.get('[data-test-echo-lab-farm-detail="Cartethyia|4"] [data-test-echo-lab-farm-alt="ATK"]').should("contain.text", "before substats");

    // the (i) explains the model and closes with Escape
    cy.get('[data-test-echo-lab-info="farm"]').click();
    cy.get('[data-test-echo-lab-info-panel="farm"]').should("contain.text", "20,000 seeded tries");
    cy.get("body").type("{esc}");
    cy.get('[data-test-echo-lab-info-panel="farm"]').should("not.exist");

    // a reload of the same account: the list and the team figure asked for come back from this tab's cache
    cy.visit("/echo-lab?tab=farm", seed({ keepSession: true }));
    cy.get("[data-test-echo-lab-farm-row]", { timeout: 10000 }).should("have.length", 12);
    cy.get("[data-test-echo-lab-farm-progress]").should("not.exist");
    cy.get("[data-test-echo-lab-farm-more]").click();
    cy.get("[data-test-echo-lab-farm-team-run]").then(($b) => {
      // eight up front plus the one asked for
      cy.get("[data-test-echo-lab-farm-team-gain]").should("have.length", 15 - $b.length);
      expect(15 - $b.length).to.be.at.least(9);
    });
  });

  for (const width of [412, 360]) {
    it(`stays inside a ${width} px phone with 130 % text, details open`, () => {
      cy.viewport(width, 915);
      cy.visit("/echo-lab?tab=farm", seed({ fontScale: 1.3 }));
      cy.get("[data-test-echo-lab-farm-row]", RUN).should("have.length", 12);
      // six tabs, two a row
      cy.get("[data-test-echo-lab-tab]").should("have.length", 6);
      cy.get('[data-test-echo-lab-tab="farm"]').then(($t) => {
        const strip = $t[0].parentElement!.getBoundingClientRect();
        const w = $t[0].getBoundingClientRect().width;
        expect(w, "a tab is half the strip").to.be.within(strip.width * 0.4, strip.width * 0.55);
      });
      // one stat a line: the caption on the left, the number on the right
      cy.get("[data-test-echo-lab-farm-row]").first().find("[data-test-echo-lab-farm-gain]").then(($n) => {
        const card = $n[0].closest("[data-test-echo-lab-farm-row]")!.getBoundingClientRect();
        expect($n[0].getBoundingClientRect().right).to.be.closeTo(card.right, 40);
      });
      cy.get('[data-test-echo-lab-farm-details="Cartethyia|4"]').click();
      cy.get('[data-test-echo-lab-farm-detail="Cartethyia|4"] [data-test-echo-lab-farm-alt]').should("have.length.at.least", 2);
      expectInside(`farm next at ${width} px`);
      cy.get("[data-test-echo-lab-farm-more]").click();
      cy.get("[data-test-echo-lab-farm-team-run]").first().click();
      cy.get("[data-test-echo-lab-farm-character]").select("Galbrena");
      cy.get("[data-test-echo-lab-farm-row]").should("have.length", 5);
      expectInside(`farm next filtered at ${width} px`);
    });
  }
});
