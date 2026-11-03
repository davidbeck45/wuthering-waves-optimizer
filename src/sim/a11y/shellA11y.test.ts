import { afterEach, describe, expect, it, vi } from "vitest";
import { focusReturn, installSkipLink, isPlusPath, markMain, scrollBehavior, setPlusScope, skipTarget } from "./shellA11y";

function layout(inner = "<p>page</p>"): HTMLElement {
  document.body.innerHTML = `<nav><a href="/">Calculator</a></nav><div class="contain"><div class="content">${inner}</div></div>`;
  return document.querySelector(".content") as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-wt-plus");
});

describe("plus scope", () => {
  it("covers PLUS_PAGES paths and the 404, not Ryan's pages", () => {
    const paths = ["/account", "/today"];
    expect(isPlusPath("/account", paths, false)).toBe(true);
    expect(isPlusPath("/", paths, false)).toBe(false);
    expect(isPlusPath("/teams", paths, false)).toBe(false);
    expect(isPlusPath("/nope", paths, true)).toBe(true);
  });
  it("toggles html[data-wt-plus]", () => {
    setPlusScope(document, true);
    expect(document.documentElement.hasAttribute("data-wt-plus")).toBe(true);
    setPlusScope(document, false);
    expect(document.documentElement.hasAttribute("data-wt-plus")).toBe(false);
  });
});

describe("main landmark and the skip link", () => {
  it("makes the RouterView box the main landmark, except on /rankings where Riley's <main> is one", () => {
    const content = layout();
    markMain(document, "/account");
    expect(content.getAttribute("role")).toBe("main");
    expect(content.id).toBe("wt-main");
    // no standing tabindex: a click on page text keeps focusing <body> (the shell's Esc for the Ask panel reads that)
    expect(content.hasAttribute("tabindex")).toBe(false);
    markMain(document, "/rankings");
    expect(content.hasAttribute("role")).toBe(false);
  });

  it("skips to Riley's <main> when there is one, else the RouterView box", () => {
    const content = layout("<main id='riley'>table</main>");
    markMain(document, "/rankings");
    expect(skipTarget(document)?.id).toBe("riley");
    content.innerHTML = "<p>account</p>";
    expect(skipTarget(document)).toBe(content);
  });

  it("puts one hidden link first in <body> that moves focus to the content", () => {
    const content = layout();
    markMain(document, "/today");
    content.scrollIntoView = vi.fn();
    const remove = installSkipLink(document);
    installSkipLink(document); // a second mount doesn't add another
    const links = document.querySelectorAll(".wt-skip-link");
    expect(links.length).toBe(1);
    expect(document.body.firstElementChild).toBe(links[0]);
    expect(links[0]!.textContent).toBe("Skip to content");
    (links[0] as HTMLAnchorElement).click();
    expect(document.activeElement).toBe(content);
    content.blur(); // focusable for the jump only
    expect(content.hasAttribute("tabindex")).toBe(false);
    remove();
    expect(document.querySelector(".wt-skip-link")).toBeNull();
  });
});

describe("focusReturn", () => {
  it("gives focus back to the opener when focus was left on the closed thing or on body", () => {
    document.body.innerHTML = `<button id="explain">Explain</button><section id="panel"><textarea id="q"></textarea></section><button id="ask">Ask</button>`;
    const inside = (el: Element) => !!el.closest("#panel");
    const f = focusReturn();
    (document.getElementById("explain") as HTMLElement).focus();
    f.remember(document, inside);
    (document.getElementById("q") as HTMLElement).focus();
    expect(f.restore(document, inside)).toBe(true);
    expect(document.activeElement?.id).toBe("explain");
  });

  it("falls back when the opener is gone, and keeps focus the player moved elsewhere", () => {
    document.body.innerHTML = `<button id="ask">Ask</button><section id="panel"></section><a id="link" href="#">elsewhere</a><button id="ask2">Ask</button>`;
    const inside = (el: Element) => !!el.closest("#panel");
    const f = focusReturn();
    (document.getElementById("ask") as HTMLElement).focus();
    f.remember(document, inside);
    document.getElementById("ask")!.remove(); // v-if'd away while the panel is open
    (document.activeElement as HTMLElement | null)?.blur();
    expect(f.restore(document, inside, () => document.getElementById("ask2"))).toBe(true);
    expect(document.activeElement?.id).toBe("ask2");

    (document.getElementById("ask2") as HTMLElement).focus();
    f.remember(document, inside);
    (document.getElementById("link") as HTMLElement).focus();
    expect(f.restore(document, inside)).toBe(false);
    expect(document.activeElement?.id).toBe("link");
  });
});

describe("scrollBehavior", () => {
  it("is smooth unless the system asks for reduced motion", () => {
    const win = (reduce: boolean) => ({ matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }) }) as never;
    expect(scrollBehavior(win(false))).toBe("smooth");
    expect(scrollBehavior(win(true))).toBe("auto");
    expect(scrollBehavior(undefined)).toBe("smooth");
  });
});
