// Wuthering Tools+ — /today (src/sim/today): the server clock and resets, the Waveplate clock, events from Kuro's
// patch notes, the double-drop banner, the self-resetting checklist and the calendar file. No live network: Kuro's
// news JSON is answered from the unit-test fixtures (the 3.7 patch notes, a trimmed menu), every other notice is a
// 404, and the clock is pinned (Date only) on the Asia server clock.
const NEWS = "https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en";
const H = 3_600_000;
/** Monday 2026-10-26 12:00 UTC+8 — Whimpering Wastes turned this morning, Artisan's Search ended at 03:59 */
const MONDAY_NOON = Date.UTC(2026, 9, 26, 4, 0);
/** Thursday 2026-11-05 12:00 UTC+8 — Chord Cleansing (Nov 4–11) is on */
const DOUBLE_DROP = Date.UTC(2026, 10, 5, 4, 0);

function seed(opts: { server?: string | null; today?: Record<string, unknown> } = {}) {
  return {
    onBeforeLoad(win: Window) {
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      if (opts.server !== null) win.localStorage.setItem("wtplus:convene:prefs", JSON.stringify({ v: 1, tab: "simulator", server: opts.server ?? "asia", budgetAstrite: null, manualPity: {} }));
      if (opts.today) win.localStorage.setItem("wtplus:today:v1", JSON.stringify({ v: 1, ...opts.today }));
    },
  };
}

function interceptNews(menu: "fixture" | "down" = "fixture") {
  if (menu === "down") {
    cy.intercept("GET", `${NEWS}/ArticleMenu.json`, { statusCode: 503, body: "" }).as("menu");
    cy.intercept("GET", `${NEWS}/article/*.json`, { statusCode: 503, body: "" });
    return;
  }
  cy.readFile("src/sim/today/__fixtures__/kuroMenu.json").then((body) => cy.intercept("GET", `${NEWS}/ArticleMenu.json`, { body }).as("menu"));
  cy.readFile("src/sim/today/__fixtures__/patch37.json").then((patch) => {
    cy.intercept("GET", `${NEWS}/article/*.json`, (req) => {
      if (req.url.endsWith("/article/5571.json")) req.reply({ body: patch });
      else req.reply({ statusCode: 404, body: "" });
    }).as("article");
  });
}

function expectNoHorizontalScroll(what: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${what} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

describe("Today", () => {
  it("reads the events from Kuro's patch notes and buckets them on the server clock", () => {
    cy.clock(MONDAY_NOON, ["Date"]);
    interceptNews();
    cy.visit("/today", seed({ today: { timeMode: "server" } }));
    cy.title().should("eq", "Today — Wuthering Waves Calculator & Optimizer");
    cy.wait("@menu");
    cy.get("[data-test-today-feed]").should("contain.text", "Kuro's news");
    // the server clock and the resets (Asia: daily 04:00, weekly Monday 04:00)
    cy.get("[data-test-today-server-time]").should("contain.text", "12:00");
    cy.get("[data-test-today-daily]").should("contain.text", "16h 0m").and("contain.text", "04:00 tomorrow server time");
    cy.get("[data-test-today-weekly]").should("contain.text", "6d 16h");
    // Artisan's Search ended at 03:59; the fishing web event (UTC+8) runs; Beyond the Waves and Chord Cleansing are next
    cy.get("[data-test-today-live-list]").should("contain.text", "Waking Moon Fishing").and("not.contain.text", "Artisan's Search");
    cy.get('[data-test-today-event="Waking Moon Fishing"]').should("contain.text", "Sun 09:59 (UTC+8)");
    cy.get("[data-test-today-upcoming-list]").should("contain.text", "Beyond the Waves: Land of Xuanfang").and("contain.text", "Chord Cleansing");
    cy.get("[data-test-today-ending-none]").should("contain.text", "Nothing ends in the next 3 days");
    cy.get("[data-test-today-double-drop-soon]").should("contain.text", "Chord Cleansing").and("contain.text", "180 Waveplates");
    // the endgame cycles: Whimpering Wastes turned this morning, ToA resets Nov 9
    cy.get('[data-test-today-cycle="toa"]').should("contain.text", "Season 41").and("contain.text", "13d 16h");
    cy.get('[data-test-today-cycle="ww"]').should("contain.text", "27d 16h");
    cy.get('[data-test-today-cycle="matrix"]').should("contain.text", "Phase 3 of 4").and("contain.text", "3.8 update");
    // an event's calendar file states its end as a date on Kuro's clock (never "tomorrow"), with a SEQUENCE for re-imports
    let ics: Promise<string> | null = null;
    cy.window().then((win) => {
      cy.stub(win.URL, "createObjectURL").callsFake((blob: Blob) => {
        ics = blob.text();
        return "data:text/plain,";
      });
    });
    cy.get('[data-test-today-event-ics="Waking Moon Fishing"]').click();
    cy.then(() => ics).then((text) => {
      const unfolded = String(text).replace(/\r\n /g, "");
      expect(unfolded).to.contain("SUMMARY:Waking Moon Fishing ends").and.contain("DTEND:20261101T015959Z").and.match(/\r\nSEQUENCE:\d+\r\n/);
      expect(unfolded).to.contain("ends Nov 1\\, 09:59 (UTC+8)").and.not.contain("tomorrow");
    });
  });

  it("works out when Waveplates are full and writes a calendar file", () => {
    cy.clock(MONDAY_NOON, ["Date"]);
    interceptNews();
    cy.visit("/today", seed({ today: { timeMode: "server" } }));
    cy.get("[data-test-today-wp-empty]").should("be.visible");
    cy.get("[data-test-today-wp-input]").clear();
    cy.get("[data-test-today-wp-input]").type("100{enter}");
    // 140 to go at 6 minutes each: 14 h → 02:00 tomorrow; crystals 480 × 12 min after that
    cy.get("[data-test-today-wp-full]").should("contain.text", "02:00").and("contain.text", "tomorrow").and("contain.text", "in 14h 0m");
    cy.get("[data-test-today-wp-crystals]").should("contain.text", "02:00").and("contain.text", "Sat");
    cy.get('[data-test-today-wp-spend="60"]').click();
    cy.get("[data-test-today-wp-input]").should("have.value", "40");
    cy.get("[data-test-today-wp-full]").should("contain.text", "08:00");
    let ics: Promise<string> | null = null;
    cy.window().then((win) => {
      cy.stub(win.URL, "createObjectURL").callsFake((blob: Blob) => {
        ics = blob.text();
        return "data:text/plain,";
      });
    });
    cy.get("[data-test-today-wp-ics]").click();
    cy.then(() => ics).then((text) => {
      expect(text).to.contain("BEGIN:VCALENDAR").and.contain("BEGIN:VEVENT").and.contain("SUMMARY:Waveplates full (240)");
      // 08:00 UTC+8 tomorrow = 00:00 UTC
      expect(text).to.contain("DTSTART:20261027T000000Z");
      expect(text).to.contain("TRIGGER:-PT0M");
    });
  });

  it("keeps checklist ticks across a reload and clears them at the weekly reset", () => {
    cy.clock(MONDAY_NOON, ["Date"]);
    interceptNews();
    // a Weekly Challenge claim ticked last Sunday doesn't count this week
    cy.visit("/today", seed({ today: { ticks: { "weekly-boss": { n: 3, at: MONDAY_NOON - 16 * H } } } }));
    cy.get('[data-test-today-check-count="weekly-boss"]').should("contain.text", "0/3");
    cy.get('[data-test-today-check-inc="weekly-boss"]').click();
    cy.get('[data-test-today-check-inc="weekly-boss"]').click();
    cy.get('[data-test-today-check-count="weekly-boss"]').should("contain.text", "2/3");
    cy.get('[data-test-today-check-toggle="daily-activity"]').click();
    cy.get('[data-test-today-check="daily-activity"]').should("have.attr", "data-done", "true").and("contain.text", "back in 16h 0m");
    cy.get("[data-test-today-checklist-done]").should("contain.text", "1/");
    cy.reload();
    cy.get('[data-test-today-check-count="weekly-boss"]').should("contain.text", "2/3");
    cy.get('[data-test-today-check="daily-activity"]').should("have.attr", "data-done", "true");
    // hide an item, and bring it back
    cy.get("[data-test-today-checklist-edit]").click();
    cy.get('[data-test-today-check-hide="absorption-13"]').click();
    cy.get('[data-test-today-check="absorption-13"]').should("not.exist");
    cy.get('[data-test-today-check-unhide="absorption-13"]').click();
    cy.get('[data-test-today-check="absorption-13"]').should("exist");
    cy.window().then((win) => {
      const stored = JSON.parse(win.localStorage.getItem("wtplus:today:v1") ?? "{}");
      expect(stored.ticks["weekly-boss"].n).to.equal(2);
      expect(stored.hidden).to.deep.equal([]);
    });
  });

  it("states a live double drop as numbers and counts today's doubled claims", () => {
    cy.clock(DOUBLE_DROP, ["Date"]);
    interceptNews();
    cy.visit("/today", seed());
    cy.get('[data-test-today-double-drop="chord-cleansing"]')
      .should("contain.text", "Chord Cleansing is on")
      .and("contain.text", "3 doubled claims a day")
      .and("contain.text", "18 over the 6 days left")
      .and("contain.text", "180 Waveplates")
      .and("contain.text", "gains nothing");
    cy.get('[data-test-today-check="double-claims"]').should("exist");
    cy.get('[data-test-today-double-claim="2"]').click();
    cy.get('[data-test-today-check-count="double-claims"]').should("contain.text", "2/3");
  });

  it("guesses the server from the time zone and asks once", () => {
    cy.clock(MONDAY_NOON, ["Date"]);
    interceptNews();
    cy.visit("/today", seed({ server: null }));
    cy.get("[data-test-today-region-guess]").should("be.visible");
    cy.get("[data-test-today-region-pick]").select("europe");
    cy.get("[data-test-today-region-guess]").should("not.exist");
    cy.get("[data-test-today-region]").should("have.value", "europe");
    cy.window().then((win) => expect(JSON.parse(win.localStorage.getItem("wtplus:convene:prefs") ?? "{}").server).to.equal("europe"));
    cy.reload();
    cy.get("[data-test-today-region-guess]").should("not.exist");
  });

  it("still shows resets, Waveplates and the checklist when Kuro's feed is down", () => {
    cy.clock(MONDAY_NOON, ["Date"]);
    interceptNews("down");
    cy.visit("/today", seed());
    cy.get("[data-test-today-feed-error]").should("contain.text", "Couldn't reach Kuro's news feed").and("contain.text", "still work");
    cy.get("[data-test-today-daily]").should("be.visible");
    cy.get("[data-test-today-waveplates]").should("be.visible");
    cy.get("[data-test-today-checklist]").should("be.visible");
    cy.get("[data-test-today-ending]").should("contain.text", "once Kuro's news has been read");
  });

  it("fits a phone at 130 % text, and the account page carries the Today strip", () => {
    cy.clock(MONDAY_NOON, ["Date"]);
    interceptNews();
    cy.viewport(412, 915);
    const s = seed({ today: { timeMode: "server", waveplates: { value: 120, crystals: 0, atMs: MONDAY_NOON } } });
    cy.visit("/today", {
      ...s,
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130%; }";
        win.document.head.appendChild(style);
      },
    });
    cy.get("[data-test-today-live-list]").should("contain.text", "Waking Moon Fishing");
    cy.get("[data-test-today-timeline]").should("not.exist");
    expectNoHorizontalScroll("/today (412, 130 %)");
    cy.visit("/account", s);
    cy.get("[data-test-today-card]").should("be.visible").and("contain.text", "Daily reset").and("contain.text", "full 00:00");
    cy.get("[data-test-today-card]").click();
    cy.location("pathname").should("eq", "/today");
  });
});
