// Wuthering Tools+ — "Read with Claude" in the phone-screenshot batch importer (src/sim/echoScan/claudeVision.ts).
// No request reaches Anthropic: every call to api.anthropic.com is intercepted (the CORS preflight too) and answered
// with the recorded-style responses in src/sim/echoScan/__fixtures__/claudeVisionResponses.json, whose stat lines are
// the fixture screenshots'. No OCR runs: Claude reads the queued screenshots directly. Classic UI (the support file's
// default) — the importer is the same component in v3. The second screenshot's stub answers as if its Sonata chip
// weren't readable, so the set comes from the glyph pass (a second request with the candidate sets' icons).
import * as recorded from "../../src/sim/echoScan/__fixtures__/claudeVisionResponses.json";

// Cypress's webpack build hands a JSON import over as the module namespace, without a default export
const responses = ((recorded as unknown as { default?: typeof recorded }).default ?? recorded) as typeof recorded;

const KEY = "sk-ant-api03-cypress-vision-000000000000AbCd";
const API = "https://api.anthropic.com";
const SHOTS = "cypress/fixtures/echoScan";

type Seen = { headers: Record<string, string | string[]>; body: any };

function cors(origin: string | string[] | undefined): Record<string, string> {
  return { "access-control-allow-origin": String(origin ?? "*"), "access-control-expose-headers": "request-id" };
}

/** Pass-1 requests are answered in this order; a set-glyph request (its schema has echo_1) gets the set pick. */
function stubAnthropic(reads: Array<keyof typeof responses>): Seen[] {
  const seen: Seen[] = [];
  const queue = [...reads];
  cy.intercept("OPTIONS", `${API}/**`, (req) => {
    req.reply({
      statusCode: 204,
      headers: {
        ...cors(req.headers.origin),
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": String(req.headers["access-control-request-headers"] ?? "*"),
        "access-control-max-age": "600",
      },
    });
  });
  cy.intercept("POST", `${API}/v1/messages*`, (req) => {
    seen.push({ headers: req.headers, body: req.body });
    const glyphPass = Boolean(req.body?.output_config?.format?.schema?.properties?.echo_1);
    const name = glyphPass ? "puppetSetPick" : queue.shift();
    req.reply({
      statusCode: name ? 200 : 500,
      headers: { ...cors(req.headers.origin), "content-type": "application/json", "request-id": `req_cy_vision_${seen.length}` },
      body: name ? responses[name] : { type: "error", error: { type: "api_error", message: "unexpected request" } },
    });
  }).as("messages");
  return seen;
}

describe("Read with Claude (echo importer)", () => {
  it("adds a key from the importer, reads screenshots, matches a set glyph, flags impossible values and saves the good rows", () => {
    const seen = stubAnthropic(["sabercat", "puppetGlyph", "impossible"]);
    cy.visit("/inventory");
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-claude-read]").should("exist");

    // no key yet: the strip opens AI settings over the importer
    cy.get("[data-test-phone-echo-batch-input]").selectFile(`${SHOTS}/s26_sabercat_prowler.jpg`, { force: true });
    cy.get("[data-test-claude-read-run]").should("not.exist");
    cy.get("[data-test-claude-read-key]").click({ force: true });
    cy.get("[data-test-ai-settings-dialog]").should("be.visible").within(() => {
      cy.get("[data-test-ai-settings-key-input]").type(KEY);
      cy.get("[data-test-ai-settings-key-save]").click();
      cy.get("[data-test-ai-key-hint]").should("contain.text", "…AbCd");
      cy.get("[data-test-ai-effort=vision]").should("have.value", "low");
    });
    cy.get("[data-test-ai-settings-done]").click();
    cy.get("[data-test-ai-settings-dialog]").should("not.exist");

    // 1 — a clean read: the estimate first, then the row filled by Claude and checked
    cy.get('[data-test-claude-read-scope="all"]').should("contain.text", "All unread · 1");
    cy.get("[data-test-claude-read-estimate]").should("contain.text", "for 1 screenshot").and("contain.text", "$0.0");
    cy.get("[data-test-claude-read-run]").should("contain.text", "Read 1 with Claude").click({ force: true });
    cy.get('[data-test-claude-row="done"]', { timeout: 20000 }).should("have.length", 1);
    cy.get('[data-test-claude-row="done"]').first().within(() => {
      cy.get("[data-test-phone-echo-batch-echo]").should("have.value", "SabercatProwler");
      cy.get("[data-test-phone-echo-batch-set]").should("have.value", "SoundofTrueName");
      cy.get('input[type="checkbox"]').should("be.checked");
      cy.get("[data-test-claude-row-badge]").should("exist");
    });
    cy.get("[data-test-claude-read-summary]").should("contain.text", "Read 1 screenshot · 1 echo");
    cy.then(() => {
      expect(seen).to.have.length(1);
      const { headers, body } = seen[0];
      expect(headers.authorization).to.equal(`Bearer ${KEY}`);
      expect(headers["anthropic-dangerous-direct-browser-access"]).to.equal("true");
      expect(String(headers["anthropic-beta"])).to.contain("server-side-fallback-2026-07-01");
      expect(body.model).to.equal("claude-opus-5-5");
      expect(body.fallbacks).to.equal("default");
      expect(body.output_config.effort).to.equal("low");
      expect(body.output_config.format.type).to.equal("json_schema");
      for (const banned of ["thinking", "temperature", "top_p", "top_k"]) expect(body).not.to.have.property(banned);
      const [image, text] = body.messages[0].content;
      expect(image.type).to.equal("image");
      expect(image.source.media_type).to.equal("image/jpeg");
      expect(image.source.data.length).to.be.greaterThan(1000);
      expect(text.text).to.contain("2576×1189 px (scaled down from 3120×1440)");
    });

    // 2 — the set isn't printed: a second request matches the glyph against the echo's own sets' icons
    cy.get("[data-test-phone-echo-batch-input]").selectFile(`${SHOTS}/s26_puppet_pavilion_1.jpg`, { force: true });
    cy.get('[data-test-claude-read-scope="all"]').should("contain.text", "All unread · 1");
    cy.get("[data-test-claude-read-run]").click({ force: true });
    cy.get('[data-test-claude-row="done"]', { timeout: 20000 }).should("have.length", 2);
    cy.get('[data-test-claude-row="done"]').eq(1).within(() => {
      cy.get("[data-test-phone-echo-batch-echo]").should("have.value", "ThousandPuppetPavilion");
      cy.get("[data-test-phone-echo-batch-set]").should("have.value", "SongofFeatheredTrace");
      cy.get('input[type="checkbox"]').should("be.checked");
    });
    cy.then(() => {
      expect(seen).to.have.length(3);
      const glyph = seen[2].body;
      const urls = glyph.messages[0].content.filter((b: any) => b.type === "image" && b.source.type === "url").map((b: any) => b.source.url);
      expect(urls).to.deep.equal([
        "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/sets/SongofFeatheredTrace.webp",
        "https://ryanbenson.github.io/wuthering-waves-assets/images/echoes/sets/FlowerofTingedYearning.webp",
      ]);
      // the glyph itself goes as a crop of the full-resolution screenshot, not the whole shot again
      const crop = glyph.messages[0].content.find((b: any) => b.type === "image" && b.source.type === "base64");
      expect(crop.source.media_type).to.equal("image/png");
      expect(glyph.output_config.format.schema.properties.echo_1.properties.set.enum).to.deep.equal(["Song of Feathered Trace", "Flower of Tinged Yearning", "none of these"]);
    });

    // 3 — impossible values: flagged, kept exactly as read, the row unchecked
    cy.get("[data-test-phone-echo-batch-input]").selectFile(`${SHOTS}/s26_puppet_pavilion_2.jpg`, { force: true });
    cy.get("[data-test-claude-read-run]").click({ force: true });
    cy.get('[data-test-claude-row="done"]', { timeout: 20000 }).should("have.length", 3);
    cy.get('[data-test-claude-row="done"]').eq(2).within(() => {
      cy.get('input[type="checkbox"]').should("not.be.checked");
      cy.get('input[aria-label="Substat 1 value"]').should("have.value", "8.8%");
    });
    cy.get("[data-test-phone-echo-batch-flags]")
      .last()
      .should("contain.text", "substat Crit. Rate 8.8% isn't a legal roll")
      .and("contain.text", "substat ATK (flat) 55 isn't a legal roll");
    cy.get("[data-test-claude-read-summary]").should("contain.text", "Read 1 screenshot · 1 echo");

    // the two checked rows go through upstream's duplicate review + save, as OCR rows do
    cy.get("[data-test-phone-echo-batch-add]").should("contain.text", "Add 2 echoes").click({ force: true });
    cy.window({ timeout: 20000 }).should((win) => {
      const inventory = JSON.parse(win.localStorage.getItem("inventory") ?? "{}") as { echoes?: Array<Record<string, unknown>> };
      const echoes = inventory.echoes ?? [];
      expect(echoes).to.have.length(2);
      const sabercat = echoes.find((echo) => echo.echo === "SabercatProwler");
      expect(sabercat).to.include({ echoSet: "SoundofTrueName", type: 3, stat: "ATK", rank: 5 });
      const subs = [1, 2, 3, 4, 5].map((i) => [sabercat?.[`echoSubStatsType${i}`], sabercat?.[`echoSubStatsValue${i}`]]);
      expect(subs).to.deep.equal([
        ["CritRate", 9.3],
        ["HP", 10.9],
        ["BasicAttackDMGBonus", 8.6],
        ["EnergyRegen", 7.6],
        ["ResonanceLiberationDMGBonus", 10.9],
      ]);
      const puppet = echoes.find((echo) => echo.echo === "ThousandPuppetPavilion");
      expect(puppet).to.include({ echoSet: "SongofFeatheredTrace", type: 4, stat: "CritDMG", echoSubStatsType1: "CritDMG", echoSubStatsValue1: 19.8 });
    });
  });

  it("fits a phone at 412 px with 130 % text, and asks before going past the soft budget", () => {
    const seen = stubAnthropic(["sabercat"]);
    cy.viewport(412, 915);
    cy.visit("/inventory", {
      onBeforeLoad(win) {
        win.sessionStorage.setItem("wtplus:ai:key", KEY);
        // a $0.05 soft budget: one Opus phone shot is estimated above it
        win.localStorage.setItem("wtplus:ai:settings", JSON.stringify({ budgetUsd: 0.05 }));
      },
      onLoad(win) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130%; }";
        win.document.head.appendChild(style);
      },
    });
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-batch-input]").selectFile(`${SHOTS}/s26_sabercat_prowler.jpg`, { force: true });
    cy.get("[data-test-claude-read-estimate]").should("contain.text", "above your $0.05 budget");
    // over the budget: upstream's ConfirmDialog first; Cancel reads nothing. (`[open]`, not visibility: DaisyUI's modal
    // fades in from opacity 0 and headless Electron never advances that transition.)
    cy.get("[data-test-claude-read-run]").click({ force: true });
    cy.get(".confirm-dialog[open]", { timeout: 10000 }).should("contain.text", "above your $0.05 soft budget");
    cy.get(".confirm-dialog .modal-action").contains("button", "Cancel").click({ force: true });
    cy.get(".confirm-dialog[open]").should("not.exist");
    cy.get('[data-test-claude-row="done"]').should("not.exist");
    cy.wrap(seen).should("have.length", 0);
    // Read anyway
    cy.get("[data-test-claude-read-run]").click({ force: true });
    cy.get(".confirm-dialog[open] .modal-action").contains("button", "Read anyway").click({ force: true });
    cy.get('[data-test-claude-row="done"]', { timeout: 20000 }).should("have.length", 1).and("have.css", "display", "flex");
    cy.wrap(seen).should("have.length", 1);
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth, "no sideways scroll").to.be.at.most(win.innerWidth);
      const strip = win.document.querySelector("[data-test-claude-read]") as HTMLElement;
      expect(strip.scrollWidth, "the strip fits").to.be.at.most(strip.clientWidth + 1);
    });
  });
});
