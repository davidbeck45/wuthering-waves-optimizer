// Wuthering Tools+: echo import straight from a shared Google Photos album.
// The site's own API (api/photos-album, api/photos-image) is stubbed here; the
// scan itself runs real OCR (tesseract.js) on the fixture screenshot.
const PHOTO_ID = "AP1GczTestPhotoIdaaaaaaaaaaaaaaaaaaaa";

describe("phone screenshot import from a Google Photos album", () => {
  it("loads the album through the site's API, scans the new photos, and remembers what was imported", () => {
    cy.intercept("GET", "/api/photos-album*", {
      statusCode: 200,
      body: {
        albumId: "AF1QipTestAlbum",
        resolvedUrl: "https://photos.google.com/share/AF1QipTestAlbum?key=k",
        photos: [{ id: PHOTO_ID, url: `https://lh3.googleusercontent.com/pw/${PHOTO_ID}=d` }],
      },
    }).as("album");
    cy.intercept("GET", "/api/photos-image*", { fixture: "echoScan/s26_sabercat_prowler.jpg,null", headers: { "content-type": "image/jpeg" } }).as("image");

    cy.visit("/inventory");
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-album-url]").type("https://photos.app.goo.gl/WdNUs8kzVeFXBLRp6");
    cy.get("[data-test-phone-echo-album-load]").click({ force: true });
    cy.wait("@album").its("request.url").should("include", encodeURIComponent("https://photos.app.goo.gl/WdNUs8kzVeFXBLRp6"));
    cy.get("[data-test-phone-echo-album-summary]").should("contain", "1 photo · 0 already imported · 1 new");

    cy.get("[data-test-phone-echo-album-scan]").click({ force: true });
    // the OCR engine (tesseract.js + its language data from the CDN) loads before the first photo is fetched
    cy.wait("@image", { timeout: 180000 }).its("request.url").should("include", `id=${PHOTO_ID}`);
    cy.get('[data-test-phone-echo-batch-row="done"]', { timeout: 300000 }).should("have.length", 1);
    cy.get("[data-test-phone-echo-batch-echo]").should("have.value", "SabercatProwler");
    cy.get("[data-test-phone-echo-batch-set]").should("have.value", "SoundofTrueName");

    cy.get("[data-test-phone-echo-batch-add]").click({ force: true });
    cy.window({ timeout: 20000 }).should((win) => {
      const inventory = JSON.parse(win.localStorage.getItem("inventory") ?? "{}") as { echoes?: Array<Record<string, unknown>> };
      expect(inventory.echoes ?? []).to.have.length(1);
      expect(inventory.echoes?.[0]).to.include({ echo: "SabercatProwler", echoSet: "SoundofTrueName", type: 3, stat: "ATK" });
      expect(inventory.echoes?.[0]).to.include({ echoSubStatsType3: "BasicAttackDMGBonus", echoSubStatsValue3: 8.6 });
    });

    // the album remembers the photo: adding closes the importer, and a fresh load offers nothing new
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-album-url]").type("https://photos.app.goo.gl/WdNUs8kzVeFXBLRp6");
    cy.get("[data-test-phone-echo-album-load]").click({ force: true });
    cy.wait("@album");
    cy.get("[data-test-phone-echo-album-summary]").should("contain", "1 photo · 1 already imported · 0 new");
    cy.get("[data-test-phone-echo-album-scan]").should("be.disabled");
  });

  it("explains a link that is not a Google Photos album", () => {
    cy.intercept("GET", "/api/photos-album*", { statusCode: 400, body: { error: "Not a Google Photos share link (photos.app.goo.gl or photos.google.com/share)" } }).as("album");
    cy.visit("/inventory");
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-album-url]").type("https://example.com/album");
    cy.get("[data-test-phone-echo-album-load]").click({ force: true });
    cy.wait("@album");
    cy.get("[data-test-phone-echo-album-error]").should("contain", "Not a Google Photos share link");
  });
});
