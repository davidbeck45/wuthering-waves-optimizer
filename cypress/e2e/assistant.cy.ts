// Wuthering Tools+ — the Claude assistant and the command palette (src/sim/ai/ui, src/sim/shell). No request ever
// reaches Anthropic: every call to api.anthropic.com is intercepted (the CORS preflight too) and answered with a
// scripted server-sent-event stream — a first response that calls get_account_summary, a second with the answer.
// v3 is seeded through onBeforeLoad (the support file seeds classic for specs that don't).
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const KEY = "sk-ant-api03-cypress-000000000000000000AbCd";
const API = "https://api.anthropic.com";

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

/** One streamed Messages API response, as the SSE body the SDK parses. */
function sse(blocks: Block[], stopReason: "tool_use" | "end_turn", id: string): string {
  const usage = { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const events: Array<Record<string, unknown>> = [
    { type: "message_start", message: { id, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage } },
  ];
  blocks.forEach((block, index) => {
    if (block.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      // two deltas, so the answer visibly streams
      const half = Math.ceil(block.text.length / 2);
      events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text.slice(0, half) } });
      events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text.slice(half) } });
    } else {
      events.push({ type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
      events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
    }
    events.push({ type: "content_block_stop", index });
  });
  events.push({ type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 120 } });
  events.push({ type: "message_stop" });
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
}

const XSS = '<img src="x" onerror="window.__wtXss = 1">';
const ANSWER =
  "You have **Cartethyia** set up, with a saved rotation.\n\n" +
  "| Character | Sequence |\n|---|--:|\n| Cartethyia | S0 |\n\n" +
  `- Raise her Crit DMG first\n- Then her sequence\n\nA raw tag stays text: ${XSS}\n\nSee [your roster](/my-rankings).`;

const FIRST = sse(
  [
    { type: "text", text: "Let me look at your account." },
    { type: "tool_use", id: "toolu_cy_1", name: "get_account_summary", input: {} },
  ],
  "tool_use",
  "msg_cy_1",
);
const SECOND = sse([{ type: "text", text: ANSWER }], "end_turn", "msg_cy_2");

function corsHeaders(origin: string | string[] | undefined): Record<string, string> {
  return { "access-control-allow-origin": String(origin ?? "*"), "access-control-expose-headers": "request-id" };
}

/** Stubs every Anthropic request; returns the POST bodies/headers seen. */
function stubAnthropic(options: { delayFirst?: number } = {}): Array<{ headers: Record<string, string | string[]>; body: any }> {
  const seen: Array<{ headers: Record<string, string | string[]>; body: any }> = [];
  cy.intercept("OPTIONS", `${API}/**`, (req) => {
    req.reply({
      statusCode: 204,
      headers: {
        ...corsHeaders(req.headers.origin),
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": String(req.headers["access-control-request-headers"] ?? "*"),
        "access-control-max-age": "600",
      },
    });
  }).as("preflight");
  cy.intercept("POST", `${API}/v1/messages*`, (req) => {
    seen.push({ headers: req.headers, body: req.body });
    const first = seen.length === 1;
    req.reply({
      statusCode: 200,
      headers: { ...corsHeaders(req.headers.origin), "content-type": "text/event-stream", "request-id": `req_cy_${seen.length}` },
      body: first ? FIRST : SECOND,
      ...(first && options.delayFirst ? { delay: options.delayFirst } : {}),
    });
  }).as("messages");
  cy.intercept("GET", `${API}/v1/models/*`, (req) => {
    req.reply({
      statusCode: 200,
      headers: { ...corsHeaders(req.headers.origin), "content-type": "application/json" },
      body: { type: "model", id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-09-01T00:00:00Z" },
    });
  }).as("models");
  return seen;
}

function seedV3(options: { key?: boolean; fontScale?: number } = {}) {
  const character = JSON.parse(configOptimizer.data.character);
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", JSON.stringify(character));
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      if (options.key) win.sessionStorage.setItem("wtplus:ai:key", KEY);
    },
    onLoad(win: Window) {
      if (!options.fontScale) return;
      const style = win.document.createElement("style");
      style.textContent = `html { font-size: ${options.fontScale * 100}%; }`;
      win.document.head.appendChild(style);
    },
  };
}

function ask(question: string) {
  cy.get("[data-test-ai-input]").should("be.visible").type(question);
  cy.get("[data-test-ai-input]").type("{enter}");
}

// center scrolling: the panel's header is sticky, and top-scrolling would park the element under it
describe("Claude assistant", { scrollBehavior: "center" }, () => {
  it("walks a player without a key through onboarding, stores a stubbed key and tests it", () => {
    stubAnthropic();
    cy.visit("/", seedV3());
    cy.get("[data-test-ai-open]").should("be.visible").click();
    cy.get("[data-test-ai-panel]").should("be.visible");
    cy.get("[data-test-ai-onboarding]").within(() => {
      cy.contains("Bring your own Claude key");
      cy.get("[data-test-ai-console-link]").should("have.attr", "href").and("include", "console.anthropic.com");
      cy.contains("monthly spend limit");
      cy.get("[data-test-ai-privacy]").should("contain.text", "only when you ask").and("contain.text", "Nothing goes to our servers");
      cy.get("[data-test-ai-costs] li").should("have.length", 3);
      cy.get("[data-test-ai-key-input]").type("not-a-key");
      cy.get("[data-test-ai-key-save]").click();
      cy.get("[data-test-ai-key-error]").should("be.visible").and("contain.text", "sk-ant-");
      cy.get("[data-test-ai-key-input]").clear();
      cy.get("[data-test-ai-key-input]").type(KEY);
      cy.get("[data-test-ai-key-save]").click();
    });
    cy.get("[data-test-ai-onboarding]").should("not.exist");
    cy.get("[data-test-ai-empty]").should("be.visible");
    cy.get("[data-test-ai-suggestion]").should("have.length.at.least", 3);
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem("wtplus:ai:key"), "key kept for this tab").to.equal(KEY);
      expect(win.localStorage.getItem("wtplus:ai:key"), "not remembered").to.equal(null);
    });

    // AI settings: masked key, Test key (one tiny GET, stubbed), the model list
    cy.get("[data-test-ai-settings]").click();
    cy.get("[data-test-ai-settings-dialog]").should("be.visible").within(() => {
      cy.get("[data-test-ai-key-hint]").should("contain.text", "…AbCd").and("not.contain.text", "cypress-0000");
      cy.get("[data-test-ai-model-option]").should("have.length", 3);
      cy.get("[data-test-ai-key-test]").click();
    });
    cy.wait("@models").its("request.headers.authorization").should("equal", `Bearer ${KEY}`);
    cy.get("[data-test-ai-key-test-result]").should("contain.text", "Claude Opus 5.5");
    cy.get("[data-test-ai-settings-done]").click();
    cy.get("[data-test-ai-settings-dialog]").should("not.exist");
  });

  it("asks, shows the tool row, renders the answer as safe markdown and links to app pages", () => {
    const seen = stubAnthropic();
    cy.visit("/", seedV3({ key: true }));
    cy.get("body").type("{ctrl}j");
    cy.get("[data-test-ai-panel]").should("be.visible");
    ask("Which of my characters is set up?");

    cy.get("[data-test-ai-tool-row=get_account_summary]", { timeout: 20000 }).should("have.attr", "data-test-ai-tool-status", "ok");
    cy.get("[data-test-ai-answer-text]", { timeout: 20000 }).should("contain.text", "set up, with a saved rotation");
    cy.get("[data-test-ai-answer]").last().within(() => {
      cy.get("strong").should("contain.text", "Cartethyia");
      cy.get("table td").should("contain.text", "Cartethyia");
      cy.get("li").should("have.length.at.least", 2);
      // the raw tag in the answer is text, never an element
      cy.get("img").should("not.exist");
      cy.root().should("contain.text", '<img src="x" onerror=');
      cy.get("[data-test-ai-provenance]").should("contain.text", "Your account");
    });
    cy.window().its("__wtXss").should("be.undefined");

    cy.wrap(seen).should("have.length", 2);
    cy.then(() => {
      const [first, second] = seen;
      expect(first.headers.authorization).to.equal(`Bearer ${KEY}`);
      expect(first.headers["anthropic-dangerous-direct-browser-access"]).to.equal("true");
      expect(first.body.model).to.equal("claude-opus-5-5");
      expect(first.body.output_config).to.deep.equal({ effort: "medium" });
      expect(first.body).not.to.have.property("thinking");
      expect(first.body).not.to.have.property("temperature");
      expect(first.body.messages[0]).to.deep.equal({ role: "user", content: "Which of my characters is set up?" });
      expect(first.body.messages[1].role).to.equal("system");
      // turn two sends the tool result back in one user message, after the assistant turn unchanged
      expect(second.body.messages[2].content[1]).to.deep.include({ type: "tool_use", id: "toolu_cy_1", name: "get_account_summary" });
      expect(second.body.messages[3].content[0]).to.include({ type: "tool_result", tool_use_id: "toolu_cy_1" });
    });

    // an in-app link goes through the router; the cost meter moved
    cy.get("[data-test-ai-cost]").should("not.contain.text", "$0.00");
    cy.get("[data-test-ai-route-link='/my-rankings']").click();
    cy.location("pathname").should("eq", "/my-rankings");

    // the conversation survives a reload (sessionStorage) and Esc closes the panel
    cy.reload();
    cy.get("[data-test-ai-open]").click();
    cy.get("[data-test-ai-question]").should("contain.text", "Which of my characters is set up?");
    cy.get("[data-test-ai-input]").type("{esc}");
    cy.get("[data-test-ai-panel]").should("not.be.visible");
    cy.get("[data-test-ai-open]").should("be.visible");
  });

  it("stops a slow answer and gives the question back", () => {
    stubAnthropic({ delayFirst: 15000 });
    cy.visit("/", seedV3({ key: true }));
    cy.get("[data-test-ai-open]").click();
    ask("What should I invest in next?");
    cy.get("[data-test-ai-thinking]").should("be.visible");
    cy.get("[data-test-ai-stop]").should("be.visible").click();
    cy.get("[data-test-ai-notice-kind=stopped]").should("contain.text", "Stopped.");
    cy.get("[data-test-ai-input]").should("have.value", "What should I invest in next?");
    cy.get("[data-test-ai-send]").should("be.visible");
  });

  it("lets the nav's own menus open over the open panel", () => {
    cy.viewport(1280, 800);
    stubAnthropic();
    cy.visit("/", seedV3({ key: true }));
    cy.get("[data-test-ai-open]").click();
    cy.get("[data-test-ai-panel]").should("be.visible");
    cy.get("[data-test-options-menu] > [role=button]").focus();
    cy.get("#navbar-container").should("have.css", "z-index", "61");
    cy.get("[data-test-options-menu] .dropdown-content").should(($menu) => {
      const r = $menu[0].getBoundingClientRect();
      const hit = $menu[0].ownerDocument.elementFromPoint(r.left + r.width / 2, r.top + 24);
      expect(Boolean(hit && $menu[0].contains(hit)), "the utility menu is on top of the panel").to.equal(true);
    });
  });

  it("opens the command palette with Ctrl+K and jumps to /my-rankings", () => {
    stubAnthropic();
    cy.visit("/", seedV3());
    cy.get("[data-test-ai-open]").should("be.visible");
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette]").should("be.visible");
    cy.get("[data-test-ai-open]").should("not.exist");
    cy.get("[data-test-palette-input]").should("be.focused").type("roster rank");
    cy.get("[data-test-palette-item='page:/my-rankings']").should("exist");
    cy.get("[data-test-palette-input]").type("{enter}");
    cy.location("pathname").should("eq", "/my-rankings");
    cy.get("[data-test-palette]").should("not.exist");

    // a question goes to Claude (the panel opens on its onboarding: no key here)
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-input]").type("why is my team lower than riley's?");
    cy.get("[data-test-palette-item=ask]").should("have.attr", "aria-selected", "true");
    cy.get("[data-test-palette-input]").type("{enter}");
    cy.get("[data-test-ai-onboarding]").should("be.visible");
  });

  it("fits a 412 px phone at 130 % text as a bottom sheet", () => {
    cy.viewport(412, 915);
    stubAnthropic();
    cy.visit("/", seedV3({ key: true, fontScale: 1.3 }));
    cy.get("[data-test-ai-open]").should("be.visible").click();
    ask("Which of my characters is set up?");
    cy.get("[data-test-ai-answer-text]", { timeout: 20000 }).should("contain.text", "saved rotation");
    cy.get("[data-test-ai-panel]").then(($panel) => {
      const rect = $panel[0].getBoundingClientRect();
      expect(rect.left, "sheet left").to.be.at.least(0);
      expect(rect.right, "sheet right").to.be.at.most(412);
      expect(rect.height, "sheet height ≤ 85dvh").to.be.at.most(915 * 0.85 + 1);
      const body = $panel[0].querySelector("[data-test-ai-body]") as HTMLElement;
      expect(body.scrollWidth, "no sideways scroll inside the sheet").to.be.at.most(body.clientWidth);
    });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth, "page width").to.be.at.most(doc.documentElement.clientWidth);
    });
    // the onboarding fits too
    cy.window().then((win) => win.sessionStorage.removeItem("wtplus:ai:key"));
    cy.reload();
    cy.get("[data-test-ai-open]").click();
    cy.get("[data-test-ai-onboarding]").should("be.visible");
    cy.get("[data-test-ai-body]").then(($body) => {
      expect($body[0].scrollWidth, "onboarding has no sideways scroll").to.be.at.most($body[0].clientWidth);
    });
  });
});
