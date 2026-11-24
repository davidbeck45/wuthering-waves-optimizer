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
    // check-tier-board: an mdps Team Cost and Matrix Buffs on, the board still his table
    cy.get(".wt-riley-tierlist #cost").select("s6r5mdps");
    loaded();
    sameAsTable();
    cy.get(".wt-riley-tierlist #matrixToggle").check();
    loaded();
    sameAsTable();
    cy.get(".wt-riley-tierlist #matrixToggle").uncheck();
    cy.get(".wt-riley-tierlist #cost").select("s6r5");
    loaded();
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

  // check-tier-board (batch 6): the board is the reason for the page, so its first band is on the first screen of a
  // phone at 130 % text: the whole T0 band at 412 x 915 (David's S26), T0's first row of portraits at 360 x 740
  for (const [w, h, whole] of [[412, 915, true], [360, 740, false]] as const) {
    it(`at ${w} x ${h} with 130 % text the T0 band's ${whole ? "portraits all" : "first row"} sit above the bottom bar, before any scroll`, () => {
      cy.viewport(w, h);
      // v3, the default UI David uses (the support file seeds classic for a spec without settings: no bottom bar there)
      cy.visit("/tier-list", {
        onBeforeLoad(win: Window) {
          seed().onBeforeLoad(win);
          win.localStorage.setItem("settings", JSON.stringify({ config: { useClassicUi: false }, labs: {} }));
        },
        onLoad(win: Window) {
          const style = win.document.createElement("style");
          style.textContent = "html { font-size: 130% !important; }";
          win.document.head.appendChild(style);
        },
      });
      loaded();
      cy.get('[data-test-tier-board-block="0"] [data-test-tier-board-band="T0"] [data-test-tier-board-face]').should("have.length.at.least", 1);
      cy.window().should((win) => {
        expect(win.scrollY, "not scrolled").to.eq(0);
        const bar = parseFloat(win.getComputedStyle(win.document.documentElement).getPropertyValue("--nav-bottom-h")) || 0;
        expect(bar, "v3's bottom bar").to.be.greaterThan(40);
        const faces = [...win.document.querySelectorAll('[data-test-tier-board-block="0"] [data-test-tier-board-band="T0"] [data-test-tier-board-face]')]
          .map((f) => f.getBoundingClientRect());
        const top = faces[0]!.top;
        const shown = whole ? faces : faces.filter((r) => Math.abs(r.top - top) < 2);
        for (const r of shown) expect(r.bottom, "a T0 portrait's bottom edge vs the bottom bar's top").to.be.at.most(win.innerHeight - bar);
      });
    });
  }

  // check-tier-board (batch 6): the owned ring and its tick carry meaning, so 3 : 1 against the band in every theme
  // (light measured 2.72 : 1 with DaisyUI's --su); the tick's letter 4.5 : 1 on its badge; tier names 4.5 : 1
  it("the owned ring, its tick and the tier names keep their contrast in light, dark and Gruvbox dark", () => {
    cy.viewport(412, 915);
    for (const theme of ["light", "dark", "gruvbox"]) {
      cy.visit("/tier-list", {
        onBeforeLoad(win: Window) {
          seed().onBeforeLoad(win);
          win.localStorage.setItem("settings", JSON.stringify({ config: { useClassicUi: false, theme }, labs: {} }));
        },
      });
      loaded();
      cy.get("html").should("have.attr", "data-theme", theme);
      cy.get(".wt-tboard__face.is-owned").should("have.length.at.least", 1);
      cy.document().then((doc) => {
        const cv = doc.createElement("canvas");
        cv.width = cv.height = 1;
        const cx = cv.getContext("2d", { willReadFrequently: true })!;
        const rgb = (c: string) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
        const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!); };
        const ratio = (a: string, b: string) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
        const win = doc.defaultView!;
        const face = doc.querySelector(".wt-tboard__face.is-owned")!;
        const band = win.getComputedStyle(face.closest("[data-test-tier-board-band]")!).backgroundColor;
        const ring = win.getComputedStyle(face.querySelector(".wt-tboard__pic img, .wt-tboard__pic .wt-tboard__initials")!).boxShadow
          .match(/(rgba?\([^)]*\)|oklch\([^)]*\)|oklab\([^)]*\)|color\([^)]*\))/)![1]!;
        const tick = win.getComputedStyle(face.querySelector(".wt-tboard__tick")!);
        expect(ratio(ring, band), `${theme}: the owned ring vs the band`).to.be.at.least(3);
        expect(ratio(tick.backgroundColor, band), `${theme}: the tick's badge vs the band`).to.be.at.least(3);
        expect(ratio(tick.color, tick.backgroundColor), `${theme}: the tick on its badge`).to.be.at.least(4.5);
        doc.querySelectorAll('[data-test-tier-board-block="0"] [data-test-tier-board-band]').forEach((b) => {
          const t = win.getComputedStyle(b.querySelector(".wt-tboard__tier")!).color;
          expect(ratio(t, win.getComputedStyle(b).backgroundColor), `${theme}: tier name`).to.be.at.least(4.5);
        });
      });
    }
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

  // check-tier-board (batch 6): a phone's share sheet refuses a share whose tap was spent making the picture
  // (NotAllowedError, capture.ts "needs-tap"); the picture waits for one more tap, as the share cards do, never a silent download
  it("Share image keeps the picture for one more tap when the share sheet wants a fresh tap", () => {
    cy.viewport(412, 915);
    const calls: Array<{ files?: File[] }> = [];
    cy.visit("/tier-list", {
      onBeforeLoad(win: Window) {
        seed().onBeforeLoad(win);
        const nav = win.navigator as Navigator & { canShare: unknown; share: unknown };
        Object.defineProperty(nav, "canShare", { configurable: true, value: () => true });
        Object.defineProperty(nav, "share", {
          configurable: true,
          value: (data: { files?: File[] }) => {
            calls.push(data);
            return calls.length === 1 ? Promise.reject(new win.DOMException("needs a gesture", "NotAllowedError")) : Promise.resolve();
          },
        });
      },
    });
    loaded();
    cy.window().then((win) => { cy.stub(win.HTMLAnchorElement.prototype, "click").as("download"); });
    cy.get("[data-test-tier-board-share]").click();
    cy.get("[data-test-tier-board-share-again]", { timeout: 60000 }).should("contain.text", "once more");
    cy.get("@download").should("not.have.been.called");
    cy.get("[data-test-tier-board-share]").click();
    cy.wrap(calls).should("have.length", 2);
    cy.then(() => {
      expect(calls[1]!.files?.[0]?.type).to.eq("image/png");
    });
    cy.get("[data-test-tier-board-share-again]").should("not.exist");
    cy.get("@download").should("not.have.been.called");
  });

  // check-tier-board (batch 6): Back from the brief reopens the sheet (its resonator is in the address); closing it
  // then returns focus to that portrait, not to the page (the board was mounted again and had no opener)
  it("after Back from the brief, closing the sheet returns focus to the portrait", () => {
    cy.viewport(412, 915);
    cy.visit("/tier-list", seed());
    loaded();
    cy.get('[data-test-tier-board-face="Cartethyia"]').first().click();
    cy.get("[data-test-tier-board-sheet]").should("have.attr", "open");
    cy.get("[data-test-tier-board-kit-link]").click();
    cy.location("pathname").should("eq", "/kit/cartethyia");
    cy.go("back");
    cy.location("search").should("contain", "who=Cartethyia");
    cy.get("[data-test-tier-board-sheet]").should("have.attr", "open");
    cy.get("[data-test-tier-board-close]").click();
    cy.get("[data-test-tier-board-sheet]").should("not.have.attr", "open");
    cy.location("search").should("not.contain", "who=");
    cy.focused().should("have.attr", "data-test-tier-board-face", "Cartethyia");
  });
});

