// Wuthering Tools+ Echo Lab in Ryan's v3 inventory (src/sim/inventoryQuality/): every echo tile gets a chip with its
// Keep / Spare / Feed verdict and how lucky its roll is, the plus sort ("Best rolls first", "Feed first") reorders the
// list, "Feed candidates" narrows it, and a tap opens the echo in Echo Lab with "How good is this roll". Then the
// phone: 260 echoes at 412 and 360 px with 130 % text. Seeded through onBeforeLoad (the support file seeds classic
// otherwise) with the Echo Lab unit-test fixture: public data only, its echoes copied under new ids for the long list.
import * as fixtureModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

// Cypress's webpack hands JSON over as the module itself (no default export)
type Account = { characters: Record<string, unknown>; echoes: Array<{ echoId: string }>; equipped: Record<string, unknown> };
const fixture = ((fixtureModule as unknown as { default?: Account }).default ?? fixtureModule) as unknown as Account;

const RUN = { timeout: 90000 };
const SORT_KEY = "wtplus:inventory:sort";

/** the fixture's echoes, then unworn copies of them under new ids until there are `count` */
function echoesUpTo(count: number): Array<{ echoId: string }> {
  const out = [...fixture.echoes];
  for (let i = 0; out.length < count; i++) {
    const src = fixture.echoes[i % fixture.echoes.length];
    out.push({ ...src, echoId: `copy${String(i).padStart(4, "0")}` });
  }
  return out;
}

/** the fixture with eight unworn echoes still being tuned, so Ryan's "Finish these first" has a real ranking to keep */
function echoesBeingTuned(): Array<{ echoId: string }> {
  const worn = new Set(Object.keys(fixture.equipped));
  let left = 8;
  return fixture.echoes.map((echo) => {
    if (worn.has(echo.echoId) || left <= 0) return echo;
    left -= 1;
    return { ...echo, echoSubStatsType4: null, echoSubStatsValue4: null, echoSubStatsType5: null, echoSubStatsValue5: null };
  });
}

function seed({ count = fixture.echoes.length, echoes, fontScale, theme }: { count?: number; echoes?: Array<{ echoId: string }>; fontScale?: number; theme?: string } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.removeItem(SORT_KEY);
      win.localStorage.setItem("character", JSON.stringify({ characters: fixture.characters, activeCharacter: "Cartethyia" }));
      win.localStorage.setItem("inventory", JSON.stringify({ echoes: echoes ?? echoesUpTo(count), equipped: fixture.equipped, echoPresets: [], equippedPresets: {} }));
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false, ...(theme ? { theme } : {}) };
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

const idsOf = ($tiles: JQuery<HTMLElement>): string[] => $tiles.toArray().map((el) => el.getAttribute("data-test-inventory-echo-tile") ?? "");
const tileIds = (): Cypress.Chainable<string[]> => cy.get("[data-test-inventory-echo-tile]").then(idsOf);

function waitForChips(): void {
  cy.get('[data-test-inventory-quality-status][data-state="done"]', RUN).should("exist");
}

function expectNoHorizontalScroll(label: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${label} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

describe("Echo Lab in the inventory", () => {
  it("leaves Ryan's own ranking alone: Finish these first keeps its order under a plus sort, and Feed candidates still narrows it", () => {
    cy.viewport(1440, 900);
    cy.visit("/inventory", seed({ echoes: echoesBeingTuned() }));
    waitForChips();
    cy.get("[data-test-find-unfinished]").click();
    tileIds().then((ranked) => {
      expect(ranked.length, "echoes being tuned").to.be.greaterThan(3);
      cy.get("[data-test-inventory-quality-sort]").select("best-rolls");
      tileIds().should("deep.equal", ranked);
      cy.get("[data-test-inventory-quality-sort]").select("feed-first");
      tileIds().should("deep.equal", ranked);
      // the filter is not an order: it still narrows his ranked list, keeping that order
      cy.get("[data-test-inventory-quality-feed]").click();
      tileIds().then((narrowed) => {
        expect(narrowed.length, "a narrower list").to.be.lessThan(ranked.length);
        expect(narrowed, "his order").to.deep.equal(ranked.filter((id) => narrowed.includes(id)));
      });
    });
    // off again: the plus sort is back
    cy.get("[data-test-inventory-quality-feed]").click();
    cy.get("[data-test-find-unfinished]").click();
    cy.get("[data-test-inventory-quality-sort]").should("have.value", "feed-first");
    cy.get("[data-test-inventory-quality-chip]").first().should("have.attr", "data-verdict", "feed");
  });

  it("puts a verdict and roll chip on every echo, sorts by roll or feed first, and narrows to the feed candidates", () => {
    cy.viewport(1440, 900);
    cy.visit("/inventory", seed());
    cy.get("[data-test-inventory-quality-bar]", RUN).should("contain.text", "Echo Lab verdicts");
    waitForChips();
    cy.get("[data-test-inventory-echo-tile]").should("have.length", 20);
    cy.get("[data-test-inventory-echo-tile] [data-test-inventory-quality-chip]").should("have.length", 20);
    cy.get("[data-test-inventory-quality-chip]").each(($chip) => expect($chip.attr("data-verdict")).to.match(/^(keep|spare|feed)$/));
    cy.get("[data-test-inventory-quality-roll]").first().invoke("text").should("match", /^(Top|Bottom) \d+% roll/);
    cy.get("[data-test-inventory-quality-status]").invoke("text").should("match", /\d+ keep · \d+ spare · \d+ feed\./);

    // Best rolls first: page 1 runs from the luckiest roll down
    tileIds().then((before) => {
      cy.get("[data-test-inventory-quality-sort]").select("best-rolls");
      cy.get("[data-test-inventory-echo-tile]").should(($tiles) => expect(idsOf($tiles)).not.to.deep.equal(before));
    });
    cy.get("[data-test-inventory-quality-chip]").then(($chips) => {
      const p = $chips
        .toArray()
        .map((el) => el.getAttribute("data-percentile"))
        .filter((v): v is string => v !== null)
        .map(Number);
      expect(p.length, "rated chips on page 1").to.be.at.least(15);
      for (let i = 1; i < p.length; i++) expect(p[i - 1], `roll ${i}`).to.be.at.least(p[i]);
    });
    // remembered after a reload
    cy.reload();
    cy.get("[data-test-inventory-quality-sort]", RUN).should("have.value", "best-rolls");

    // Feed first: the feed verdicts lead
    cy.get("[data-test-inventory-quality-sort]").select("feed-first");
    waitForChips();
    cy.get("[data-test-inventory-quality-chip]").first().should("have.attr", "data-verdict", "feed");

    // Feed candidates: only the feed verdicts, as many as the badge says
    cy.get("[data-test-inventory-quality-feed-count]").invoke("text").then((text) => {
      const feed = Number(text.trim());
      expect(feed).to.be.within(1, 20);
      cy.get("[data-test-inventory-quality-feed]").click().should("have.attr", "aria-pressed", "true");
      cy.get("[data-test-inventory-echo-tile]").should("have.length", feed);
      cy.get("[data-test-inventory-quality-chip]").each(($chip) => expect($chip.attr("data-verdict")).to.eq("feed"));
      cy.get("[data-test-inventory-quality-feed]").click().should("have.attr", "aria-pressed", "false");
      cy.get("[data-test-inventory-echo-tile]").should("have.length", 20);
    });
    cy.get("[data-test-inventory-quality-sort]").select("default");
  });

  it("opens the tapped echo in Echo Lab with how good its roll is, and the chip then shows the exact figure", () => {
    cy.viewport(1440, 900);
    cy.visit("/inventory", seed());
    waitForChips();
    cy.get("[data-test-inventory-quality-chip][data-roll]")
      .first()
      .then(($chip) => {
        const id = $chip.attr("data-test-inventory-quality-chip")!;
        expect($chip.attr("data-exact")).to.eq("false");
        expect($chip.attr("aria-label")).to.match(/^Echo Lab: (Keep|Spare|Feed), (Top|Bottom) \d+% roll.*Open in Echo Lab$/);
        cy.wrap($chip).click();
        cy.location("pathname").should("eq", "/echo-lab");
        cy.location("search").should("eq", `?echo=${id}`);
        cy.get("[data-test-echo-lab-one-echo]", RUN).should("be.visible").and("contain.text", "from your inventory");
        cy.get("[data-test-echo-lab-row]").should("have.length", 1);
        cy.get(`[data-test-echo-lab-detail="${id}"] [data-test-echo-lab-quality-percentile]`, RUN).should("be.visible");
        // back in the inventory the chip carries Echo Lab's exact figure
        cy.get("[data-test-echo-lab-back-inventory]").click();
        cy.location("pathname").should("eq", "/inventory");
        cy.get(`[data-test-inventory-quality-chip="${id}"]`, RUN).should("have.attr", "data-exact", "true");
        // and the whole verdict list is one tap away from the one echo
        cy.get(`[data-test-inventory-quality-chip="${id}"]`).click();
        cy.get("[data-test-echo-lab-one-echo]", RUN).should("be.visible");
        cy.get("[data-test-echo-lab-show-all]").click();
        cy.get("[data-test-echo-lab-row]").should("have.length", fixture.echoes.length);
        cy.location("search").should("eq", "");
      });
  });

  it("lands on the tapped echo on a phone, not at the top of Echo Lab", () => {
    cy.viewport(412, 915);
    cy.visit("/inventory", seed());
    waitForChips();
    // a chip a few tiles down: the router's own scroll to the top of a new page must not win over the echo's
    cy.get("[data-test-inventory-quality-chip][data-roll]").eq(5).click();
    cy.location("pathname").should("eq", "/echo-lab");
    cy.get("[data-test-echo-lab-one-echo]", RUN).should(($notice) => {
      const top = $notice[0].getBoundingClientRect().top;
      expect(top, "notice under the nav bar, in view").to.be.within(0, 300);
    });
  });

  for (const theme of ["dark", "light"]) {
    it(`fits 260 echoes on a 412 and a 360 px phone at 130 % text (${theme})`, () => {
      cy.viewport(412, 915);
      cy.visit("/inventory", seed({ count: 260, fontScale: 1.3, theme }));
      cy.get("[data-test-inventory-quality-bar]", RUN).should("be.visible");
      waitForChips();
      cy.get("[data-test-inventory-quality-status]").should("contain.text", "Tap an echo's chip for why");
      for (const [width, height] of [
        [412, 915],
        [360, 800],
      ]) {
        cy.viewport(width, height);
        expectNoHorizontalScroll(`/inventory ${width} px`);
        cy.get("[data-test-inventory-quality-chip]").each(($chip) => {
          const chip = $chip[0].getBoundingClientRect();
          const tile = $chip[0].closest("[data-test-inventory-echo-tile]")!.getBoundingClientRect();
          expect(chip.left, "chip inside its tile").to.be.at.least(tile.left - 0.5);
          expect(chip.right, "chip inside its tile").to.be.at.most(tile.right + 0.5);
          expect(chip.height, "chip a line or two tall").to.be.within(30, 90);
        });
        cy.get("[data-test-inventory-quality-bar]").then(($bar) => expect($bar[0].getBoundingClientRect().right).to.be.at.most(width));
      }
      cy.get("[data-test-inventory-quality-feed]").then(($b) => expect($b[0].getBoundingClientRect().height, "feed toggle a thumb's height").to.be.at.least(32));
    });
  }
});
