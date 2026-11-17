// Wuthering Tools+: Lily (version 3.8) on Team rankings. Until Ryan's #685 the app had no Lily and importing one of her
// teams was refused ("Lily is not released in this app yet, so this team can't be imported"). She is a character of the
// app now, so the first team with her imports like any other, with her own presses and who she hands off to.
describe("Lily's teams on Team rankings (Wuthering Tools+)", () => {
  it("imports a team with Lily as a Team Rotation: her slot, her presses and her handoff", () => {
    cy.visit("/rankings#r=Lily");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root #app .gotodetail[data-team]", { timeout: 60000 }).first().click();
    cy.get(".skittle-root #topbar [data-test-rankings-import-team]").should("exist").click({ force: true });
    cy.get(".skittle-root #topbar .wt-import[data-test-rankings-import-done]", { timeout: 60000 }).should("exist");
    cy.window().should((win) => {
      const store = JSON.parse(win.localStorage.getItem("teamRotations") ?? "{}") as {
        teams?: Array<{ name: string; characterIds: Array<string | null>; actions: Array<{ slot: number }>; handoffs?: Record<string, string[]> }>;
      };
      expect(store.teams ?? []).to.have.length(1);
      const team = store.teams![0];
      expect(team.name).to.match(/\(wuwa_calc\)$/);
      expect(team.characterIds).to.include("Lily");
      const slot = team.characterIds.indexOf("Lily");
      // her casts were mapped onto this app's attacks: her part of the loop is there
      expect(team.actions.filter((a) => a.slot === slot).length).to.be.greaterThan(3);
      // who follows her is recorded: the team buffs derived from the real team count Dream Aroma's stacks from it
      expect(Object.keys(team.handoffs ?? {})).to.include("Lily");
    });
  });
});
