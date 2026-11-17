// Wuthering Tools+ — Ryan's Optimize team on a phone at 130 % text (phone.css § 36, a11y.css's scope). His own spec
// (teamRotations/teamOptimizer.cy.ts) drives it on a desktop viewport.
import { rotations as suomingRotations } from "../../src/characters/Suoming/presets";
import { rotations as hsinRotations } from "../../src/characters/Hsin/presets";
import { rotations as sigrikaRotations } from "../../src/characters/Sigrika/presets";

const TEAM_NAME = "Optimizer Phone Team";
const MAIN_ECHO = "ReminiscenceSuhsintheInevitable";

const echo = (echoId: string, name: string, type: number, stat: string, subType: string, subValue: number) => ({
  echoId,
  echo: name,
  type,
  rank: 5,
  stat,
  echoSet: "HeartofSwornVigil",
  echoSubStatsType1: subType,
  echoSubStatsValue1: subValue,
});

const inventoryEchoes = [
  echo("main-1", MAIN_ECHO, 4, "CritDMG", "ATK", 80),
  echo("main-2", MAIN_ECHO, 4, "CritDMG", "CritRate", 6),
  echo("four-a", "SentryConstruct", 4, "CritRate", "CritDMG", 15),
  echo("three-a", "FrostbiteColeoid", 3, "Electro", "ATK", 60),
  echo("three-b", "IceglintDancer", 3, "Electro", "CritRate", 9),
  echo("three-c", "Ironhoof", 3, "ATK", "CritDMG", 12),
  echo("one-a", "ShadowStepper", 1, "ATK", "CritRate", 10),
  echo("one-b", "Hoochief", 1, "ATK", "CritDMG", 20),
  echo("one-c", "SnipSnap", 1, "ATK", "CritRate", 7),
];

const actionsFor = (presets: any[], slot: number, startOrder: number) =>
  presets[0].data.actions.map((action: any, index: number) => ({ ...action, id: `s${slot}-${index}`, slot, order: startOrder + index }));

function seed(theme: string) {
  const suoming = actionsFor(suomingRotations as any[], 0, 1);
  const hsin = actionsFor(hsinRotations as any[], 1, suoming.length + 1);
  const character = (weapon: string) => ({ weapon, mainEcho: { echo: MAIN_ECHO, rank: 5, buffs: {} }, optimizer: { echoSets: ["HeartofSwornVigil"], mainEchoes: [MAIN_ECHO] } });
  return (win: Window) => {
    win.localStorage.setItem("settings", JSON.stringify({ config: { theme, useClassicUi: false }, labs: { teamOptimizer: { isEnabled: true } } }));
    win.localStorage.setItem("character", JSON.stringify({ characters: { Suoming: character("EmeraldOfGenesis"), Hsin: character("BloomingJadehaven") }, activeCharacter: "Suoming", favoriteCharacters: [] }));
    win.localStorage.setItem("inventory", JSON.stringify({ echoes: inventoryEchoes, equipped: {}, echoPresets: [], equippedPresets: {} }));
    win.localStorage.setItem(
      "teamRotations",
      JSON.stringify({
        teams: [{ id: "team-optimizer-phone", name: TEAM_NAME, characterIds: ["Suoming", "Hsin", null], buildIds: [null, null, null], actions: [...suoming, ...hsin], duration: 25, mode: "basic", enemyConfig: { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" } }],
        favoriteTeamIds: [],
        favoritePresetNames: [],
      }),
    );
  };
}

function results(width: number, height: number, theme: string) {
  cy.viewport(width, height);
  cy.visit("/teams", {
    onBeforeLoad: seed(theme),
    onLoad(win) {
      const style = win.document.createElement("style");
      style.textContent = "html { font-size: 130%; }";
      win.document.head.appendChild(style);
    },
  });
  cy.get(`[data-test-team-rotations-item="${TEAM_NAME}"]`).contains(TEAM_NAME).click();
  cy.get("[data-test-team-rotation-editor]").should("be.visible");
  cy.get("[data-test-team-rotation-summary-optimize]:visible").first().click();
  cy.get("[data-test-team-optimizer-run]").should("not.be.disabled").click();
  cy.get("[data-test-team-optimizer-results]", { timeout: 60000 }).should("be.visible");
}

describe("Optimize team's Edit drawer", () => {
  // Whole account's default: the member is pinned to "Account plan", the active build stays "Default build"
  const pinned = (win: Window) => {
    seed("dark")(win);
    const stored = JSON.parse(win.localStorage.getItem("character")!);
    const fields = () => JSON.parse(JSON.stringify({ weapon: "EmeraldOfGenesis", mainEcho: { echo: MAIN_ECHO, rank: 5, buffs: {} }, optimizer: { echoSets: ["HeartofSwornVigil"], mainEchoes: [MAIN_ECHO], minStats: [{ id: "blank", stat: null, minValue: null }] } }));
    stored.characters.Suoming = { ...fields(), activeBuildId: "default", builds: [{ id: "default", name: "Default build", ...fields() }, { id: "plan", name: "Account plan", ...fields() }] };
    win.localStorage.setItem("character", JSON.stringify(stored));
    const teams = JSON.parse(win.localStorage.getItem("teamRotations")!);
    teams.teams[0].buildIds = ["plan", null, null];
    win.localStorage.setItem("teamRotations", JSON.stringify(teams));
  };
  const suoming = (win: Window) => JSON.parse(win.localStorage.getItem("character")!).characters.Suoming;

  it("keeps a run's sets out of the saved filter, and saves an echo buff switch on the build the team pins", () => {
    cy.viewport(412, 915);
    cy.visit("/teams", { onBeforeLoad: pinned });
    cy.get(`[data-test-team-rotations-item="${TEAM_NAME}"]`).contains(TEAM_NAME).click();
    cy.get("[data-test-team-rotation-summary-optimize]:visible").first().click();
    cy.get("[data-test-team-optimizer-run]").should("not.be.disabled");
    // a stat floor row left on "Choose a stat" is not a minimum
    cy.get("[data-test-team-optimizer-minimums]").should("not.exist");
    cy.get('[data-test-team-optimizer-edit="0"]').click();
    cy.get("[data-test-team-optimizer-drawer-scope]")
      .should("be.visible")
      .and("contain", "for this team run only")
      .and("contain", 'saved on Suoming\'s build "Account plan", the one this team uses');
    cy.get("[data-test-team-optimizer-drawer]").within(() => {
      cy.get('[data-test-optimizer-workspace-echo-set="MoonlitClouds"]').click();
      cy.get('[data-test-echo-set-passive-enabled="HeartofSwornVigilElectro"]').should("not.be.checked").check({ force: true });
      cy.get('[data-test-echo-set-passive-enabled="HeartofSwornVigilElectro"]').should("be.checked"); // the drawer shows what it wrote
    });
    cy.get("[data-test-team-optimizer-drawer-done]").click();
    cy.contains("Moonlit Clouds").should("be.visible"); // the run has the set
    cy.window().should((win) => {
      const record = suoming(win);
      expect(record.builds[1].optimizer.echoSetPassives.HeartofSwornVigilElectro.isEnabled, "the pinned build has the switch").to.equal(true);
      expect(record.optimizer.echoSetPassives?.HeartofSwornVigilElectro, "the active build's switch is as it was").to.equal(undefined);
      for (const optimizer of [record.optimizer, record.builds[0].optimizer, record.builds[1].optimizer]) {
        expect(optimizer.echoSets, "no saved set filter changed").to.deep.equal(["HeartofSwornVigil"]);
        expect(optimizer.mainEchoes).to.deep.equal([MAIN_ECHO]);
        expect(optimizer.minStats, "the saved blank row is left where it is").to.deep.equal([{ id: "blank", stat: null, minValue: null }]);
      }
    });
    // opened again, the drawer starts from the run's choice, not the saved filter
    cy.get('[data-test-team-optimizer-edit="0"]').click();
    cy.get('[data-test-team-optimizer-drawer] [data-test-optimizer-workspace-echo-set="MoonlitClouds"]').should("have.class", "border-primary");
    cy.get("[data-test-team-optimizer-drawer-done]").click();
    cy.get("[data-test-team-optimizer-run]").should("not.be.disabled").click();
    cy.get("[data-test-team-optimizer-results]", { timeout: 60000 }).should("be.visible");
  });
});

describe("Optimize team's Save", () => {
  const builds = (win: Window) => ["Suoming", "Hsin"].map((id) => (JSON.parse(win.localStorage.getItem("character")!).characters[id].builds ?? []).length);

  it("saves a result once, then says there is nothing to save", () => {
    results(412, 915, "dark");
    cy.get("[data-test-team-optimizer-nothing-to-save]").should("not.exist");
    cy.get("[data-test-team-optimizer-save]").click();
    cy.get("[data-test-team-optimizer-confirm-save]").click();
    cy.get("[data-test-team-optimizer-saved]").should("contain", "Saved.");
    // the result is now what the team wears: no second Save to stack a copy with the same name
    cy.get("[data-test-team-optimizer-nothing-to-save]").should("be.visible").and("contain", "Nothing to save: these are the builds this team already wears.");
    cy.get("[data-test-team-optimizer-save]").should("not.exist");
    cy.window().then((win) => {
      const saved = builds(win);
      // run again from the saved builds: the same result comes back, and it is not offered for saving
      cy.get("[data-test-team-optimizer-edit-setup]").click();
      cy.get("[data-test-team-optimizer-run]").should("not.be.disabled").click();
      cy.get("[data-test-team-optimizer-results]", { timeout: 60000 }).should("be.visible");
      // the headline's own text, whole: a figure that did not move has no sign since Ryan's #703 ("+0.00% vs current"
      // until then), and the total's digits sit right before it in the container's text
      cy.contains("[data-test-team-optimizer-results] span", "vs current").should(($delta) => expect($delta.text().replace(/\s+/g, " ").trim()).to.eq("0.00% vs current"));
      cy.get("[data-test-team-optimizer-nothing-to-save]").should("be.visible");
      cy.get("[data-test-team-optimizer-save]").should("not.exist");
      cy.window().should((after) => expect(builds(after)).to.deep.equal(saved));
    });
  });
});

describe("Optimize team on a phone at 130 % text", () => {
  for (const [width, height] of [[412, 915], [360, 800]] as const) {
    it(`names every stat tile and shows the team's change whole at ${width} px`, () => {
      results(width, height, "dark");
      cy.get("[data-test-optimizer-workspace-result-highlights]").first().within(() => {
        // the caption beside each tile's icon: none cut off, so Crit Rate and Crit DMG can be told apart
        cy.get(".uppercase").should("have.length", 6).each(($caption) => {
          expect($caption[0].scrollWidth, `"${$caption.text()}" fits its tile`).to.be.at.most($caption[0].clientWidth + 1);
          expect($caption[0].getBoundingClientRect().height, `"${$caption.text()}" is on the page`).to.be.greaterThan(0);
        });
        cy.get("img").each(($icon) => {
          expect($icon[0].ownerDocument.defaultView!.getComputedStyle($icon[0]).filter, `${$icon.attr("alt")} icon on a dark tile`).to.equal("none");
        });
        cy.get(".font-mono.text-sm").each(($value) => {
          const tile = $value[0].closest(".card")!.getBoundingClientRect();
          expect($value[0].getBoundingClientRect().right, `${$value.text()} inside its tile`).to.be.at.most(tile.right);
        });
      });
      cy.get("[data-test-team-optimizer-results] .overflow-x-auto").then(($scroller) => {
        const right = $scroller[0].getBoundingClientRect().right;
        const head = [...$scroller[0].querySelectorAll("th")].find((th) => th.textContent?.trim() === "vs current")!;
        expect(head.getBoundingClientRect().right, "\"vs current\" whole, with no scrolling").to.be.at.most(right);
      });
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, "no sideways page scroll").to.be.at.most(width);
      });
    });
  }

  it("keeps its status colours and captions readable on a light theme", () => {
    results(412, 915, "light");
    const ratio = (el: Element): number => {
      const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
      const rgb = (color: string): number[] => {
        canvas.clearRect(0, 0, 1, 1);
        canvas.fillStyle = color;
        canvas.fillRect(0, 0, 1, 1);
        return [...canvas.getImageData(0, 0, 1, 1).data];
      };
      const view = el.ownerDocument.defaultView!;
      let bg = [255, 255, 255, 255];
      for (let p: Element | null = el; p; p = p.parentElement) {
        const c = rgb(view.getComputedStyle(p).backgroundColor);
        if (c[3]! > 250) {
          bg = c;
          break;
        }
      }
      let opacity = 1;
      for (let p: Element | null = el; p; p = p.parentElement) opacity *= Number(view.getComputedStyle(p).opacity);
      const fg = rgb(view.getComputedStyle(el).color);
      const alpha = (fg[3]! / 255) * opacity;
      const mixed = [0, 1, 2].map((i) => fg[i]! * alpha + bg[i]! * (1 - alpha));
      const lum = (c: number[]): number => {
        const f = (v: number): number => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!);
      };
      const [a, b] = [lum(mixed), lum(bg)];
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    // the stat tile icons are white art: inverted on a light tile, or they are white on white
    cy.get("[data-test-optimizer-workspace-result-highlights] img").should("have.length.at.least", 6).each(($icon) => {
      expect($icon[0].ownerDocument.defaultView!.getComputedStyle($icon[0]).filter, `${$icon.attr("alt")} icon on a light tile`).to.equal("invert(1)");
    });
    cy.get("[data-test-team-optimizer-results]").within(() => {
      cy.get(".text-success, .text-warning, .opacity-50, .opacity-60").filter(":visible").each(($el) => {
        if ($el[0].children.length || !$el.text().trim()) return;
        expect(ratio($el[0]), `"${$el.text().trim().slice(0, 24)}"`).to.be.at.least(4.5);
      });
    });
  });
});

// Hunt 2, phone flows L2: Optimize team is a view inside /teams with no history entry, so Back, a tap on another page
// or "Back to team" dropped its result, and stopped a search in flight, with no word. The last result is now kept for
// the visit and shown again; a search that leaving stopped says so (src/sim/teamContext/teamOptimizerKept.ts).
describe("Optimize team when you leave the page", () => {
  const openOptimizer = () => cy.get("[data-test-team-rotation-summary-optimize]:visible").first().click();

  it("shows the last result again after another page and Back, and after Back to team, until it is put down", () => {
    results(412, 915, "dark");
    cy.get("[data-test-team-optimizer-kept-note]").should("not.exist"); // a search made on this visit needs no line
    cy.get("[data-test-team-optimizer-total]")
      .invoke("text")
      .then((total) => {
        // another page from the bottom bar, then Back
        cy.contains("[data-test-nav-bottom-bar] a", "Inventory").click();
        cy.location("pathname").should("eq", "/inventory");
        cy.go("back");
        cy.location("pathname").should("eq", "/teams");
        openOptimizer();
        cy.get("[data-test-team-optimizer-results]").should("be.visible");
        cy.get("[data-test-team-optimizer-total]").should("have.text", total);
        cy.get('[data-test-team-optimizer-kept-note="kept"]')
          .should("be.visible")
          .and("contain.text", "This is the result of your last search here")
          .and("contain.text", "Nothing it read has changed since")
          .then(($note) => {
            const r = $note[0].getBoundingClientRect();
            expect(r.left, "note left").to.be.at.least(0);
            expect(r.right, "note right").to.be.at.most(412);
          });
        // the kept result still saves: its Save button is the result's own
        cy.get("[data-test-team-optimizer-save], [data-test-team-optimizer-nothing-to-save]").should("be.visible");
        // "Back to team" and in again: still there
        cy.get("[data-test-team-optimizer-back]").click();
        cy.get("[data-test-team-rotation-editor]").should("be.visible");
        openOptimizer();
        cy.get("[data-test-team-optimizer-total]").should("have.text", total);
        // "Edit & run again" puts it down: no line, and the next visit opens on the setup
        cy.get("[data-test-team-optimizer-edit-setup]").click();
        cy.get("[data-test-team-optimizer-kept-note]").should("not.exist");
        cy.get("[data-test-team-optimizer-back]").click();
        openOptimizer();
        cy.get("[data-test-team-optimizer-run]").should("be.visible");
        cy.get("[data-test-team-optimizer-results]").should("not.exist");
        cy.get("[data-test-team-optimizer-kept-note]").should("not.exist");
      });
  });

  it("says that leaving stopped a search, until the next search", () => {
    cy.viewport(412, 915);
    cy.visit("/teams", { onBeforeLoad: seed("dark") });
    cy.get(`[data-test-team-rotations-item="${TEAM_NAME}"]`).contains(TEAM_NAME).click();
    openOptimizer();
    cy.get("[data-test-team-optimizer-run]").should("not.be.disabled");
    // a search that does not end: its workers never answer
    let RealWorker: typeof Worker;
    cy.window().then((win) => {
      RealWorker = win.Worker;
      (win as any).Worker = class {
        onmessage = null;
        onerror = null;
        postMessage() {}
        terminate() {}
        addEventListener() {}
        removeEventListener() {}
      };
    });
    cy.get("[data-test-team-optimizer-run]").click();
    cy.get("[data-test-team-optimizer-running]").should("be.visible");
    cy.get("[data-test-team-optimizer-back]").click();
    cy.get("[data-test-team-rotation-editor]").should("be.visible");
    cy.window().then((win) => {
      (win as any).Worker = RealWorker;
    });
    openOptimizer();
    cy.get('[data-test-team-optimizer-kept-note="stopped"]').should("be.visible").and("have.text", "Your last search here stopped when you left this page: it runs only while this page is open. Run it again for its result.");
    cy.get("[data-test-team-optimizer-results]").should("not.exist");
    cy.get("[data-test-team-optimizer-run]").should("not.be.disabled").click();
    cy.get("[data-test-team-optimizer-results]", { timeout: 60000 }).should("be.visible");
    cy.get("[data-test-team-optimizer-kept-note]").should("not.exist");
  });
});

// Hunt 2, solver L1: an action that switches a weapon effect for that action alone is not read by his search for an
// effect an attack reads itself (here Solsworn Ciphers' Echo Skill DMG Amplification, switched off on every action of
// Sigrika's). The rows are the Team page's figures either way; his page then asked for a report in the Discord.
describe("Optimize team on a team with a per-action weapon switch", () => {
  it("says what the search cannot read, where his alert asked the player to report the team", () => {
    const sigrika = actionsFor(sigrikaRotations as any[], 0, 1).map((action: any) => ({ ...action, advancedConfig: { weaponPassives: { SolswornCiphersDmgDeepen: { isEnabled: false } } } }));
    const hsin = actionsFor(hsinRotations as any[], 1, sigrika.length + 1);
    cy.viewport(412, 915);
    cy.visit("/teams", {
      onBeforeLoad(win) {
        seed("dark")(win);
        const stored = JSON.parse(win.localStorage.getItem("character")!);
        stored.characters = {
          Sigrika: { ...stored.characters.Suoming, weapon: "SolswornCiphers", weaponPassives: { SolswornCiphersDmgDeepen: { isEnabled: true } } },
          Hsin: stored.characters.Hsin,
        };
        stored.activeCharacter = "Sigrika";
        win.localStorage.setItem("character", JSON.stringify(stored));
        const teams = JSON.parse(win.localStorage.getItem("teamRotations")!);
        teams.teams[0] = { ...teams.teams[0], characterIds: ["Sigrika", "Hsin", null], actions: [...sigrika, ...hsin] };
        win.localStorage.setItem("teamRotations", JSON.stringify(teams));
      },
      onLoad(win) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130%; }";
        win.document.head.appendChild(style);
      },
    });
    cy.get(`[data-test-team-rotations-item="${TEAM_NAME}"]`).contains(TEAM_NAME).click();
    cy.get("[data-test-team-rotation-summary-optimize]:visible").first().click();
    cy.get("[data-test-team-optimizer-run]").should("not.be.disabled").click();
    cy.get("[data-test-team-optimizer-results]", { timeout: 60000 }).should("be.visible");
    cy.get("[data-test-team-optimizer-override-note]")
      .should("be.visible")
      .and("contain.text", "Sigrika has an action that switches a weapon effect for that action alone")
      .and("contain.text", "the search cannot read such a switch")
      .and("contain.text", "nothing shown is wrong")
      .then(($note) => {
        const r = $note[0].getBoundingClientRect();
        expect(r.left, "note left").to.be.at.least(0);
        expect(r.right, "note right").to.be.at.most(412);
        // the two figures it names are the search's and the page's, and the page's is the headline
        const [search, page] = ($note.text().match(/\d[\d,]*\d/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
        expect(search, "the search's score").to.be.greaterThan(page);
        cy.get("[data-test-team-optimizer-total]").should(($total) => expect(Number($total.text().replace(/[^0-9]/g, ""))).to.equal(page));
      });
    cy.get("[data-test-team-optimizer-mismatch]").should("not.exist");
    cy.get("[data-test-team-optimizer-results]").should("not.contain.text", "Discord");
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth, "no sideways page scroll").to.be.at.most(412));
  });
});
