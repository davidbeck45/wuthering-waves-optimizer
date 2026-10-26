// Wuthering Tools+ — the Convene tabs on /convene (src/sim/convene/ui): My pulls (import from Kuro's record API,
// pity, the hand-off to upstream's simulator), Banners (Kuro's news feed) and the pull advisor (the app's engine on
// the Cartethyia fixture). No live network: the record API and the news JSON are answered from fixtures, and the
// clock is pinned (Date only) inside a banner phase the shipped seed holds.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const GACHA_API = "https://gmserver-api.aki-game2.net/gacha/record/query";
const NEWS = "https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en";
// made-up ids in the link's real shape; the token must never reach the route or storage
const RECORD_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const LINK = `https://aki-gm-resources-oversea.aki-game.net/aki/gacha/index.html#/record?svr_id=76402e5b20be2c39f095a152090afddc&player_id=500123456&lang=en&gacha_id=100001&gacha_type=1&svr_area=global&record_id=${RECORD_ID}&resources_id=917dfa695d6c6634ee4e972bb9168f6a`;
/** 3.7 Phase II (Oct 22 – Nov 11, 2026) is running */
const PHASE_II = Date.UTC(2026, 9, 30, 12, 0, 0);
/** 3.4 Phase II (Cartethyia, Defier's Thorn, Lucilla, Freeze Frame) is running */
const CARTETHYIA_RUN = Date.UTC(2026, 5, 25, 12, 0, 0);

type ApiRecord = { qualityLevel: number; name: string };

function v3(extra: (win: Window) => void = () => {}) {
  return {
    onBeforeLoad(win: Window) {
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      extra(win);
    },
  };
}

function interceptNews(menu: unknown = "fixture") {
  if (menu === "fixture") cy.intercept("GET", `${NEWS}/ArticleMenu.json`, { fixture: "convene/articleMenu.json" }).as("menu");
  else cy.intercept("GET", `${NEWS}/ArticleMenu.json`, { body: menu }).as("menu");
  cy.intercept("GET", `${NEWS}/article/5668.json`, { fixture: "convene/article5668.json" }).as("article");
}

function interceptGacha(pools: Record<string, ApiRecord[]>) {
  cy.intercept("POST", GACHA_API, (req) => {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    expect(body.languageCode, "names are asked for in English").to.equal("en");
    expect(body.recordId).to.equal(RECORD_ID);
    req.reply({ statusCode: 200, headers: { "access-control-allow-origin": "*" }, body: { code: 0, message: "success", data: pools[String(body.cardPoolType)] ?? [] } });
  }).as("gacha");
}

/** pulls since the last 5★ in a newest-first API list */
const pityOf = (records: ApiRecord[]) => {
  const i = records.findIndex((r) => r.qualityLevel === 5);
  return i < 0 ? records.length : i;
};

function expectNoHorizontalScroll(what: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${what} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
  cy.window().then((win) => expect(win.innerWidth, `${what} layout viewport`).to.be.at.most(412));
}

function importFromLink(): void {
  cy.get("[data-test-convene-link]").type(LINK, { delay: 0 });
  cy.get("[data-test-convene-import-link]").click();
  cy.get("[data-test-convene-import-progress]").should("be.visible");
  cy.get("[data-test-convene-import-message]", { timeout: 20000 }).should("have.attr", "data-kind", "ok");
}

describe("Convene tracker", () => {
  beforeEach(() => {
    cy.clock(PHASE_II, ["Date"]);
  });

  it("imports the history from a pasted link, reads the pity and hands it to the simulator", () => {
    cy.fixture("convene/gachaRecords.json").then(({ pools }: { pools: Record<string, ApiRecord[]> }) => {
      interceptGacha(pools);
      interceptNews([]);
      const total = Object.values(pools).reduce((n, list) => n + list.length, 0);
      cy.visit("/convene?tab=pulls", v3());
      cy.title().should("eq", "My Convene history — Wuthering Waves Calculator & Optimizer");
      cy.get("[data-test-convene-steps='pc']").should("contain.text", "Client.log");
      cy.get("[data-test-convene-platform='phone']").click();
      cy.get("[data-test-convene-guide-link]").should("have.attr", "href", "https://wuwatracker.com/import");
      importFromLink();
      cy.get("@gacha.all").should("have.length", 13);
      // the panel closes on success and its outcome line moves up to the page
      cy.get("[data-test-convene-import]").should("not.exist");
      cy.get("[data-test-convene-import-message]").should("contain.text", `Added ${total.toLocaleString()} new pulls`);
      cy.get("[data-test-convene-total-pulls]").should("have.text", total.toLocaleString());
      cy.get('[data-test-convene-pool="1"] [data-test-convene-pity5]').should("have.text", String(pityOf(pools["1"]!)));
      cy.get('[data-test-convene-pool="2"] [data-test-convene-pity5]').should("have.text", String(pityOf(pools["2"]!)));
      cy.get("[data-test-convene-timeline-item]").should("have.length.at.least", 4);
      // the token stays out of the route and out of storage; only the player id is kept
      cy.location("href").should("not.contain", RECORD_ID).and("not.contain", "player_id");
      cy.window().then((win) => {
        const stored = win.localStorage.getItem("wtplus:convene:history") ?? "";
        expect(stored).to.contain("500123456");
        expect(stored).not.to.contain(RECORD_ID);
        expect(stored).not.to.contain("76402e5b20be2c39f095a152090afddc");
      });
      // a second import adds nothing
      cy.get("[data-test-convene-update]").click();
      importFromLink();
      cy.get("[data-test-convene-import-message]").should("contain.text", "No new pulls");
      cy.get("[data-test-convene-total-pulls]").should("have.text", total.toLocaleString());
      // "Use my pity in the simulator" → the Simulator tab with upstream's own inputs filled in
      cy.get('[data-test-convene-use-pity="1"]').click();
      cy.location("search").should("eq", "");
      cy.get("[data-test-convene-prefill-note]").should("contain.text", `Pity ${pityOf(pools["1"]!)}`);
      cy.get(".page-convene details").should("have.attr", "open");
      cy.get(".page-convene details input[type=number]").should("have.value", String(pityOf(pools["1"]!)));
      cy.title().should("eq", "Convene odds — Wuthering Waves Calculator & Optimizer");
    });
  });

  it("says plainly when the link has expired and stops asking", () => {
    let calls = 0;
    cy.intercept("POST", GACHA_API, (req) => {
      calls += 1;
      req.reply({ statusCode: 200, headers: { "access-control-allow-origin": "*" }, body: { code: -1, message: "", data: null } });
    }).as("gacha");
    interceptNews([]);
    cy.visit("/convene?tab=pulls", v3());
    cy.get("[data-test-convene-link]").type(LINK, { delay: 0 });
    cy.get("[data-test-convene-import-link]").click();
    cy.get("[data-test-convene-import-message]", { timeout: 20000 }).should("have.attr", "data-kind", "error").and("contain.text", "expired");
    cy.then(() => expect(calls, "requests after an expired answer").to.equal(1));
    cy.get("[data-test-convene-summary]").should("not.exist");
    cy.window().then((win) => expect(win.localStorage.getItem("wtplus:convene:history")).to.equal(null));
    // a link that isn't one never leaves the page
    cy.get("[data-test-convene-link]").type("https://example.com/not-a-convene-link", { delay: 0 });
    cy.get("[data-test-convene-import-link]").click();
    cy.get("[data-test-convene-import-message]").should("contain.text", "doesn't look like a Convene History link");
    cy.then(() => expect(calls).to.equal(1));
  });

  it("lists the running banners from Kuro's news, with countdowns, rerun gaps and the history", () => {
    interceptNews();
    cy.visit("/convene?tab=banners", v3());
    cy.wait("@menu");
    cy.wait("@article");
    cy.get("[data-test-convene-live-banner]").should("have.length", 4);
    cy.get('[data-test-convene-live-banner="Lucilla"]').within(() => {
      cy.contains("Rerun");
      cy.get("[data-test-convene-countdown]").should("contain.text", "left");
    });
    cy.get("[data-test-convene-reruns] [data-test-convene-rerun]").should("have.length.at.least", 5);
    cy.get("[data-test-convene-history-search]").type("Chisa");
    cy.get("[data-test-convene-version]").first().should("contain.text", "Chisa");
    cy.get("[data-test-convene-version='3.6']").should("not.exist");
    // the server clock is a preference
    cy.get("[data-test-convene-server]").select("europe");
    cy.window().its("localStorage").invoke("getItem", "wtplus:convene:prefs").should("contain", '"server":"europe"');
  });

  it("keeps every tab inside a 412 px phone at 130 % text", () => {
    cy.viewport(412, 915);
    cy.fixture("convene/gachaRecords.json").then(({ pools }: { pools: Record<string, ApiRecord[]> }) => {
      interceptGacha(pools);
      interceptNews();
      const seed = v3();
      const bigText = {
        ...seed,
        onLoad(win: Window) {
          const style = win.document.createElement("style");
          style.textContent = "html { font-size: 130%; }";
          win.document.head.appendChild(style);
        },
      };
      cy.visit("/convene?tab=pulls", bigText);
      importFromLink();
      expectNoHorizontalScroll("my pulls");
      cy.get("[data-test-convene-tab='banners']").click();
      cy.get("[data-test-convene-live-banner]").should("have.length", 4);
      expectNoHorizontalScroll("banners");
      cy.get("[data-test-convene-tab='advisor']").click();
      cy.get("[data-test-convene-advisor-row]", { timeout: 60000 }).should("have.length", 4);
      expectNoHorizontalScroll("advisor");
      cy.get("[data-test-convene-tab='simulator']").click();
      cy.get("[data-test-convene-sim-fill='1']").should("be.visible");
      expectNoHorizontalScroll("simulator");
    });
  });
});

describe("pull advisor", () => {
  it("scores the featured resonator and her signature on the account's own build, and leaves out what it doesn't own", () => {
    cy.clock(CARTETHYIA_RUN, ["Date"]);
    interceptNews([]);
    const seed = v3((win) => {
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
    });
    cy.visit("/convene?tab=advisor", seed);
    cy.title().should("eq", "Pull advisor — Wuthering Waves Calculator & Optimizer");
    cy.get('[data-test-convene-advisor-row="Cartethyia"]', { timeout: 90000 }).should("have.attr", "data-status", "ok");
    cy.get('[data-test-convene-advisor-row="Cartethyia"]').within(() => {
      cy.contains("Cartethyia S3");
      cy.contains("you have S2");
      cy.get("[data-test-convene-advisor-gain]").invoke("text").should("match", /^\+\d+\.\d%$/);
      cy.get("[data-test-convene-advisor-per1k]").invoke("text").should("match", /^\d+\.\d\d%$/);
    });
    cy.get(`[data-test-convene-advisor-row="Defier's Thorn"]`).should("have.attr", "data-status", "ok").and("contain.text", "Defier's Thorn R2 on Cartethyia");
    cy.get('[data-test-convene-advisor-row="Lucilla"]').should("have.attr", "data-status", "not-owned");
    cy.get('[data-test-convene-advisor-row="Lucilla"] [data-test-convene-advisor-rankings]').should("have.attr", "href", "/rankings");
    cy.get("[data-test-convene-advisor-summary]").should("contain.text", "Most damage per Astrite right now");
    // the ladder to S6, then the odds of S3 in upstream's simulator
    cy.get('[data-test-convene-advisor-ladder-toggle="Cartethyia"]').click();
    cy.get('[data-test-convene-advisor-ladder="Cartethyia"] tbody tr').should("have.length", 4);
    cy.get("[data-test-convene-advisor-pity-input]").first().clear().type("70").blur();
    cy.get('[data-test-convene-advisor-simulate="Cartethyia"]').click();
    cy.get("[data-test-convene-prefill-note]").should("contain.text", "Cartethyia S3").and("contain.text", "pity 70");
    cy.get(".page-convene details input[type=number]").should("have.value", "70");
    cy.get(".page-convene details").should("contain.text", "S2 (3 featured pulls so far)");
  });
});

describe("released content only", () => {
  // Kuro posts a version's Convene notice the day before release; its banners open with the version's patch notes
  // (the shipped seed carries 3.7's: 2026-09-30 10:00 CST). Asia server clock, so 3.6 Phase II ends 09-29 11:59 CST.
  const asia = v3((win) =>
    win.localStorage.setItem("wtplus:convene:prefs", JSON.stringify({ v: 1, tab: "banners", server: "asia", budgetAstrite: null, manualPity: {} })),
  );

  it("shows nothing running in the gap before a version update, and no banner of the coming version", () => {
    cy.clock(Date.UTC(2026, 8, 29, 12, 0), ["Date"]); // 20:00 CST, the evening before 3.7
    interceptNews([]);
    cy.visit("/convene?tab=banners", asia);
    cy.get("[data-test-convene-none-live]").should("be.visible");
    cy.get("[data-test-convene-version='3.6']").should("exist");
    cy.get("[data-test-convene-version='3.7']").should("not.exist");
    cy.get("[data-test-convene-live-chip]").should("not.exist");
  });

  it("opens the coming version's banners with its patch notes", () => {
    cy.clock(Date.UTC(2026, 8, 30, 2, 30), ["Date"]); // 10:30 CST on release day
    interceptNews([]);
    cy.visit("/convene?tab=banners", asia);
    cy.get("[data-test-convene-live-banner]").should("have.length", 4);
    cy.get('[data-test-convene-live-banner="Chisa"]').should("contain.text", "(version update)");
    cy.get("[data-test-convene-live-chip]").should("contain.text", "3.7 Phase I");
  });
});
