// Wuthering Tools+ — the shell's landmarks and focus helpers (src/sim/README.md, "Contrast, focus and keyboard").
// Browser-only, no Vue; PlusShell calls these on every route change.

/** The page is a plus page (or the 404): a11y.css's muted-text floor and status-text tokens apply to the whole
 *  document there (html[data-wt-plus]). Ryan's pages keep his look; the plus shell's own surfaces carry it anywhere. */
export function isPlusPath(path: string, plusPaths: readonly string[], notFound: boolean): boolean {
  return notFound || plusPaths.includes(path);
}

export function setPlusScope(doc: Document, on: boolean): void {
  doc.documentElement.toggleAttribute("data-wt-plus", on);
}

export const MAIN_ID = "wt-main";

/** AppLayout's `.content` (the RouterView's box) becomes the page's main landmark and the skip link's target.
 *  /rankings already has one: Riley's markup is a <main>, and a second one around it would nest two. No standing
 *  tabindex: a click on the page's text would focus the box instead of <body>, and the shell's Esc closes the Ask
 *  panel only from the panel or from <body> (the skip link adds one while it holds focus). */
export function markMain(doc: Document, path: string): HTMLElement | null {
  const content = doc.querySelector<HTMLElement>(".contain > .content");
  if (!content) return null;
  content.setAttribute("data-wt-main", "");
  content.id ||= MAIN_ID;
  if (path === "/rankings") content.removeAttribute("role");
  else content.setAttribute("role", "main");
  return content;
}

/** Where "Skip to content" goes: Riley's <main> on /rankings, else the marked `.content`. */
export function skipTarget(doc: Document): HTMLElement | null {
  const content = doc.querySelector<HTMLElement>("[data-wt-main]");
  const inner = content?.querySelector<HTMLElement>("main") ?? null;
  return inner ?? content;
}

/** A "Skip to content" link as the first thing in <body> (a Teleport would append it): hidden until it has the
 *  keyboard's focus (a11y.css). Returns a remover. */
export function installSkipLink(doc: Document): () => void {
  const existing = doc.querySelector(".wt-skip-link");
  if (existing) return () => existing.remove();
  const link = doc.createElement("a");
  link.className = "wt-skip-link";
  link.href = `#${MAIN_ID}`;
  link.textContent = "Skip to content";
  link.setAttribute("data-test-skip-link", "");
  link.addEventListener("click", (event) => {
    const target = skipTarget(doc);
    if (!target) return;
    event.preventDefault();
    if (!target.hasAttribute("tabindex")) {
      target.tabIndex = -1; // focusable for this jump only (see markMain)
      target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    }
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: scrollBehavior() });
  });
  doc.body.prepend(link);
  return () => link.remove();
}

/** "smooth", unless the player asked their system for less motion. */
export function scrollBehavior(win: (Window & typeof globalThis) | undefined = typeof window === "undefined" ? undefined : window): ScrollBehavior {
  try {
    return win?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "smooth";
  }
}

/** Remembers where focus was when something opened and puts it back when it closes: the opener if it is still on
 *  the page, else `fallback()` (the Ask button is re-rendered while the panel is up, so the old node is gone). Only
 *  when focus is nowhere in particular (body) or still inside the closed thing: a click elsewhere keeps its focus. */
export function focusReturn() {
  let opener: HTMLElement | null = null;
  return {
    remember(doc: Document, inside?: (el: Element) => boolean): void {
      const el = doc.activeElement as HTMLElement | null;
      opener = el && el !== doc.body && !(inside && inside(el)) ? el : null;
    },
    restore(doc: Document, inside: (el: Element) => boolean, fallback?: () => HTMLElement | null): boolean {
      const now = doc.activeElement;
      const lost = !now || now === doc.body || inside(now);
      const target = opener && opener.isConnected ? opener : (fallback?.() ?? null);
      opener = null;
      if (!lost || !target) return false;
      target.focus({ preventScroll: true });
      return doc.activeElement === target;
    },
    get opener(): HTMLElement | null {
      return opener;
    },
  };
}
