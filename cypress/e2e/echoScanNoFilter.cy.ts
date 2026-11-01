// Wuthering Tools+: phone-screenshot echo import without a Sonata filter (src/sim/echoScan/setGlyph.ts).
// The committed Sabercat Prowler screenshot has the filter chip "Sound of True Name" bottom-left; the spec paints
// over it in the browser first, so the set can only come from the small icon next to +25 (Sabercat Prowler can roll
// Pact of Neonlight Leap, Halo of Starry Radiance or Sound of True Name). Real OCR (tesseract.js, language data from
// its CDN) and the app's real set icons (assets CDN).
const SHOT = "cypress/fixtures/echoScan/s26_sabercat_prowler.jpg";
/** the Sonata-filter chip on a 3120 × 1440 shot (phoneEchoScan.ts `chip` is 340, 1185, 540 × 60), with a margin */
const CHIP = { x: 320, y: 1165, width: 600, height: 100 };

describe("phone screenshot import without a Sonata filter", () => {
  it("says the filter is optional, and reads the set from the icon next to +25", () => {
    cy.intercept("GET", "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/sets/*").as("setIcon");
    cy.visit("/inventory");
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-batch-set-tip]").should("contain.text", "No Sonata filter needed").and("contain.text", "optional");
    cy.get("[data-test-phone-echo-batch]").should("not.contain.text", "Turn a Sonata filter on first");

    cy.readFile(SHOT, null).then((bytes: Uint8Array) =>
      cy.window().then(
        (win) =>
          new Cypress.Promise<Uint8Array>((resolve, reject) => {
            win
              .createImageBitmap(new win.Blob([bytes], { type: "image/jpeg" }))
              .then((bitmap) => {
                const canvas = win.document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext("2d")!;
                ctx.drawImage(bitmap, 0, 0);
                ctx.fillStyle = "#3b4a55"; // the backdrop's tone there: no chip, nothing to read
                ctx.fillRect(CHIP.x, CHIP.y, CHIP.width, CHIP.height);
                canvas.toBlob((blob) => (blob ? blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer))) : reject(new Error("no blob"))), "image/jpeg", 0.92);
              })
              .catch(reject);
          }),
      ),
    ).then((contents) => {
      cy.get("[data-test-phone-echo-batch-input]").selectFile({ contents: Cypress.Buffer.from(contents), fileName: "sabercat-no-filter.jpg", mimeType: "image/jpeg" }, { force: true });
    });
    cy.get('[data-test-phone-echo-batch-row="queued"]').should("have.length", 1);
    cy.get("[data-test-phone-echo-batch-scan]").click({ force: true });
    cy.get('[data-test-phone-echo-batch-row="done"]', { timeout: 400000 }).should("have.length", 1);
    cy.wait("@setIcon");

    cy.get('[data-test-phone-echo-batch-row="done"]').within(() => {
      cy.get("[data-test-phone-echo-batch-echo]").should("have.value", "SabercatProwler");
      cy.get("[data-test-phone-echo-batch-set]").should("have.value", "SoundofTrueName").and("have.attr", "data-set-source", "icon");
    });
    // a sure icon leaves no note about the set
    cy.get("[data-test-phone-echo-batch-table]").should("not.contain.text", "set unknown").and("not.contain.text", "not sure").and("not.contain.text", "Sonata filter says");

    cy.get("[data-test-phone-echo-batch-add]").click({ force: true });
    cy.window({ timeout: 20000 }).should((win) => {
      const inventory = JSON.parse(win.localStorage.getItem("inventory") ?? "{}") as { echoes?: Array<Record<string, unknown>> };
      expect(inventory.echoes ?? []).to.have.length(1);
      expect(inventory.echoes?.[0]).to.include({ echo: "SabercatProwler", echoSet: "SoundofTrueName", type: 3, stat: "ATK" });
    });
  });
});
