// Wuthering Tools+: Riley31415/wuwa_calc's S6R5 loops and full-team rotations
// ship as stock presets (src/sim/presets/) next to the curated ones.
import * as manifestModule from "../../src/sim/presets/data/manifest.json";
import { parsePresetName } from "../../src/sim/presets/presetName";

const manifest = ((manifestModule as { default?: unknown }).default ?? manifestModule) as { characters: string[] };
/** Every teammate a generated name lists is a character this app has stock loops for: the generator files a loop only
 *  under a character the app registers, and each of Riley's resonators has loops of its own. */
const namesOnlyAppCharacters = (name: string): boolean => {
  const mates = parsePresetName(name).teammateKeys;
  return mates.length === 2 && mates.every((key) => manifest.characters.includes(key));
};

describe("wuwa_calc stock presets", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("lists Riley's S6R5 loops in the rotation presets modal and imports one", () => {
    cy.richSelect("[data-test-character-select]", "YangyangXuanling", { search: "Xuanling" });
    cy.get(".character__self-buffs").should("be.visible");
    cy.get('[data-test-calculator-nav="rotations"]').click();
    cy.get('[data-test="rotations-overflow-menu"]').click();
    cy.get('[data-test-rotations-action="presets"]').click();
    // assert on the dialog's open state, not on visibility: DaisyUI's open
    // transition (opacity 0 → 1) never advances in a frame-starved headless run
    cy.get("[data-test-rotations-presets-modal]").should("have.attr", "open");
    // the sequence-breakpoints table (Track I phase 2): Xuanling's S2 changes her start-of-combat chain, not the loop
    // (S1 until Riley's 9dbffa1, 2026-10-20)
    cy.get("[data-test-rotations-breakpoints]").should("contain.text", "Sequence breakpoints").and("contain.text", "S2 changes only the opener");
    cy.contains("[data-test-rotations-presets] .card", "(wuwa_calc)")
      .first()
      .within(() => {
        cy.contains("Author: Riley31415 (wuwa_calc)").should("exist");
        cy.contains("button", "Import").click({ force: true });
      });
    cy.get("[data-test-rotations-presets-modal]").should("not.have.attr", "open");
    cy.get('[data-test-rotation-item-by-name*="(wuwa_calc)"]').should("exist");
  });

  const openPresetsOf = (key: string, search: string): void => {
    cy.richSelect("[data-test-character-select]", key, { search });
    cy.get(".character__self-buffs").should("be.visible");
    cy.get('[data-test-calculator-nav="rotations"]').click();
    cy.get('[data-test="rotations-overflow-menu"]').click();
    cy.get('[data-test-rotations-action="presets"]').click();
    cy.get("[data-test-rotations-presets-modal]").should("have.attr", "open");
  };
  /** every wuwa_calc card in the open modal names two teammates the app has */
  const everyCardIsFieldable = (): void => {
    cy.get("[data-test-rotations-presets] .card-title").then(($titles) => {
      const names = [...$titles].map((el) => el.textContent ?? "").filter((name) => name.includes("(wuwa_calc)"));
      expect(names.length, "wuwa_calc cards").to.be.greaterThan(0);
      for (const name of names) expect(namesOnlyAppCharacters(name), name).to.equal(true);
    });
  };

  // 2026-11-02 to 11-16 the app had no Lily, and Riley's loops beside her were renamed after a team of their own the
  // app could field, or left out (Galbrena's best S6R5 loop read "Lupa + Qiuyuan"). Ryan's 3.8 released her: the loops
  // ship under their real names with that team's numbers. The rule itself stays, for the next kit Riley has first.
  it("offers Riley's loops beside Lily under her name, and none beside a resonator the app has no character for", () => {
    // the check, on a made-up resonator and on a real one: it has to be able to say no
    expect(namesOnlyAppCharacters("Galbrena S6 Lux & Umbra R5 · Nobody + Qiuyuan · S6R5 (wuwa_calc)")).to.equal(false);
    expect(namesOnlyAppCharacters("Galbrena S6 Lux & Umbra R5 · Lily + Qiuyuan · S6R5 (wuwa_calc)")).to.equal(true);
    openPresetsOf("Galbrena", "Galbrena");
    cy.contains("[data-test-rotations-presets] .card", "Lily + Qiuyuan · S6R5 (wuwa_calc)").invoke("text").should("match", /Team: Lily \+ Qiuyuan \(main DPS\): [\d,]+ DPS for Galbrena/);
    cy.get("[data-test-rotations-presets] .card").should("have.length.greaterThan", 1);
    everyCardIsFieldable();
  });

  it("lists Lily's own loop on her released kit: no motion value differs from the game's", () => {
    openPresetsOf("Lily", "Lily");
    cy.contains("[data-test-rotations-presets] .card", "Lily S6 Lullaby R5 · Phrolova + Qiuyuan · S6R5 (wuwa_calc)")
      .invoke("text")
      .should("match", /Team: Phrolova \+ Qiuyuan: [\d,]+ DPS for Lily of [\d,]+ team DPS/)
      // her kit was the 3.8 beta's until Riley's 2026-11-21 update, and the card listed the values that differed
      .and("not.match", /differ/);
    everyCardIsFieldable();
    cy.contains("[data-test-rotations-presets] .card", "Lily S6 Lullaby R5 · Phrolova + Qiuyuan · S6R5 (wuwa_calc)").within(() => {
      cy.contains("button", "Import").click({ force: true });
    });
    cy.get("[data-test-rotations-presets-modal]").should("not.have.attr", "open");
    cy.get('[data-test-rotation-item-by-name*="Phrolova + Qiuyuan"]').should("exist");
  });

  // 2026-11-04: each state keeps three loops the app can play, whatever its best ran beside. Hiyuki's only stock build
  // on a 4-cost ATK% was her S6R1 loop beside Lily and Lucilla; on Riley's 2026-11-22 table it is Chisa + Lucilla, a loop
  // that presses what one of her 4-cost Crit DMG loops presses, kept since the emitter dedupes by echo build too
  it("keeps Hiyuki's stock build on 43311 ATK: her loop beside Chisa and Lucilla", () => {
    openPresetsOf("Hiyuki", "Hiyuki");
    cy.contains("[data-test-rotations-presets] .card", "Chisa + Lucilla · S6R5 DPS · S0R1 team (wuwa_calc)").should("contain.text", "main stats 43311 ATK");
    everyCardIsFieldable();
  });

  it("a stock team starred before the 2026-11-04 rename keeps its star: Favorites still lists it", () => {
    cy.visit("/teams", {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          "teamRotations",
          JSON.stringify({ teams: [], favoriteTeamIds: [], favoritePresetNames: ["wuwa_calc Aemeath S6R5 · Chisa + Denia", "wuwa_calc Aemeath S6R5 · Denia + Lynae"] }),
        );
      },
    });
    cy.get('[data-test="team-rotations-overflow-menu"]').click();
    cy.get("[data-test-team-rotations-toggle-presets]").click();
    cy.get("[data-test-team-rotations-preset]", { timeout: 30000 }).should("have.length.greaterThan", 20);
    cy.get("[data-test-team-rotations-presets-favorites-filter]").click();
    cy.get("[data-test-team-rotations-preset]").should("have.length", 2);
    cy.get('[data-test-team-rotations-preset="Aemeath · Chisa + Denia · S6R5 (wuwa_calc)"]').should("exist");
    cy.get('[data-test-team-rotations-preset="Aemeath · Denia + Lynae · S6R5 (wuwa_calc)"]').should("exist");
  });

  it("a starred stock team keeps its old name too, so a rollback still shows it, and an unstar stays an unstar", () => {
    const oldA = "wuwa_calc Aemeath S6R5 · Chisa + Denia";
    const oldB = "wuwa_calc Aemeath S6R5 · Denia + Lynae";
    const newA = "Aemeath · Chisa + Denia · S6R5 (wuwa_calc)";
    const newB = "Aemeath · Denia + Lynae · S6R5 (wuwa_calc)";
    const stars = (win: Window): string[] => JSON.parse(win.localStorage.getItem("teamRotations")!).favoritePresetNames;
    const openFavorites = (): void => {
      cy.get('[data-test="team-rotations-overflow-menu"]').click();
      cy.get("[data-test-team-rotations-toggle-presets]").click();
      cy.get("[data-test-team-rotations-preset]", { timeout: 30000 }).should("have.length.greaterThan", 20);
      cy.get("[data-test-team-rotations-presets-favorites-filter]").click();
    };
    // production's storage: two stock teams starred under the names they had before the rename
    cy.visit("/teams", {
      onBeforeLoad(win) {
        win.localStorage.setItem("teamRotations", JSON.stringify({ teams: [], favoriteTeamIds: [], favoritePresetNames: [oldA, oldB] }));
      },
    });
    // this build shows both, and the build from before the rename would too: its cards carry the old names
    cy.window().then((win) => expect(stars(win)).to.have.members([oldA, newA, oldB, newB]));
    openFavorites();
    cy.get("[data-test-team-rotations-preset]").should("have.length", 2);

    // unstar one here: both of its names go
    cy.get(`[data-test-favorite="${newA}"]`).click();
    cy.get("[data-test-team-rotations-preset]").should("have.length", 1);
    cy.window().should((win) => expect(stars(win)).to.have.members([oldB, newB]));

    // and it stays unstarred after a reload (the old name left behind used to bring it back)
    cy.reload();
    cy.window().then((win) => expect(stars(win)).to.have.members([oldB, newB]));
    openFavorites();
    cy.get("[data-test-team-rotations-preset]").should("have.length", 1);
    cy.get(`[data-test-team-rotations-preset="${newB}"]`).should("exist");
    cy.get(`[data-test-team-rotations-preset="${newA}"]`).should("not.exist");
  });

  it("lists the S6R5 full-team rotations under Teams > List Presets and imports one with its actions", () => {
    cy.get("[data-test-nav-team-rotations]").click();
    cy.get('[data-test="team-rotations-overflow-menu"]').click();
    cy.get("[data-test-team-rotations-toggle-presets]").click();
    cy.get("[data-test-team-rotations-presets-search]").type("Xuanling");
    // the generated presets' chunk loads lazily when the modal opens; a stock team reads as the app names one: who is
    // in it, the tier, the engine last (2026-11-04), not "wuwa_calc Xuanling …" on a page that prints names as stored
    cy.get('[data-test-team-rotations-preset^="Xuanling · "][data-test-team-rotations-preset$=" · S6R5 (wuwa_calc)"]', { timeout: 30000 })
      .first()
      .find("[data-test-team-rotations-preset-import]")
      .click();
    cy.get("[data-test-team-rotation-name]")
      .invoke("val")
      .should("match", /^Xuanling · .+ · S6R5 \(wuwa_calc\)$/);
    cy.get('[data-test-team-rotation-slot="0"]').should("contain.text", "Xuanling");
    cy.get("[data-test-team-rotation-action]").should("have.length.greaterThan", 10);

    // the slot's import dialog lists the same loops under Presets
    cy.get('[data-test-team-rotation-import-rotation-open="0"]').click();
    cy.get("[data-test-team-rotation-import-modal]").should("have.attr", "open");
    cy.contains("[data-test-team-rotation-import-modal] h4", "Presets")
      .parent()
      .contains("(wuwa_calc)")
      .should("exist");
  });
});
