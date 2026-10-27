// Wuthering Tools+ — /rotation (src/sim/rotation/): a wuwa_calc team's traced run as a cue card (one line per swap,
// play-along mode, pop-out) and a fight timeline, on the v3 UI with an account seeded through onBeforeLoad (the
// support file seeds classic otherwise). The engine is real (the app's solver worker); Screen Wake Lock and the
// pop-out window are stubbed — headless Electron has neither a user gesture nor a Picture-in-Picture window.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const STOCK = "/rotation#team=t404"; // Shorekeeper · Lynae · Iuno, a stock wuwa_calc team

function seed(extra: (win: Window) => void = () => undefined) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      win.localStorage.removeItem("wtplus:rotation:v1");
      // Screen Wake Lock: a sentinel the test can see
      const w = win as Window & { __wakeRequests?: number };
      w.__wakeRequests = 0;
      Object.defineProperty(win.navigator, "wakeLock", {
        configurable: true,
        value: {
          request: () => {
            w.__wakeRequests! += 1;
            return Promise.resolve({ release: () => Promise.resolve(), addEventListener: () => undefined });
          },
        },
      });
      extra(win);
    },
  };
}

describe("rotation view", () => {
  it("writes the cue card: an opener and the loop, one line per swap, with checkpoints", () => {
    cy.viewport(1280, 900);
    cy.visit(STOCK, seed());
    cy.get("[data-test-rotation-cue]", { timeout: 90000 }).should("be.visible");
    cy.get("[data-test-rotation-title]").should("contain.text", "Shorekeeper").and("contain.text", "Iuno");
    cy.title().should("contain", "Shorekeeper · Lynae · Iuno rotation");
    cy.get('[data-test-rotation-block="opener"]').should("be.visible");
    cy.get('[data-test-rotation-block="loop1"]').should("contain.text", "Loop").and("contain.text", "×3");
    cy.get('[data-test-rotation-block="loop1"] [data-test-rotation-visit]').should("have.length", 3);
    cy.get('[data-test-rotation-block="loop1"] [data-test-rotation-visit="Lynae"] [data-test-rotation-chip]').should("contain.text", "Echo").and("contain.text", "R");
    cy.get("[data-test-rotation-checkpoint]").should("contain.text", "R ready").and("contain.text", "Outro ready");
    cy.get("[data-test-rotation-loop-target]").invoke("text").should("match", /\d+\.\d s/);
    cy.get("[data-test-rotation-member]").should("have.length", 3);
    // the substat spread switch re-runs the team
    cy.get('[data-test-rotation-subs-option="standard"]').click();
    cy.location("hash").should("contain", "subs=standard");
    cy.get('[data-test-rotation-block="loop1"]', { timeout: 90000 }).should("be.visible");
  });

  it("plays along: Space starts the clock and walks the swaps, the screen is kept on", () => {
    cy.viewport(1280, 900);
    cy.visit(STOCK, seed());
    cy.get("[data-test-rotation-play-open]", { timeout: 90000 }).click();
    cy.get("[data-test-rotation-play]").should("be.visible");
    cy.window().its("__wakeRequests").should("be.greaterThan", 0);
    cy.get("[data-test-rotation-wake]").should("contain.text", "Screen stays on");
    cy.get("[data-test-rotation-now]").should("have.text", "Shorekeeper");
    cy.get("[data-test-rotation-start-hint]").should("be.visible");
    cy.get("body").trigger("keydown", { key: " " });
    cy.get("[data-test-rotation-start-hint]").should("not.exist");
    cy.get("[data-test-rotation-now]").should("have.text", "Shorekeeper");
    cy.get("body").trigger("keydown", { key: " " });
    cy.get("[data-test-rotation-now]").should("have.text", "Lynae");
    cy.get("[data-test-rotation-next]").should("contain.text", "Iuno");
    cy.get("body").trigger("keydown", { key: "ArrowLeft" });
    cy.get("[data-test-rotation-now]").should("have.text", "Shorekeeper");
    // tapping the stage advances too
    cy.get("[data-test-rotation-stage-tap]").click();
    cy.get("[data-test-rotation-now]").should("have.text", "Lynae");
    cy.get("[data-test-rotation-lap]").invoke("text").should("match", /Opener\s*\d+\.\d s/);
    cy.get("body").trigger("keydown", { key: "Escape" });
    cy.get("[data-test-rotation-play]").should("not.exist");
  });

  it("pops the cue out into a small window", () => {
    cy.viewport(1280, 900);
    cy.visit(STOCK, seed());
    cy.get("[data-test-rotation-pop]", { timeout: 90000 }).should("be.visible");
    cy.document().then((doc) => {
      const frame = doc.createElement("iframe");
      frame.setAttribute("data-test-fake-pip", "");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:340px;height:220px;border:0;z-index:99999";
      doc.body.appendChild(frame);
    });
    cy.window().then((win) => {
      const frame = win.document.querySelector<HTMLIFrameElement>("[data-test-fake-pip]")!;
      cy.stub(win, "open").returns(frame.contentWindow);
    });
    cy.get("[data-test-rotation-pop]").click();
    cy.get("[data-test-fake-pip]").its("0.contentDocument.body").find("[data-test-rotation-stage]").should("exist");
    cy.get("[data-test-fake-pip]").its("0.contentDocument.body").find("[data-test-rotation-now]").should("have.text", "Shorekeeper");
    cy.get("[data-test-fake-pip]").its("0.contentDocument.body").find("[data-test-rotation-stage-tap]").click().click();
    cy.get("[data-test-fake-pip]").its("0.contentDocument.body").find("[data-test-rotation-now]").should("have.text", "Lynae");
  });

  it("draws the fight timeline: lanes, a kill time, buff uptime", () => {
    cy.viewport(1280, 900);
    cy.visit(STOCK, seed());
    cy.get('[data-test-rotation-tab="timeline"]', { timeout: 90000 }).click();
    cy.location("hash").should("contain", "tab=timeline");
    cy.get("[data-test-rotation-timeline]", { timeout: 90000 }).should("be.visible");
    cy.get("[data-test-rotation-lane]").should("have.length", 3);
    cy.get("[data-test-rotation-kill]").first().invoke("text").should("match", /kills 1\.5M at \d+\.\d s/);
    cy.get("[data-test-rotation-buff]").should("have.length.greaterThan", 5);
    cy.get("[data-test-rotation-buff-uptime]").first().invoke("text").should("match", /\d+ %|always/);
    // the loop only, then a custom HP line
    cy.get('[data-test-rotation-range-option="loop1"]').click();
    cy.get('[data-test-rotation-range-option="loop1"]').should("have.class", "btn-primary");
    cy.get("[data-test-rotation-hp]").type("20M{enter}");
    cy.get("[data-test-rotation-kill]").should("contain.text", "20M");
  });

  it("opens a Team rankings row from its detail page's Rotation button", () => {
    cy.viewport(1280, 900);
    cy.visit("/rankings", seed());
    // the first row without an unreleased member (his row keys move with his commits: never pinned here)
    cy.get(".trow .gotodetail[data-team]", { timeout: 90000 })
      .should("have.length.greaterThan", 1)
      .then(($els) => {
        const el = [...$els].find((e) => !(e.parentElement?.textContent ?? "").includes("Lily"))!;
        const rowKey = el.getAttribute("data-team")!;
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        cy.get("[data-test-rankings-rotation]", { timeout: 90000 }).should("be.visible").and("have.attr", "href", `/rotation#team=${rowKey}`);
        cy.get("[data-test-rankings-rotation]").click();
        cy.location("pathname").should("eq", "/rotation");
        cy.location("hash").should("eq", `#team=${rowKey}`);
      });
    cy.get("[data-test-rotation-cue]", { timeout: 90000 }).should("be.visible");
    cy.get("[data-test-rotation-header]").should("contain.text", "the Team rankings row you opened");
    // a member the account lacks runs as the row has them (its own S / R), and the notice says so — never "S0 R1"
    cy.get("body").then(($body) => {
      const notice = $body.find("[data-test-rotation-not-fieldable]");
      if (notice.length) expect(notice.text()).to.contain("the Team rankings row you opened runs");
    });
  });

  it("keeps the /rankings detail's Rotation and Import buttons on a phone screen", () => {
    cy.viewport(412, 915);
    cy.visit("/rankings", {
      ...seed(),
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130%; }";
        win.document.head.appendChild(style);
      },
    });
    cy.get(".trow .gotodetail[data-team]", { timeout: 90000 })
      .should("have.length.greaterThan", 1)
      .then(($els) => $els[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    cy.get("[data-test-rankings-rotation]", { timeout: 90000 }).should("be.visible");
    for (const sel of ["[data-test-rankings-rotation]", "[data-test-rankings-import-team]"]) {
      cy.get(sel).then(($el) => {
        const box = $el[0]!.getBoundingClientRect();
        expect(box.left, `${sel} left`).to.be.at.least(0);
        expect(box.right, `${sel} right`).to.be.at.most(412);
      });
    }
  });

  it("says why a team cannot run, and lists teams to pick from", () => {
    cy.viewport(1280, 900);
    // Lily: in wuwa_calc, not released in the app
    cy.visit("/rotation#team=t4", seed());
    cy.get('[data-test-rotation-problem="notInApp"]', { timeout: 90000 }).should("contain.text", "Lily");
    // a /rankings team code it cannot read
    cy.visit("/rotation#team=AbCdEf", seed());
    cy.get('[data-test-rotation-problem="code"]', { timeout: 90000 }).should("contain.text", "Team rankings");
    // a real one (t404, every pick his first): its team, run at the account instead, with a notice saying so
    cy.visit("/rotation#team=bP6aLXA_3VxwKm0bfqMmeZJhKvqx-kZ2", seed());
    cy.get("[data-test-rotation-notice]", { timeout: 90000 }).should("contain.text", "at your account");
    cy.get("[data-test-rotation-title]").should("contain.text", "Shorekeeper").and("contain.text", "Iuno");
    cy.get('[data-test-rotation-block="loop1"]').should("be.visible");
    // no team: the picker
    cy.visit("/rotation", seed());
    cy.get("[data-test-rotation-picker]").should("be.visible");
    cy.get("[data-test-rotation-picker-stock]", { timeout: 90000 }).should("have.length.greaterThan", 5);
    cy.get("[data-test-rotation-picker-search]").type("Shorekeeper");
    cy.get("[data-test-rotation-picker-stock]").first().find("[data-test-rotation-open-cue]").click();
    cy.location("hash").should("match", /^#chars=/);
    cy.get("[data-test-rotation-cue]", { timeout: 90000 }).should("be.visible");
  });
});
