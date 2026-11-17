// Wuthering Tools+ resonator briefs (/kit and /kit/<name>, src/sim/kits/) in the v3 UI at the S26's 412 px and 130 %
// text: the list filters and searches, a brief opens from it, the "On your account" block reads the account, the
// brief's links lead to pages that exist, an unknown name and a failed load both say so, and nothing scrolls sideways.
// Seeded through onBeforeLoad with public data only: upstream's Cartethyia golden fixture (her build, nobody else).
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const S26 = { width: 412, height: 915 };
const TITLE = " — Wuthering Waves Calculator & Optimizer";

function seed(options: { theme?: string; teammates?: boolean } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      const character = JSON.parse(configOptimizer.data.character);
      if (options.teammates) {
        // her two best teammates, set up the way a first weapon sets a character up (made-up records, not an account's)
        character.characters.Ciaccona = { weapon: "WoodlandAria" };
        character.characters.Chisa = { weapon: "Kumokiri" };
      }
      win.localStorage.setItem("character", JSON.stringify(character));
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false, ...(options.theme ? { theme: options.theme } : {}) };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      const style = win.document.createElement("style");
      style.textContent = "html { font-size: 130%; }";
      win.document.head.appendChild(style);
    },
  };
}

function expectNoHorizontalScroll(what: string): void {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth, `${what} page width`).to.be.at.most(win.document.documentElement.clientWidth);
    expect(win.innerWidth, `${what} layout viewport`).to.eq(S26.width);
  });
}

type Rgba = [number, number, number, number];
/** The WCAG contrast of an element's text against what is painted behind it, colours read through a canvas (so oklch
 *  works) and backgrounds blended up to the page. */
function contrastOf(el: Element): number {
  const win = el.ownerDocument.defaultView!;
  const canvas = el.ownerDocument.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgba = (css: string): Rgba => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0]! / 255, d[1]! / 255, d[2]! / 255, d[3]! / 255];
  };
  const over = (fg: Rgba, bg: Rgba): Rgba => [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3]), 1];
  const linear = (x: number): number => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  const lum = (c: Rgba): number => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
  const layers: Rgba[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    const c = rgba(win.getComputedStyle(node).backgroundColor);
    if (c[3] > 0) layers.push(c);
    if (c[3] >= 0.999) break;
  }
  let bg: Rgba = [1, 1, 1, 1];
  for (const c of layers.reverse()) bg = over(c, bg);
  const fg = over(rgba(win.getComputedStyle(el).color), bg);
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** the pages a brief may link to */
const ROUTES = ["/kit", "/rankings", "/my-rankings", "/account", "/weapons", "/echo-plan", "/rotation", "/build-team"];

describe("resonator briefs", () => {
  beforeEach(() => cy.viewport(S26.width, S26.height));

  it("lists the briefs with the account's own first, and filters by element, role and search", () => {
    cy.visit("/kit", seed());
    cy.title().should("eq", `Resonator briefs${TITLE}`);
    cy.get("[data-test-kit-count]").invoke("text").should("match", /^\s*\d+ briefs · 1 on your account\s*$/);
    // the account's one character, with her sequence and weapon rank
    cy.get("[data-test-kit-mine] [data-test-kit-row]").should("have.length", 1);
    cy.get('[data-test-kit-mine] [data-test-kit-row="cartethyia"]').should("contain.text", "Cartethyia").and("contain.text", "S2 · Defier's Thorn R1");
    cy.get("[data-test-kit-others] [data-test-kit-row]").its("length").should("be.gte", 40);
    expectNoHorizontalScroll("the list");

    // element: only that element is left, and her own row stays (she is Aero)
    cy.get('[data-test-kit-element="Fusion"]').click().should("have.attr", "aria-pressed", "true");
    cy.get('[data-test-kit-row="aemeath"]').should("exist");
    cy.get('[data-test-kit-row="cartethyia"]').should("not.exist");
    cy.get('[data-test-kit-row="jiyan"]').should("not.exist");
    cy.get("[data-test-kit-count]").invoke("text").should("match", /^\s*\d+ of \d+ briefs\s*$/);
    cy.get('[data-test-kit-element="all"]').click();

    // role: the sustain supports, not a main DPS
    cy.get('[data-test-kit-role="sustain"]').click();
    cy.get('[data-test-kit-row="shorekeeper"]').should("exist");
    cy.get('[data-test-kit-row="aemeath"]').should("not.exist");
    cy.get('[data-test-kit-role="all"]').click();

    // search, by the name the app shows
    cy.get("[data-test-kit-search]").type("aem");
    cy.get("[data-test-kit-row]").should("have.length", 1).first().should("have.attr", "data-test-kit-row", "aemeath");
    cy.get("[data-test-kit-search]").clear().type("rover aero");
    cy.get("[data-test-kit-row]").should("have.length", 1).first().should("have.attr", "data-test-kit-row", "aero-rover");

    // nothing matches: say so, and one tap brings the list back
    cy.get("[data-test-kit-search]").clear().type("zzz");
    cy.get("[data-test-kit-row]").should("not.exist");
    cy.get("[data-test-kit-empty]").should("contain.text", "No brief matches").and("contain.text", "zzz");
    cy.get("[data-test-kit-clear]").click();
    cy.get("[data-test-kit-search]").should("have.value", "");
    cy.get('[data-test-kit-row="cartethyia"]').should("exist");
    cy.location("search").should("eq", "");

    // the filters live in the address: Back from a brief lands on the list as it was left
    cy.get('[data-test-kit-element="Fusion"]').click();
    cy.get('[data-test-kit-role="main"]').click();
    cy.location("search").should("eq", "?element=Fusion&role=main");
    cy.get('[data-test-kit-row="aemeath"]').click();
    cy.location("pathname").should("eq", "/kit/aemeath");
    cy.go("back");
    cy.location("pathname").should("eq", "/kit");
    cy.location("search").should("eq", "?element=Fusion&role=main");
    cy.get('[data-test-kit-element="Fusion"]').should("have.attr", "aria-pressed", "true");
    cy.get('[data-test-kit-role="main"]').should("have.attr", "aria-pressed", "true");
    cy.get('[data-test-kit-row="cartethyia"]').should("not.exist");
    cy.get('[data-test-kit-row="aemeath"]').should("exist");
    // an address that names an element no brief has filters nothing out
    cy.visit("/kit?element=Plasma&role=boss&q=aem", seed());
    cy.get("[data-test-kit-row]").should("have.length", 1).first().should("have.attr", "data-test-kit-row", "aemeath");
    cy.get('[data-test-kit-element="all"]').should("have.attr", "aria-pressed", "true");
    cy.get('[data-test-kit-role="all"]').should("have.attr", "aria-pressed", "true");
  });

  it("opens a brief from the list: every section, read against the account, with links that lead somewhere", () => {
    cy.visit("/kit", seed());
    cy.get('[data-test-kit-row="cartethyia"]').click();
    cy.location("pathname").should("eq", "/kit/cartethyia");
    cy.title().should("eq", `Cartethyia: resonator brief${TITLE}`);
    cy.get("[data-test-kit-title]").should("have.text", "Cartethyia");
    cy.get("[data-test-kit-account]", { timeout: 20000 }).should("be.visible");

    // whose figures these are, and in which unit
    cy.get("[data-test-kit-basis]").should("contain.text", "wuwa_calc's team DPS").and("contain.text", "his standard builds").and("contain.text", "not your account's");

    // on your account: owned at S2 with her weapon; alone, so Riley's best team and who is missing; no roster ranking saved
    cy.get("[data-test-kit-owned]").should("have.text", "You have Cartethyia at S2 with Defier's Thorn at R1.");
    cy.get("[data-test-kit-next]").invoke("text").should("match", /^You are at S2\. No sequence changes how Cartethyia is played/);
    cy.get("[data-test-kit-missing-members]").should("contain.text", "You cannot field one of Cartethyia's top teams yet").and("contain.text", "you are missing");
    cy.get("[data-test-kit-ranked]").should("not.exist");
    cy.get("[data-test-kit-rank]").should("have.attr", "href", "/my-rankings");
    cy.get('[data-test-kit-link="cost"]').should("have.attr", "href", "/account?focus=Cartethyia&section=cost");
    cy.get('[data-test-kit-link="weapons"]').should("have.attr", "href", "/weapons?focus=Cartethyia");
    cy.get('[data-test-kit-link="echo-plan"]').should("have.attr", "href", "/echo-plan");
    cy.get('[data-test-kit-link="build"]').should("not.exist"); // no team of hers she can field yet

    // the sections of the brief
    cy.get("[data-test-kit-role-section]").should("contain.text", "Cartethyia is a main DPS");
    cy.get("[data-test-kit-loop]").its("length").should("be.gte", 1);
    cy.get("[data-test-kit-cue]").invoke("attr", "href").should("match", /^\/rotation#chars=[A-Za-z]+,[A-Za-z]+,[A-Za-z]+$/);
    cy.get("[data-test-kit-no-changes]").should("be.visible");
    cy.get("[data-test-kit-sequence]").should("have.length", 6);
    cy.get("[data-test-kit-build]").its("length").should("be.gte", 1);
    cy.get("[data-test-kit-build]").first().should("have.attr", "open");
    cy.get("[data-test-kit-build]").first().should("contain.text", "Main stats").and("contain.text", "-cost").and("contain.text", "Substats, in order");
    cy.get("[data-test-kit-cost]").should("have.length", 9);
    // the Team Cost nearest to her S2 (one main DPS at S2) is the one that stands open; the rest are one line each
    cy.get('[data-test-kit-cost="s2r1mdps"]').should("have.attr", "open");
    cy.get('[data-test-kit-cost="s2r1mdps"] > summary').should("contain.text", "nearest to yours");
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team]').its("length").should("be.gte", 1);
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team-dps]').first().invoke("text").should("match", /^[\d.,]+[KM]? team DPS, wuwa_calc$/);
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team]').first().should("contain.text", "S2");
    cy.get('[data-test-kit-cost="s0r1"]').should("not.have.attr", "open");
    cy.get('[data-test-kit-cost="s0r1"] > summary').invoke("text").should("match", /S0R1 all.+ · .+team DPS/);
    cy.get('[data-test-kit-cost="s6r5"]').should("not.have.attr", "open");
    cy.get("[data-test-kit-ladder-seq]").should("contain.text", "Team DPS").and("contain.text", "S6");
    cy.get("[data-test-kit-signature]").should("contain.text", "the signature");
    expectNoHorizontalScroll("the brief");

    // a collapsed Team Cost opens on a tap and shows its best team; the others open on a second tap
    cy.get('[data-test-kit-cost="s6r5"] > summary').click();
    cy.get('[data-test-kit-cost="s6r5"] [data-test-kit-team]').first().should("be.visible").and("contain.text", "S6");
    // (a closed <details> keeps its content laid out but unpainted, which Cypress calls visible and which still has a
    // height: the fold's own `open` and the browser's checkVisibility() are what say it is shut)
    cy.get('[data-test-kit-more-teams="s6r5"]').should("not.have.attr", "open");
    cy.get('[data-test-kit-cost="s6r5"] [data-test-kit-team]').eq(1).should(($t) => expect($t[0]!.checkVisibility(), "a folded team is painted").to.eq(false));
    cy.get('[data-test-kit-more-teams="s6r5"] > summary').invoke("text").should("match", /^\d more teams? at S6R5 all$/);
    cy.get('[data-test-kit-more-teams="s6r5"] > summary').click();
    cy.get('[data-test-kit-more-teams="s6r5"]').should("have.attr", "open");
    cy.get('[data-test-kit-cost="s6r5"] [data-test-kit-team]').eq(1).should(($t) => expect($t[0]!.checkVisibility(), "an unfolded team is painted").to.eq(true));
    expectNoHorizontalScroll("the brief with a Team Cost and its other teams open");

    // every link inside the brief goes to a page of the app
    cy.get("[data-test-kit-brief] a[href]").each(($a) => {
      const href = $a.attr("href")!;
      if (href.startsWith("#")) return; // the section chips
      const path = href.split(/[?#]/)[0]!;
      expect(ROUTES.some((r) => path === r || path.startsWith(`${r}/`)), href).to.eq(true);
    });

    // Riley's table at that Team Cost, on the teams with these three
    cy.get('[data-test-kit-cost="s0r1"] [data-test-kit-team-rankings]').first().invoke("attr", "href").should("match", /^\/rankings#r=[A-Za-z]+,[A-Za-z]+,[A-Za-z]+$/);
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team-rankings]').first().invoke("attr", "href").should("match", /^\/rankings#tc=s2m&r=/);
    cy.get('[data-test-kit-cost="s6r5"] [data-test-kit-team-rankings]').first().invoke("attr", "href").should("match", /^\/rankings#tc=s6r5&r=/);
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team-mine]').first().invoke("attr", "href").should("match", /^\/rankings#tc=mine&r=.+&sb=m$/);
  });

  it("the brief's links arrive: Cost to max opens her drawer, whose Kit brief link comes back", () => {
    cy.visit("/kit/cartethyia", seed());
    cy.get('[data-test-kit-link="cost"]', { timeout: 20000 }).click();
    cy.location("pathname").should("eq", "/account");
    cy.get("[data-test-account-drawer]", { timeout: 60000 }).should("have.attr", "open");
    // on its own line under the meta line, a tap target of a finger's height
    cy.get("[data-test-account-drawer] [data-test-account-open-kit]").should("have.attr", "href", "/kit/cartethyia").and(($a) => {
      expect($a[0]!.getBoundingClientRect().height, "the link's height").to.be.at.least(30);
      expect($a[0]!.getBoundingClientRect().top, "below the meta line").to.be.at.least($a.prev()[0]!.getBoundingClientRect().bottom - 6);
    });
    cy.get("[data-test-account-drawer] [data-test-account-open-kit]").click();
    cy.location("pathname").should("eq", "/kit/cartethyia");
    cy.get("[data-test-kit-title]").should("have.text", "Cartethyia");

    // the team's link into Team rankings lands on his table with the team's three resonators picked
    cy.get('[data-test-kit-cost="s2r1mdps"] [data-test-kit-team-rankings]', { timeout: 20000 }).first().click();
    cy.location("pathname").should("eq", "/rankings");
    cy.location("hash").should("match", /^#tc=s2m&r=.*Cartethyia/);
  });

  it("a resonator who is not on the account, an address under another name, and a name nobody has", () => {
    cy.visit("/kit/aemeath", seed());
    cy.get("[data-test-kit-owned]", { timeout: 20000 }).should("have.text", "Aemeath is not on your account in this app: no weapon is equipped on them.");
    cy.get('[data-test-kit-link="cost"]').should("not.exist");
    cy.get('[data-test-kit-link="rank"]').should("exist");
    cy.get("[data-test-kit-changes] [data-test-kit-change]").should("have.length", 1).first().should("contain.text", "S1 changes only the opener");
    expectNoHorizontalScroll("a brief of a resonator not owned");

    // an app key is an address too: it settles on the brief's own
    cy.visit("/kit/RoverAeroMale", seed());
    cy.location("pathname").should("eq", "/kit/aero-rover");
    cy.get("[data-test-kit-title]").invoke("text").should("match", /^Rover Aero/);

    cy.visit("/kit/nobody-at-all", seed());
    cy.get("[data-test-kit-missing]").should("contain.text", "No brief for “nobody-at-all”");
    cy.get("[data-test-kit-missing] a").should("have.attr", "href", "/kit");
    cy.get("[data-test-kit-account]").should("not.exist");
  });

  it("with her teammates set up: the team the account can field, read at the Team Cost nearest to her sequence, and links that carry it", () => {
    cy.visit("/kit/cartethyia", seed({ teammates: true }));
    cy.get("[data-test-kit-account]", { timeout: 20000 }).should("be.visible");
    cy.get("[data-test-kit-missing-members]").should("not.exist");
    // Cartethyia · Ciaccona + Chisa, her at S2: Riley's figure at the cost that runs one main DPS at S2
    cy.get("[data-test-kit-account] [data-test-kit-team]").first().should("contain.text", "Cartethyia · Ciaccona + Chisa").and("contain.text", "S2 · Defier's Thorn R1");
    cy.get("[data-test-kit-account] [data-test-kit-team-dps]").first().invoke("text").should("match", /^\d+K team DPS, wuwa_calc$/);
    cy.get("[data-test-kit-team-basis]").should("contain.text", "is his figure on his standard builds at S2R1 DPS · R1 supports, the Team Cost nearest to your sequence, not on yours.");
    cy.get("[data-test-kit-rank]").should("have.attr", "href", "/my-rankings");
    cy.get('[data-test-kit-link="build"]').invoke("attr", "href").should("match", /^\/build-team\?members=(Ciaccona|Chisa|Cartethyia),(Ciaccona|Chisa|Cartethyia),(Ciaccona|Chisa|Cartethyia)&only=Cartethyia$/);
    cy.get('[data-test-kit-link="rotation"]').invoke("attr", "href").should("match", /^\/rotation#chars=(Ciaccona|Chisa|Cartethyia),/);
    cy.get("[data-test-kit-cue]").should("contain.text", "Cartethyia · Ciaccona + Chisa");
    // the list counts all three as the account's
    cy.visit("/kit", seed({ teammates: true }));
    cy.get("[data-test-kit-mine] [data-test-kit-row]").should("have.length", 3);
    expectNoHorizontalScroll("the list with three on the account");
  });

  it("reads at AA contrast on a light and a dark theme: links, chips, pills and the small print", () => {
    for (const theme of ["light", "dark"]) {
      cy.visit("/kit/cartethyia", seed({ theme, teammates: true }));
      cy.get("[data-test-kit-account]", { timeout: 20000 }).should("be.visible");
      cy.get("html").should("have.attr", "data-theme", theme);
      cy.get("[data-test-kit-brief]").find(".kit-link, .kit-pill, .kit-chip, .kit-muted, .kit-note, .kit-sub, .kit-team__unit, .kit-th, dt").each(($el) => {
        if (!$el.text().trim()) return;
        expect(contrastOf($el[0]!), `${theme}: "${$el.text().trim().slice(0, 40)}" (${$el[0]!.className})`).to.be.at.least(4.5);
      });
      cy.visit("/kit", seed({ theme, teammates: true }));
      cy.get("[data-test-kit-list]").find(".kit-row__name, .kit-chip, .kit-pill, .kit-muted, .kit-intro").each(($el) => {
        expect(contrastOf($el[0]!), `${theme} list: "${$el.text().trim().slice(0, 40)}" (${$el[0]!.className})`).to.be.at.least(4.5);
      });
    }
  });

  it("Lily: says before any figure that Riley's engine has her 3.8 beta kit, where her figures are on his table, and one main echo per loop", () => {
    cy.visit("/kit/lily", seed());
    cy.get("[data-test-kit-differs]", { timeout: 20000 })
      .should("contain.text", "Riley's engine still has Lily's kit from the 3.8 beta, not the released game's.")
      .and("contain.text", "Basic - Mend and Cleanse 1: hits for 74.28 % in his engine, 63.62 % in the released game");
    // above the account block and every figure
    cy.get("[data-test-kit-differs]").then(($d) => {
      const account = Cypress.$("[data-test-kit-account]")[0]!;
      expect($d[0]!.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING, "the note comes first").to.be.greaterThan(0);
    });
    // where her figures can be found on his table, and in which column
    cy.get("[data-test-kit-table-hint]").should("contain.text", "“Avg damage / rotation” heading there for team DPS");
    // a support's Team Costs raise the main DPS, not her: said, since her own S2 reads another figure in the ladder
    cy.get("[data-test-kit-support-costs]").should("contain.text", "raise the main DPS of each team, not Lily");
    // a brief whose engine kit is the released game's says nothing of the kind
    cy.visit("/kit/cartethyia", seed());
    cy.get("[data-test-kit-account]", { timeout: 20000 }).should("be.visible");
    cy.get("[data-test-kit-differs]").should("not.exist");
    cy.get("[data-test-kit-support-costs]").should("not.exist"); // she is a main DPS
    // a 4★ support is S6 at every Team Cost on his table: the line would be wrong there
    cy.visit("/kit/sanhua", seed());
    cy.get("[data-test-kit-account]", { timeout: 20000 }).should("be.visible");
    cy.get("[data-test-kit-support-costs]").should("not.exist");
    // the loop names the main echoes a build may carry as one step
    cy.visit("/kit/lily", seed());
    cy.get("[data-test-kit-loop]", { timeout: 20000 }).first().should("contain.text", "the Echo Skill of the main echo you carry (");
    expectNoHorizontalScroll("Lily's brief");
  });

  it("a damaged briefs file: says so, and Try again loads it once the file is whole; the list never fetches it", () => {
    let damaged = true;
    cy.intercept("GET", /\/src\/sim\/kits\/data\/kits\.json(?!.*import)/, (req) => {
      if (damaged) req.reply({ statusCode: 200, headers: { "content-type": "application/json" }, body: '{"_meta": {"generatedBy": "export_kits.mjs"}, "builds": [' });
      else req.continue();
    }).as("briefs");
    cy.visit("/kit", seed());
    cy.get("[data-test-kit-row]", { timeout: 20000 }).should("have.length.greaterThan", 40);
    cy.get("@briefs.all").should("have.length", 0); // the list reads the small index only
    cy.visit("/kit/cartethyia", seed());
    cy.get("[data-test-kit-failed]", { timeout: 30000 }).should("contain.text", "Cartethyia's brief did not load");
    cy.then(() => {
      damaged = false;
    });
    cy.get("[data-test-kit-retry]").click();
    cy.get("[data-test-kit-account]", { timeout: 20000 }).should("be.visible");
    cy.get("[data-test-kit-failed]").should("not.exist");
  });

  it("says so when the brief does not load, and Try again loads it", () => {
    // the briefs are a file of their own, fetched by the page; under the dev server (what CI runs) it is this address
    let fail = true;
    // (the page's own module import of that address, "…kits.json?import&url", is left alone: only the data is lost)
    cy.intercept("GET", /\/src\/sim\/kits\/data\/kits\.json(?!.*import)/, (req) => {
      if (fail) req.destroy();
      else req.continue();
    }).as("briefs");
    cy.visit("/kit/cartethyia", seed());
    cy.get("[data-test-kit-failed]", { timeout: 20000 }).should("contain.text", "Cartethyia's brief did not load");
    cy.get("[data-test-kit-title]").should("have.text", "Cartethyia"); // who it is about still shows, from the small index
    cy.then(() => {
      fail = false;
    });
    cy.get("[data-test-kit-retry]").click();
    cy.get("[data-test-kit-account]", { timeout: 20000 }).should("be.visible");
    cy.get("[data-test-kit-failed]").should("not.exist");
  });
});
