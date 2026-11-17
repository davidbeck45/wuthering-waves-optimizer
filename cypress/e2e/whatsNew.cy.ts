// Wuthering Tools+: "What's new on Tools+" (src/sim/whatsNew/): the plus features by the day they reached the site, each
// with where it is and an Open link that lands on a real page; the unseen marker (a dot on the plus pages menu, a line
// in the menu, a card on /account) that opening the page clears; and a phone at 130 % text.
const SEEN_KEY = "wtplus:whatsNew:seen";

interface SeedOptions {
  /** a character with a weapon: "an account" */
  account?: boolean;
  /** the stored marker, as the page writes it */
  seen?: string[] | null;
  fontScale?: number;
}

function seed(options: SeedOptions = {}) {
  return {
    onBeforeLoad(win: Window) {
      if (options.account) {
        win.localStorage.setItem("character", JSON.stringify({ activeCharacter: "Chisa", characters: { Chisa: { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "1" } } } } }));
      }
      if (options.seen) win.localStorage.setItem(SEEN_KEY, JSON.stringify({ v: 1, ids: options.seen }));
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
  };
}

const allIds = (): Cypress.Chainable<string[]> =>
  cy.get("[data-test-whats-new-entry]").then(($li) => [...$li].map((li) => li.getAttribute("data-test-whats-new-entry") as string));

describe("what's new on Tools+", () => {
  it("lists the plus features by day, newest first, each with where it is and an Open link", () => {
    cy.visit("/whats-new", seed());
    cy.title().should("eq", "What's new on Tools+ — Wuthering Waves Calculator & Optimizer");
    cy.get("[data-test-whats-new] h1").should("have.text", "What's new on Tools+");
    cy.get("[data-test-whats-new-group]").should("have.length.at.least", 3).then(($groups) => {
      const dates = [...$groups].map((g) => g.getAttribute("data-date") as string);
      expect(dates, "release days, newest first").to.deep.eq([...dates].sort().reverse());
      expect(new Set(dates).size, "one group per day").to.eq(dates.length);
    });
    cy.get("[data-test-whats-new-group]").first().find("h2").invoke("text").should("match", /\d{1,2} [A-Z][a-z]+ 20\d\d/);
    cy.get("[data-test-whats-new-entry]").should("have.length.at.least", 20).each(($li) => {
      expect($li.find("h3").text().trim(), "a title").to.have.length.greaterThan(3);
      expect($li.find("[data-test-whats-new-where]").text(), "where it is").to.contain("Where");
      expect($li.find("[data-test-whats-new-open]").attr("href"), "an Open link").to.match(/^\//);
    });
    // Ryan's own page is linked, not copied
    cy.get("[data-test-whats-new-updates]").should("have.attr", "href", "/updates");
    // the hub marks the page, and the palette finds it
    cy.get("[data-test-nav-rankings]").click();
    cy.get('[data-test-nav-plus-page="/whats-new"]').should("have.attr", "aria-current", "page");
  });

  it("opens a real page from every Open link", () => {
    cy.visit("/whats-new", seed({ account: true }));
    cy.get("[data-test-whats-new-open]").then(($links) => {
      const hrefs = [...new Set([...$links].map((a) => a.getAttribute("href") as string))];
      expect(hrefs.length, "distinct targets").to.be.greaterThan(8);
      // {character} was filled in from the account
      expect(hrefs.some((h) => h.includes("focus=Chisa")), "a link that names a character of the account").to.eq(true);
      expect(hrefs.filter((h) => h.includes("{")), "no placeholder left in a link").to.have.length(0);
      for (const href of hrefs) {
        cy.get(`[data-test-whats-new-open][href="${href}"]`).first().click();
        cy.location().should((loc) => expect(loc.pathname + loc.search, `Open → ${href}`).to.contain(href.split("?")[0]));
        cy.get("[data-test-not-found]").should("not.exist");
        cy.get("[data-test-whats-new]").should("not.exist");
        cy.visit("/whats-new", seed({ account: true }));
        cy.get("[data-test-whats-new]").should("exist");
      }
    });
  });

  it("shows no dot in a browser with no account", () => {
    cy.visit("/today", seed());
    cy.get("[data-test-nav-rankings]").should("be.visible");
    cy.get("[data-test-nav-plus-dot]").should("not.exist");
    cy.get("[data-test-nav-rankings]").click();
    cy.get("[data-test-nav-plus-news]").should("not.exist");
    cy.get("[data-test-nav-plus-new]").should("not.exist");
    cy.visit("/whats-new", seed());
    cy.get("[data-test-whats-new-fresh]").should("not.exist");
    cy.get("[data-test-whats-new-fresh-note]").should("not.exist");
  });

  it("marks the newest day as new for an account that never opened the page, and opening it clears the dot", () => {
    cy.visit("/today", seed({ account: true }));
    cy.get("[data-test-nav-plus-dot]").should("be.visible");
    cy.get("[data-test-nav-rankings]").click();
    cy.get("[data-test-nav-plus-news]").should("be.visible").invoke("text").should("match", /^\s*\d+ new things? on Tools\+ in the latest update/);
    cy.get("[data-test-nav-plus-new]").invoke("text").should("match", /^\d+ new$/);
    cy.get("[data-test-nav-plus-news]").click();
    cy.location("pathname").should("eq", "/whats-new");
    // only the newest day's entries carry New, and the note counts them
    cy.get("[data-test-whats-new-group]").first().find("[data-test-whats-new-entry]").its("length").then((newest) => {
      cy.get("[data-test-whats-new-fresh]").should("have.length", newest);
      cy.get("[data-test-whats-new-group]").first().find("[data-test-whats-new-fresh]").should("have.length", newest);
      cy.get("[data-test-whats-new-fresh-note]").should("contain.text", `${newest} new thing`);
    });
    // opened: the dot is gone at once, the marker holds every id, and it stays gone on other pages and after a reload
    cy.get("[data-test-nav-plus-dot]").should("not.exist");
    allIds().then((ids) => {
      cy.window().then((win) => {
        const marker = JSON.parse(win.localStorage.getItem(SEEN_KEY) ?? "null");
        expect(marker?.v).to.eq(1);
        expect(marker?.ids).to.deep.eq(ids);
      });
    });
    cy.get("[data-test-nav-rankings]").click();
    cy.get("[data-test-nav-plus-news]").should("not.exist");
    cy.get('[data-test-nav-plus-page="/today"]').click();
    cy.location("pathname").should("eq", "/today");
    cy.get("[data-test-nav-plus-dot]").should("not.exist");
    cy.reload();
    cy.get("[data-test-nav-rankings]").should("be.visible");
    cy.get("[data-test-nav-plus-dot]").should("not.exist");
    cy.visit("/whats-new");
    cy.get("[data-test-whats-new-entry]").should("have.length.at.least", 20);
    cy.get("[data-test-whats-new-fresh]").should("not.exist");
  });

  it("counts what was added since the last visit, on the menu and on My account's card", () => {
    cy.visit("/whats-new", seed());
    allIds().then((ids) => {
      // he saw everything but three entries
      const seen = ids.slice(3);
      cy.visit("/account", seed({ account: true, seen }));
      cy.get("[data-test-whats-new-card]").should("be.visible");
      cy.get("[data-test-whats-new-card-text]").should("have.text", "3 new things on Tools+ since your last visit");
      cy.get("[data-test-nav-plus-dot]").should("be.visible");
      cy.get("[data-test-whats-new-card]").click();
      cy.location("pathname").should("eq", "/whats-new");
      cy.get("[data-test-whats-new-fresh]").should("have.length", 3);
      for (const id of ids.slice(0, 3)) cy.get(`[data-test-whats-new-entry="${id}"] [data-test-whats-new-fresh]`).should("exist");
      cy.get("[data-test-whats-new-fresh-note]").should("contain.text", "3 new things on Tools+ since your last visit");
      // back on the account page the card is gone
      cy.go("back");
      cy.location("pathname").should("eq", "/account");
      cy.get("[data-test-account]").should("exist");
      cy.get("[data-test-whats-new-card]").should("not.exist");
      cy.get("[data-test-nav-plus-dot]").should("not.exist");
    });
  });

  // David's S26 width at 130 % text; 360 px at 100 % (at 130 % Ryan's v3 header fits 360 by less than Electron's scrollbar)
  it("fits a phone", () => {
    for (const [width, height, fontScale] of [
      [412, 915, 1.3],
      [360, 800, 1],
    ] as const) {
      cy.viewport(width, height);
      cy.visit("/whats-new", seed({ account: true, fontScale }));
      cy.get("[data-test-whats-new-entry]").should("have.length.at.least", 20);
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, `/whats-new width at ${width}`).to.be.at.most(doc.documentElement.clientWidth);
      });
      cy.get("[data-test-whats-new-open]").first().then(($a) => {
        // the layout box, not the painted one: DaisyUI's button pops in through a scale for its first quarter second
        expect($a[0].offsetHeight, "Open is a 40 px tap target").to.be.at.least(40);
        expect($a[0].getBoundingClientRect().right, "Open inside the viewport").to.be.at.most(width);
      });
    }
  });
});
