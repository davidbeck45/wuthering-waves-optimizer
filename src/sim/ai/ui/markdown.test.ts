// Wuthering Tools+ AI: the markdown subset Claude's answers render with — what it supports, and that model output
// can never become HTML (MarkdownView builds VNodes whose text is always a text node).
import { createApp, h, nextTick } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { describe, expect, it } from "vitest";
import { inlineText, parseInline, parseMarkdown, safeHref, type Block } from "./markdown";
import MarkdownView from "./MarkdownView";

const ROUTES = ["/", "/my-rankings", "/rankings", "/teams", "/inventory"];
const isRoute = (p: string): boolean => ROUTES.includes(p.split(/[?#]/)[0]);

describe("safeHref", () => {
  it("allows http(s) with a host and the routes the app knows, nothing else", () => {
    expect(safeHref("https://wuthering.gg/x")).toEqual({ href: "https://wuthering.gg/x", kind: "external" });
    expect(safeHref("http://example.com")).toMatchObject({ kind: "external" });
    expect(safeHref("/my-rankings", { isRoute })).toEqual({ href: "/my-rankings", kind: "route" });
    expect(safeHref("/rankings#tc=mine", { isRoute })).toMatchObject({ kind: "route" });
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "//evil.example/x", "/admin", "file:///etc/passwd", "https://", "https://a b.com", 'https://x.com/"onmouseover="x']) {
      expect(safeHref(bad, { isRoute }), bad).toBeNull();
    }
    expect(safeHref("/my-rankings"), "a route without a resolver").toBeNull();
  });
});

describe("parseMarkdown", () => {
  it("parses paragraphs, headings, emphasis, code, lists, tables, quotes and rules", () => {
    const md = [
      "## Your best team",
      "",
      "It averages **9.47M** with *every* buff and `calc_team` agrees.",
      "Second line.",
      "",
      "- one",
      "- two",
      "  - nested",
      "",
      "1. first",
      "2. second",
      "",
      "| Member | Share |",
      "|---|--:|",
      "| Aemeath | 84.2 % |",
      "",
      "> quoted",
      "",
      "---",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.t)).toEqual(["h", "p", "list", "list", "table", "quote", "hr", "code"]);
    const p = blocks[1] as Extract<Block, { t: "p" }>;
    expect(p.c.map((n) => n.t)).toEqual(["text", "strong", "text", "em", "text", "code", "text", "br", "text"]);
    const list = blocks[2] as Extract<Block, { t: "list" }>;
    expect(list.items).toHaveLength(2);
    expect(list.items[1].sub?.t).toBe("list");
    const ordered = blocks[3] as Extract<Block, { t: "list" }>;
    expect(ordered.ordered).toBe(true);
    const table = blocks[4] as Extract<Block, { t: "table" }>;
    expect(table.align).toEqual([null, "right"]);
    expect(inlineText(table.rows[0][1])).toBe("84.2 %");
    expect(blocks[7]).toEqual({ t: "code", lang: "ts", v: "const x = 1;" });
  });

  it("keeps snake_case identifiers whole and tolerates a half-streamed answer", () => {
    expect(parseInline("call calc_team then rank_roster").map((n) => n.t)).toEqual(["text"]);
    const partial = parseMarkdown("Here is **bold and an open\n\n```json\n{ \"a\": 1");
    expect(partial.map((b) => b.t)).toEqual(["p", "code"]);
    expect(inlineText((partial[0] as Extract<Block, { t: "p" }>).c)).toBe("Here is **bold and an open");
  });

  it("links bare URLs and known in-app paths, and drops unsafe link targets but keeps their words", () => {
    const nodes = parseInline("See /my-rankings or https://example.com/a. [click](javascript:alert(1)) and [team](/teams)", { isRoute });
    const links = nodes.filter((n) => n.t === "link");
    expect(links.map((l) => (l as { href: string }).href)).toEqual(["/my-rankings", "https://example.com/a", "/teams"]);
    expect(inlineText(nodes)).toContain("click");
    expect(nodes.some((n) => n.t === "link" && n.href.startsWith("javascript"))).toBe(false);
    expect(parseInline("see /unknown-page", { isRoute }).every((n) => n.t === "text")).toBe(true);
  });

  it("leaves raw HTML as literal text", () => {
    const blocks = parseMarkdown('Hi <img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(inlineText((blocks[0] as Extract<Block, { t: "p" }>).c)).toBe('Hi <img src=x onerror="alert(1)"> <script>alert(2)</script>');
  });
});

describe("MarkdownView", () => {
  async function render(source: string): Promise<HTMLElement> {
    const router = createRouter({ history: createMemoryHistory(), routes: ROUTES.map((path) => ({ path, component: { render: () => null } })) });
    const el = document.createElement("div");
    document.body.appendChild(el);
    createApp({ render: () => h(MarkdownView, { source, isRoute }) }).use(router).mount(el);
    await nextTick();
    return el;
  }

  it("never turns model output into elements", async () => {
    const el = await render('**x** <img src=x onerror="window.__pwned=1"> <a href="javascript:alert(1)">y</a> [z](javascript:alert(1))');
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("script")).toBeNull();
    expect([...el.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([]);
    expect(el.textContent).toContain('<img src=x onerror="window.__pwned=1">');
    expect((window as { __pwned?: number }).__pwned).toBeUndefined();
    expect(el.querySelector("strong")?.textContent).toBe("x");
  });

  it("opens external links in a new tab without an opener and routes in-app links", async () => {
    const el = await render("[guide](https://example.com/g) and [roster](/my-rankings)");
    const [ext, route] = [...el.querySelectorAll("a")];
    expect(ext.getAttribute("target")).toBe("_blank");
    expect(ext.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    expect(route.getAttribute("href")).toBe("/my-rankings");
    expect(route.hasAttribute("data-test-ai-route-link")).toBe(true);
  });
});
