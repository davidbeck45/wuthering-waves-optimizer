// Wuthering Tools+: builds with two buffs on that the game does not allow together (src/sim/buffConflicts/). Ryan's
// `mutuallyExclusiveWith` acts when a switch is flipped, never on a build saved before he marked the pair, so such a
// build counts both on every page. A made-up account: a Sigrika saved with Schemata of Runes and Soliskin Vitality both
// on (the engine counts both), a second saved build of hers with the same, two armed teammates so a team is fieldable,
// and a Brant with both Moments on (the engine already takes one alone: no figure moves).
const both = { SchemataofRunes: { isEnabled: true }, SoliskinVitality: { isEnabled: true, stacks: 60 }, InnateGift: { isEnabled: true, stacks: 2 } };
const sigrika = { weapon: "SolswornCiphers", weapons: { SolswornCiphers: { refinement: "1" } }, buffs: both };

function account(): Record<string, unknown> {
  return {
    activeCharacter: "Qiuyuan",
    favoriteCharacters: [],
    characters: {
      Sigrika: {
        ...sigrika,
        activeBuildId: "b1",
        builds: [
          { id: "b1", name: "Default build", createdAt: 1, updatedAt: 1, ...sigrika },
          { id: "b2", name: "Old save", createdAt: 2, updatedAt: 2, ...sigrika },
        ],
      },
      // Sigrika · Qiuyuan + Lucilla is a stock team (Mornye + Lucilla was, until Riley's table of 2026-11-22)
      Qiuyuan: { weapon: "EmeraldSentence" },
      Lucilla: { weapon: "Stringmaster" },
      Brant: { weapon: "UnflickeringValor", buffs: { MyMoment: { isEnabled: true }, TheatricalMoment: { isEnabled: true } } },
    },
  };
}

function seed(options: { fontScale?: number } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear(); // score on this visit, never a previous test's ranking
      win.localStorage.setItem("character", JSON.stringify(account()));
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

const NOTICE = '[data-test-buff-conflict="Sigrika"][data-conflict-build="in-use"]';
const number = (text: string): number => Number(text.replace(/[^0-9]/g, ""));
const stored = (win: Window): Record<string, any> => JSON.parse(win.localStorage.getItem("character") ?? "{}").characters;
/** the three figures of one block of the notice: as saved, only the first, only the second */
const figures = (block: string) => cy.get(`${NOTICE} [data-test-buff-conflict-${block}] dd b`, { timeout: 120000 }).then(($b) => [...$b].map((el) => number(el.textContent ?? "")));

describe("buffs that cannot be on together", () => {
  it("says so on /account with the figures three ways, and changes nothing until one is kept", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    cy.get(`${NOTICE} [data-test-buff-conflict-headline]`, { timeout: 120000 }).should("have.text", "Sigrika has two buffs on that cannot be active together in the game: Schemata of Runes and Soliskin Vitality.");
    cy.get(`${NOTICE} [data-test-buff-conflict-consequence]`).should("have.text", "Sigrika's figures count both, so they read too high.");
    // the best rotation and the team: as saved above either one alone
    for (const block of ["rotation", "team"]) {
      figures(block).then(([saved, first, second]) => {
        expect(first, `${block}: only Schemata of Runes`).to.be.greaterThan(0).and.lessThan(saved);
        expect(second, `${block}: only Soliskin Vitality`).to.be.greaterThan(0).and.lessThan(saved);
      });
    }
    cy.get(`${NOTICE} [data-test-buff-conflict-rotation] dt`).then(($dt) => expect([...$dt].map((el) => el.textContent)).to.deep.equal(["Both on, as saved", "Only Schemata of Runes", "Only Soliskin Vitality"]));
    cy.get(`${NOTICE} [data-test-buff-conflict-team]`).should("contain.text", "Team Sigrika · Qiuyuan + Lucilla");
    cy.get(`${NOTICE}`).should("contain.text", "Average damage per rotation").and("contain.text", "enemy level 100 at 20 % RES");
    // his own description of each, for choosing
    cy.get(`${NOTICE} details summary`).click();
    cy.get(`${NOTICE} details`).should("contain.text", "at least 30 points of Soliskin Vitality").and("contain.text", "(saved at 60)");
    // the other saved build has the pair too: named, and with no one-tap change (it is not the build shown)
    cy.get('[data-test-buff-conflict="Sigrika"][data-conflict-build="saved"]').should("contain.text", 'Sigrika\'s saved build "Old save" has two buffs on').find("[data-test-buff-conflict-keep]").should("not.exist");
    // Brant's pair moves no figure: one quiet line, folded, no warning card
    cy.get('[data-test-buff-conflict="Brant"]').should("not.exist");
    cy.get("[data-test-buff-conflicts-quiet]").should("contain.text", "1 more pair of buffs on together that move no figure").find("summary").click();
    cy.get('[data-test-buff-conflict-quiet="Brant"]').should("contain.text", "The engine already counts only").and("contain.text", "so no figure reads too high");

    // working the figures out changed nothing
    cy.window().then((win) => {
      expect(stored(win).Sigrika.buffs.SchemataofRunes.isEnabled).to.equal(true);
      expect(stored(win).Sigrika.buffs.SoliskinVitality).to.deep.equal({ isEnabled: true, stacks: 60 });
      expect(win.localStorage.getItem("wtplus:buildHistory:v1:Sigrika")).to.equal(null);
    });

    // keep one: a Build history version first, then exactly his switch's update on the build in use
    figures("rotation").then(([, onlySchemata]) => {
      cy.get(`${NOTICE} [data-test-buff-conflict-keep="0"]`).should("have.text", "Keep only Schemata of Runes").click();
      // the pressed button goes with its notice: focus lands on the line that says what happened
      cy.get("[data-test-buff-conflict-kept]").should("contain.text", "Kept only Schemata of Runes on Sigrika; Soliskin Vitality is now off.").and("contain.text", "Build history").and("have.focus");
      cy.get(NOTICE).should("not.exist");
      cy.window().then((win) => {
        const s = stored(win).Sigrika;
        expect(s.buffs.SchemataofRunes.isEnabled).to.equal(true);
        expect(s.buffs.SoliskinVitality).to.deep.equal({ isEnabled: false, stacks: 60 }); // the stacks stay as saved
        expect(s.buffs.InnateGift).to.deep.equal({ isEnabled: true, stacks: 2 });
        expect(s.builds[1].buffs.SoliskinVitality.isEnabled, "the other saved build is left alone").to.equal(true);
        const history = JSON.parse(win.localStorage.getItem("wtplus:buildHistory:v1:Sigrika") ?? "{}");
        expect(history.versions).to.have.length(1);
        expect(history.versions[0].label).to.equal("before-buff-fix");
        expect(history.versions[0].payload.members[0].config.buffs.SoliskinVitality).to.deep.equal({ isEnabled: true, stacks: 60 });
      });
      // the page scored again: her roster figure is the one the notice gave for "only Schemata of Runes"
      cy.get('[data-test-buff-conflict="Sigrika"][data-conflict-build="saved"]').should("exist");
      cy.visit("/my-rankings");
      cy.get('[data-test-my-rankings-row="Sigrika"] [data-test-my-rankings-damage]', { timeout: 120000 }).should(($el) => expect(number($el.text())).to.equal(onlySchemata));
      cy.get('[data-test-my-rankings-reads-high="Sigrika"]').should("not.exist");
    });
    // the version reads as what it is in Build history
    cy.visit("/build-history?char=Sigrika");
    cy.contains("Before keeping one of two buffs", { timeout: 60000 }).should("be.visible");
  });

  it("flags her /my-rankings row, where the figure is the notice's as saved, and opens her buffs in the calculator", () => {
    cy.viewport(1440, 900);
    cy.visit("/my-rankings", seed());
    cy.get('[data-test-my-rankings-reads-high="Sigrika"]', { timeout: 120000 }).should("be.visible").and("contain.text", "Reads too high");
    cy.get('[data-test-my-rankings-reads-high="Brant"]').should("not.exist"); // no figure of his is too high
    cy.get('[data-test-my-rankings-expand="Sigrika"]').click();
    figures("rotation").then(([saved]) => {
      cy.get('[data-test-my-rankings-row="Sigrika"] [data-test-my-rankings-damage]').should(($el) => expect(number($el.text())).to.equal(saved));
    });
    cy.get('[data-test-my-rankings-details="Sigrika"] [data-test-buff-conflict-open="Sigrika"]').first().should("have.text", "Open Sigrika's buffs in the calculator").click();
    cy.location("pathname").should("eq", "/");
    cy.get('[data-test-workspace-buff-card="SchemataofRunes"]', { timeout: 60000 }).should("be.visible");
    cy.get('[data-test-workspace-buff-card="SoliskinVitality"]').should("exist");
    cy.window().then((win) => expect(JSON.parse(win.localStorage.getItem("character") ?? "{}").activeCharacter).to.equal("Sigrika"));
  });

  for (const width of [412, 360]) {
    it(`fits the character drawer on a phone ${width} px wide at 130 % text`, () => {
      cy.viewport(width, 915);
      cy.visit("/account?focus=Sigrika", seed({ fontScale: 1.3 }));
      cy.get("[data-test-account-drawer]", { timeout: 120000 }).should("have.attr", "open");
      const inDrawer = `[data-test-account-drawer] ${NOTICE}`;
      cy.get(`${inDrawer} [data-test-buff-conflict-rotation] dd b`, { timeout: 120000 }).should("have.length", 3);
      // only her pairs in her drawer, and never the quiet list
      cy.get("[data-test-account-drawer] [data-test-buff-conflict]").should("have.length", 2);
      cy.get("[data-test-account-drawer] [data-test-buff-conflicts-quiet]").should("not.exist");
      cy.get(`${inDrawer} button`).each(($btn) => {
        const r = $btn[0].getBoundingClientRect();
        // the layout height: the drawer is still easing in when this runs, and its box's rect reads a fraction short
        expect($btn[0].offsetHeight, `"${$btn.text().trim()}" height`).to.be.at.least(40);
        expect(r.left, `"${$btn.text().trim()}" left`).to.be.at.least(0);
        expect(r.right, `"${$btn.text().trim()}" right`).to.be.at.most(width);
      });
      cy.get(`${inDrawer} *`).each(($el) => {
        const r = $el[0].getBoundingClientRect();
        if (r.width > 0) expect(r.right, `${$el[0].tagName}.${$el[0].className} right edge`).to.be.at.most(width + 0.5);
      });
      cy.document().then((doc) => expect(doc.documentElement.scrollWidth, "page width").to.be.at.most(doc.documentElement.clientWidth));
      // the drawer still closes with the notice in it (Escape is the native dialog's own, which a synthetic key cannot reach)
      cy.get("[data-test-account-drawer-close]").click();
      cy.get("[data-test-account-drawer]").should("not.have.attr", "open");
    });
  }
});
