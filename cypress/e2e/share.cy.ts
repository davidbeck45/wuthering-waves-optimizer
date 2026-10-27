// Wuthering Tools+ share cards (src/sim/share/): export a card from the account, drop the PNG back in through the
// file input, confirm the merge and find the new build next to the untouched active one; a link round trip into an
// empty account; the "no data in this picture" state. v3 UI, seeded through onBeforeLoad (as phoneLayout.cy.ts).
import { configOptimizer } from "./calculator/data/Cartethyia/data";

type Seed = { character?: string | null; inventory?: string | null };

function visitV3(path: string, seed: Seed) {
  return cy.visit(path, {
    onBeforeLoad(win: Window) {
      if (seed.character) win.localStorage.setItem("character", seed.character);
      else win.localStorage.removeItem("character");
      if (seed.inventory) win.localStorage.setItem("inventory", seed.inventory);
      else win.localStorage.removeItem("inventory");
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
  });
}

const account: Seed = { character: configOptimizer.data.character, inventory: configOptimizer.data.inventory };

function openBuildSheet() {
  cy.get("[data-test-share-pick-character]").select("Cartethyia");
  cy.get("[data-test-share-open-build]").click();
  // (DaisyUI's dialog reports opacity 0 to Cypress while it fades in, as in echoScanBatch.cy.ts: assert existence)
  cy.get("[data-test-share-sheet] [data-test-share-post-card]", { timeout: 30000 }).should("exist");
  // the engine number lands once the best rotation is scored
  cy.get("[data-test-share-sheet] [data-test-share-card-headline]", { timeout: 60000 }).should("contain.text", "avg DMG / rotation");
}

describe("share cards", () => {
  it("exports a card with the build inside and imports it back as a new build", () => {
    visitV3("/share", account);
    cy.get("[data-test-share-page]").should("be.visible");
    cy.title().should("contain", "Share & import builds");
    openBuildSheet();

    // capture the PNG the Download button produces
    cy.window().then((win) => {
      const blobs: string[] = [];
      (win as any).__shareBlobs = blobs;
      const proto = (win as any).HTMLAnchorElement.prototype;
      proto.click = function () {
        const a = this as HTMLAnchorElement;
        if (a.download) blobs.push(a.href);
      };
    });
    cy.get("[data-test-share-download]").click({ force: true });
    cy.window().its("__shareBlobs.length", { timeout: 60000 }).should("be.gte", 1);
    cy.window()
      .then(async (win) => {
        const href = (win as any).__shareBlobs[0] as string;
        const buf = await (await win.fetch(href)).arrayBuffer();
        return Cypress.Buffer.from(buf);
      })
      .as("card");
    cy.get("[data-test-share-sheet-close]").click({ force: true });

    // the account before the import
    cy.window().then((win) => {
      const ch = JSON.parse(win.localStorage.getItem("character") ?? "{}").characters.Cartethyia;
      cy.wrap({ active: ch.activeBuildId ?? null, builds: (ch.builds ?? []).length, weapon: ch.weapon }).as("before");
    });

    cy.get<Buffer>("@card").then((contents) => {
      cy.get("[data-test-share-file-input]").selectFile({ contents, fileName: "cartethyia-build-wtplus.png", mimeType: "image/png" }, { force: true });
    });
    cy.get("[data-test-share-import-preview]", { timeout: 30000 }).should("be.visible");
    cy.get("[data-test-share-origin]").should("contain.text", "from WT+");
    cy.get('[data-test-share-plan-member="Cartethyia"]').should("contain.text", "Adds build");
    // all five echoes are recognised as already owned
    cy.get('[data-test-share-plan-member="Cartethyia"] [data-test-share-echo-status="owned"]').should("have.length", 5);
    cy.get("[data-test-share-verify]", { timeout: 60000 }).should("contain.text", "the same as the card");
    cy.get("[data-test-share-import-confirm]").click();
    cy.get("[data-test-share-import-done]").should("be.visible");

    cy.get<{ active: string | null; builds: number; weapon: string }>("@before").then((before) => {
      cy.window().should((win) => {
        const store = JSON.parse(win.localStorage.getItem("character") ?? "{}");
        const ch = store.characters.Cartethyia;
        // one more build; the active build and the live gear are untouched
        expect(ch.builds.length).to.equal(Math.max(before.builds, 1) + 1);
        if (before.active) expect(ch.activeBuildId).to.equal(before.active);
        expect(ch.weapon).to.equal(before.weapon);
        expect(ch.builds[ch.builds.length - 1].name).to.match(/^Shared · \d{4}-\d{2}-\d{2}/);
        const inv = JSON.parse(win.localStorage.getItem("inventory") ?? "{}");
        expect(inv.echoes.length, "no duplicate echoes added").to.equal(JSON.parse(configOptimizer.data.inventory!).echoes.length);
      });
    });
  });

  it("round-trips a build through a link into an empty account", () => {
    visitV3("/share", account);
    openBuildSheet();
    cy.get("[data-test-share-copy-link]")
      .should("not.be.disabled")
      .invoke("attr", "data-test-share-link-url")
      .then((url) => {
        expect(url).to.match(/\/share#b=[A-Za-z0-9_-]+$/);
        expect((url as string).length).to.be.at.most(1900);
        // a query string forces a real page load (a hash-only change would keep the seeded account)
        const u = new URL(url as string);
        visitV3(`${u.pathname}?from=link${u.hash}`, { character: null, inventory: null });
      });
    cy.get("[data-test-share-import-preview]", { timeout: 30000 }).should("be.visible");
    cy.get('[data-test-share-plan-member="Cartethyia"]').should("contain.text", "New to your account");
    cy.get('[data-test-share-plan-member="Cartethyia"] [data-test-share-echo-status="new"]').should("have.length", 5);
    cy.get("[data-test-share-import-confirm]").click();
    cy.get("[data-test-share-import-done]").should("be.visible");
    cy.window().should((win) => {
      const ch = JSON.parse(win.localStorage.getItem("character") ?? "{}").characters.Cartethyia;
      expect(ch.weapon).to.equal("DefiersThorn");
      expect(ch.builds).to.have.length(1);
      expect(ch.activeBuildId).to.equal(ch.builds[0].id);
      expect(JSON.parse(win.localStorage.getItem("inventory") ?? "{}").echoes).to.have.length(5);
    });
    // the fragment is cleared once imported, so a reload doesn't offer it again
    cy.location("hash").should("eq", "");
  });

  it("explains a picture that carries no data", () => {
    visitV3("/share", { character: null, inventory: null });
    cy.get("[data-test-share-empty]").should("be.visible");
    cy.get("[data-test-share-file-input]").selectFile("cypress/fixtures/echoScan/s26_sabercat_prowler.jpg", { force: true });
    cy.get("[data-test-share-read-error]").should("contain.text", "JPEG").and("contain.text", "Import echoes");
    cy.get("[data-test-share-import-preview]").should("not.exist");
  });

  it("says so, instead of spinning, when nothing on a card is in this app", () => {
    // a hand-made link (deflate-raw + base64url, as link.ts writes it) whose only character the app doesn't list
    const payload = {
      format: "wtplus-build",
      v: 1,
      kind: "build",
      app: "wtplus@test",
      createdAt: "2026-10-26",
      detail: "gear",
      members: [{ charId: "NotACharacter", buildName: "Build", level: 90, sequence: 0, talents: null, weapon: null, mainEcho: null, echoes: [] }],
    };
    visitV3("/share", account);
    cy.window()
      .then(async (win) => {
        const stream = new Blob([JSON.stringify(payload)]).stream().pipeThrough(new (win as any).CompressionStream("deflate-raw"));
        const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      })
      .then((fragment) => visitV3(`/share?from=test#b=${fragment}`, account));
    cy.get("[data-test-share-import-preview]", { timeout: 30000 }).should("be.visible");
    cy.get("[data-test-share-preview-note]").should("contain.text", "Nothing on this card is in this app yet");
    cy.get('[data-test-share-plan-member="NotACharacter"]').should("contain.text", "isn't in this app yet");
    cy.get("[data-test-share-import-confirm]").should("be.disabled");
    cy.get("[data-test-share-plan-summary]").should("not.exist");
  });

  it("offers the share strip over the calculator's build card", () => {
    visitV3("/", account);
    cy.get('[data-test-calculator-nav="buildCard"]').click();
    cy.get("[data-test-share-strip]", { timeout: 20000 }).should("be.visible");
    cy.get("[data-test-share-strip] [data-test-share-button]").click();
    cy.get("[data-test-share-sheet] [data-test-share-post-card]", { timeout: 30000 }).should("exist");
  });
});
