// Wuthering Tools+ (batch 6, 2026-11-23, lane tier-board): the Tier list's Board view (src/sim/rileyPages/TierBoard.vue).
// Synthetic account: the Cartethyia fixture (one limited resonator set up).
import { configOptimizer } from "./calculator/data/Cartethyia/data";

function seed() {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
    },
  };
}

const loaded = () => cy.get(".wt-riley-pages #loading", { timeout: 180000 }).should("have.attr", "hidden");

/** Where each resonator sits in his table, "Main DPS/T1/Name", read from his drawn rows the way a reader reads them. */
function tablePlacements(doc: Document): string[] {
  const blocks = ["Main DPS", "Sub DPS", "Support"];
  const out: string[] = [];
  let tier = "";
  for (const row of doc.querySelectorAll(".wt-riley-tierlist .trow:not(.thead)")) {
    const t = row.querySelector(":scope > .c.tier")?.textContent?.trim();
    if (t) tier = t;
    row.querySelectorAll(":scope > .sec").forEach((sec, b) => {
      const name = sec.querySelector(".res-label")?.textContent?.trim();
      if (name) out.push(`${blocks[b]}/${tier}/${name}`);
    });
  }
  return out.sort();
}
function boardPlacements(doc: Document): string[] {
  return [...doc.querySelectorAll<HTMLElement>("[data-test-tier-board-face]")].map((el) => {
    const block = el.closest<HTMLElement>("[data-test-tier-board-block]")!.querySelector("h3")!.textContent!.trim();
    return `${block}/${el.dataset.tier}/${el.dataset.testTierBoardFace}`;
  }).sort();
}
const sameAsTable = () =>
  cy.document().should((doc) => {
    const board = boardPlacements(doc);
    expect(board.length, "faces on the board").to.be.greaterThan(30);
    expect(board).to.deep.equal(tablePlacements(doc));
  });

describe("Tier list: the Board view", () => {
  it("opens on the board, every resonator in the tier his table gives, and follows a Team Cost change", () => {
    cy.viewport(1280, 900);
    cy.visit("/tier-list", seed());
    loaded();
    cy.get("[data-test-tier-board]").should("be.visible");
    cy.get(".wt-riley-tierlist .tgrid").should("not.be.visible");
    sameAsTable();
    // the account's own: Cartethyia owned, ringed and named so
    cy.get('[data-test-tier-board-face="Cartethyia"]').first().should("have.attr", "aria-label").and("contain", "owned");
    cy.get("[data-test-tier-board-owned]").should("have.length", 3).first().invoke("text").should("match", /^You own \d+ of the \d+ main DPS in T0 and T1\.$/);
    cy.get(".wt-riley-tierlist #cost").select("s6r5");
    loaded();
    sameAsTable();
    cy.location("hash").should("contain", "tc=s6r5");
    // Board | Table: the address follows, his table shows, Back returns to the board at the same Team Cost
    cy.get('[data-test-riley-switch-to="table"]').click();
    cy.location("search").should("eq", "?view=table");
    cy.get(".wt-riley-tierlist .tgrid").should("be.visible");
    cy.get("[data-test-tier-board]").should("not.exist");
    cy.go("back");
    cy.location("search").should("eq", "");
    cy.get("[data-test-tier-board]").should("be.visible");
    cy.location("hash").should("contain", "tc=s6r5");
    sameAsTable();
  });

  it("a tap opens the sheet, Escape and Back close it, and its team link opens that team on /rankings", () => {
    cy.viewport(412, 915);
    cy.visit("/tier-list", seed());
    loaded();
    cy.get('[data-test-tier-board-block="0"] [data-test-tier-board-band="T0"] [data-test-tier-board-face]').first().as("face");
    cy.get("@face").invoke("attr", "data-test-tier-board-face").then((name) => {
      cy.get("@face").click();
      cy.location("search").should("contain", "who=");
      cy.get("[data-test-tier-board-sheet]").should("have.attr", "open");
      cy.get("[data-test-tier-board-sheet] h3").should("have.text", name);
      cy.get("[data-test-tier-board-team] li").should("have.length", 3);
      cy.get("[data-test-tier-board-figure]").should("contain.text", "damage per rotation of the best team");
      cy.get("[data-test-tier-board-close]").type("{esc}");
      cy.get("[data-test-tier-board-sheet]").should("not.have.attr", "open");
      cy.location("search").should("not.contain", "who=");
      cy.focused().should("have.attr", "data-test-tier-board-face", name);
      // Back closes it too, the board stays
      cy.get("@face").click();
      cy.get("[data-test-tier-board-sheet]").should("have.attr", "open");
      cy.go("back");
      cy.get("[data-test-tier-board-sheet]").should("not.have.attr", "open");
      cy.location("pathname").should("eq", "/tier-list");
      // the team link
      cy.get("@face").click();
      cy.get("[data-test-tier-board-team-link]").click();
      cy.location("pathname").should("eq", "/rankings");
      cy.location("hash").should("match", /(^|[#&])t=/);
      cy.go("back");
      cy.location("pathname").should("eq", "/tier-list");
      cy.get("[data-test-tier-board]").should("be.visible");
      cy.document().its("documentElement.scrollWidth").should("be.at.most", 412);
    });
  });

  it("on a 360 x 800 phone at 130 % text the first portraits start above the bottom bar, and nothing scrolls sideways", () => {
    cy.viewport(360, 800);
    cy.visit("/tier-list", {
      ...seed(),
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130% !important; }";
        win.document.head.appendChild(style);
      },
    });
    loaded();
    cy.window().should((win) => {
      const bar = parseFloat(win.getComputedStyle(win.document.documentElement).getPropertyValue("--nav-bottom-h")) || 0;
      const first = [...win.document.querySelectorAll("[data-test-tier-board-face]")].find((c) => c.getBoundingClientRect().height > 0)!;
      expect(first, "a portrait shown").to.exist;
      expect(first.getBoundingClientRect().bottom, "first portrait's bottom edge").to.be.at.most(win.innerHeight - bar);
      expect(first.getBoundingClientRect().height, "a 44 px target").to.be.at.least(44);
      expect(win.document.documentElement.scrollWidth).to.be.at.most(win.document.documentElement.clientWidth);
    });
    cy.get('[data-test-riley-view="2"]').click();
    cy.get('[data-test-tier-board-block="2"]').should("be.visible");
    cy.get('[data-test-tier-board-block="0"]').should("not.be.visible");
  });

  it("Save as image hands over a PNG of the design width", () => {
    cy.viewport(412, 915);
    cy.visit("/tier-list", seed());
    loaded();
    cy.window().then((win) => {
      const blobs: Blob[] = [];
      (win as unknown as { wtBlobs: Blob[] }).wtBlobs = blobs;
      const real = win.URL.createObjectURL.bind(win.URL);
      cy.stub(win.URL, "createObjectURL").callsFake((b: Blob) => { blobs.push(b); return real(b); });
      cy.stub(win.HTMLAnchorElement.prototype, "click").callsFake(() => undefined);
    });
    cy.get("[data-test-tier-board-save]").click();
    cy.window().its("wtBlobs", { timeout: 60000 }).should("have.length.greaterThan", 0);
    cy.window().then(async (win) => {
      const blob = (win as unknown as { wtBlobs: Blob[] }).wtBlobs[0]!;
      expect(blob.type).to.eq("image/png");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect([...bytes.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).to.eq("PNG");
      const width = new DataView(bytes.buffer).getUint32(16);
      expect(width, "design width 1080 at pixel ratio 2").to.eq(2160);
      // drawn, not blank: a node html-to-image cannot lay out comes back as a transparent PNG of the right size
      const bmp = await win.createImageBitmap(blob);
      const canvas = win.document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bmp, 0, 0);
      const [r, g, b, a] = ctx.getImageData(10, 10, 1, 1).data;
      expect([r, g, b, a], "the card's fixed dark background").to.deep.equal([0x15, 0x17, 0x1d, 255]);
    });
    cy.get("[data-test-tier-board-save]").should("not.be.disabled");
  });
});
