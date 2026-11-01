// Wuthering Tools+ — the assistant's tools for the batch-2 pages (src/sim/ai/tools: energy_check, today, …) in the real
// app: a tool on Riley's engine runs on the main thread through the app's solver worker, a page tool runs in the tool
// worker with the localStorage keys it reads, and each answer offers its page as a button. No request ever reaches
// Anthropic: api.anthropic.com is intercepted (the CORS preflight too) and answered with scripted SSE streams — a first
// response that calls the tool, a second with the answer. v3 is seeded through onBeforeLoad, like assistant.cy.ts.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const KEY = "sk-ant-api03-cypress-000000000000000000AbCd";
const API = "https://api.anthropic.com";
const TEAM = "Cartethyia · Ciaccona · Chisa"; // wuwa_calc's t500 composition: measurable at the fixture's account

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

function sse(blocks: Block[], stopReason: "tool_use" | "end_turn", id: string): string {
  const usage = { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const events: Array<Record<string, unknown>> = [
    { type: "message_start", message: { id, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage } },
  ];
  blocks.forEach((block, index) => {
    if (block.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
      events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
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

const cors = (origin: string | string[] | undefined): Record<string, string> => ({ "access-control-allow-origin": String(origin ?? "*"), "access-control-expose-headers": "request-id" });

/** The first request gets a call to `tool`, every later one the answer. Returns the POST bodies seen. */
function stubAnthropic(tool: string, input: Record<string, unknown>, answer: string): any[] {
  const seen: any[] = [];
  cy.intercept("OPTIONS", `${API}/**`, (req) => {
    req.reply({
      statusCode: 204,
      headers: { ...cors(req.headers.origin), "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": String(req.headers["access-control-request-headers"] ?? "*") },
    });
  });
  cy.intercept("POST", `${API}/v1/messages*`, (req) => {
    seen.push(req.body);
    const first = seen.length === 1;
    const body = first
      ? sse([{ type: "text", text: "Let me check." }, { type: "tool_use", id: "toolu_cy_page_1", name: tool, input }], "tool_use", "msg_cy_page_1")
      : sse([{ type: "text", text: answer }], "end_turn", `msg_cy_page_${seen.length}`);
    req.reply({ statusCode: 200, headers: { ...cors(req.headers.origin), "content-type": "text/event-stream", "request-id": `req_cy_page_${seen.length}` }, body });
  }).as("messages");
  return seen;
}

function seed(options: { fontScale?: number; theme?: string; extra?: Record<string, string> } = {}) {
  const team = { id: "ap-t1", name: TEAM, characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions: [], duration: null };
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      win.localStorage.setItem("teamRotations", JSON.stringify({ teams: [team], favoriteTeamIds: [], favoritePresetNames: [] }));
      for (const [k, v] of Object.entries(options.extra ?? {})) win.localStorage.setItem(k, v);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false, ...(options.theme ? { theme: options.theme } : {}) };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      win.sessionStorage.setItem("wtplus:ai:key", KEY);
    },
    onLoad(win: Window) {
      if (!options.fontScale) return;
      const style = win.document.createElement("style");
      style.textContent = `html { font-size: ${options.fontScale * 100}%; }`;
      win.document.head.appendChild(style);
    },
  };
}

const toolResultOf = (body: any): any => {
  const results = (body.messages as any[]).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === "tool_result");
  const content = results[results.length - 1]?.content;
  return JSON.parse(typeof content === "string" ? content : content[0].text);
};

describe("the assistant on the batch-2 pages", { scrollBehavior: "center" }, () => {
  it("answers an ER question on /energy with Riley's engine, and links the page", () => {
    const seen = stubAnthropic("energy_check", { team: TEAM }, "Cartethyia's ER need for this team is in the tool result. See [the energy check](/energy).");
    cy.visit("/energy", seed());
    cy.get("[data-test-ai-open]").should("be.visible").click();
    // the page's own questions
    cy.get("[data-test-ai-suggestion]").should("have.length.at.least", 3).first().should("contain.text", "Energy Regen");
    cy.get("[data-test-ai-input]").type("What ER does Cartethyia need in this team?{enter}");
    cy.get("[data-test-ai-tool-row=energy_check]", { timeout: 90000 }).should("have.attr", "data-test-ai-tool-status", "ok");
    cy.get("[data-test-ai-tool-row=energy_check]").should("contain.text", "Energy check");
    cy.get("[data-test-ai-answer-text]", { timeout: 30000 }).should("contain.text", "ER need");
    cy.wrap(seen).its("length").should("eq", 2);
    cy.wrap(seen).then((bodies) => {
      const names = (bodies[0].tools as Array<{ name: string; strict: boolean }>).map((t) => t.name);
      expect(names, "twenty strict tools").to.have.length(20);
      expect(names.slice(12)).to.deep.equal(["energy_check", "team_rotation", "toa_check", "build_team_plan", "echo_lab", "weapon_value", "pull_advice", "today"]);
      expect(JSON.stringify(bodies[0].tools), "routing flags stay in the app").not.to.match(/"riley"|"reads"/);
      const result = toolResultOf(bodies[1]);
      expect(result.measured, "a wuwa_calc composition is measured").to.equal(true);
      const carte = result.members.find((m: any) => m.character === "Cartethyia");
      expect(carte.erNeedPct, "her need for t500's loop").to.be.greaterThan(100);
      expect(carte.erHavePct, "her build's ER (the fixture wears none)").to.equal(100);
      expect(carte.status).to.equal("short");
      expect(carte.erRollsShort).to.be.at.least(1);
      expect(result.members.find((m: any) => m.character === "Ciaccona").status).to.match(/not set up/);
    });
    cy.get("[data-test-ai-route-link='/energy']").should("exist");
  });

  it("reads /today's caches through the tool worker on a 412 px phone at 130 % text, and opens the page", () => {
    cy.viewport(412, 915);
    const prefs = JSON.stringify({ v: 1, tab: "advisor", server: "europe", budgetAstrite: null, manualPity: {} });
    const state = JSON.stringify({ v: 1, waveplates: { value: 120, crystals: 0, atMs: Date.now() }, ticks: {}, hidden: [], timeMode: "local", notify: false, showLive: true });
    const seen = stubAnthropic("today", {}, "The next daily reset is in the tool result. Open [Today](/today) for the rest.");
    cy.visit("/account", seed({ fontScale: 1.3, extra: { "wtplus:convene:prefs": prefs, "wtplus:today:v1": state } }));
    cy.get("[data-test-ai-open]").should("be.visible").click();
    cy.get("[data-test-ai-input]").type("When's the reset?{enter}");
    cy.get("[data-test-ai-tool-row=today]", { timeout: 60000 }).should("have.attr", "data-test-ai-tool-status", "ok");
    cy.get("[data-test-ai-tool-row=today] [data-test-ai-tool-headline]").should("contain.text", "reset");
    cy.get("[data-test-ai-answer-text]", { timeout: 30000 }).should("contain.text", "daily reset");
    cy.wrap(seen).then((bodies) => {
      const result = toolResultOf(bodies[1]);
      expect(result.serverClock, "the server setting crossed into the worker").to.equal("europe (UTC+1)");
      expect(result.waveplates.now, "the logged Waveplates").to.be.within(120, 121);
    });
    cy.get("[data-test-ai-panel]").then(($panel) => {
      const body = $panel[0].querySelector("[data-test-ai-body]") as HTMLElement;
      expect(body.scrollWidth, "no sideways scroll inside the sheet").to.be.at.most(body.clientWidth);
    });
    cy.get("[data-test-ai-route-link='/today']").first().click();
    cy.location("pathname").should("eq", "/today");
  });
});
