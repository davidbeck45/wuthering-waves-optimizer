// Wuthering Tools+ — holds a section at the top of a scroller while what is above it fills in.
//
// The palette's "Cost to max: Aemeath" opens the /account drawer at that section. On a cold load the drawer is 881 px
// tall when it opens and 2,835 px a few seconds later (Best DMG, crit luck, what to invest in next and the echo check
// arrive one by one), so one `scrollIntoView` left the section at y 1193 of a 915 px screen (2026-11-08 hunt, L1).
// The section is put back each time the content above it changes size, until the player touches the drawer: from then
// on where it scrolls is theirs. It also stops by itself after PIN_MS, so a late change never moves a drawer someone
// is reading without having touched it.

/** how long the section is held when nobody touches the drawer */
export const PIN_MS = 20_000;
/** what the player does to take the scroll over */
const TAKEOVER = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/* eslint-disable no-unused-vars -- the parameters of interface methods and function types */
interface Observer {
  observe(el: Element): void;
  disconnect(): void;
}
export interface PinOptions {
  holdMs?: number;
  /** ResizeObserver, or a test's stand-in; null where the browser has none (the section is placed once) */
  observer?: ((onResize: () => void) => Observer) | null;
}
/* eslint-enable no-unused-vars */

const browserObserver = (): PinOptions["observer"] => (typeof ResizeObserver === "undefined" ? null : (onResize) => new ResizeObserver(() => onResize()));

/**
 * Scrolls `target()` to the top of `scroller` now and again whenever `content` (what the scroller scrolls) changes
 * size. Returns the release; it is safe to call twice.
 */
export function pinSection(scroller: HTMLElement, content: Element | null, target: () => Element | null, options: PinOptions = {}): () => void {
  const place = (): void => target()?.scrollIntoView({ block: "start" });
  place();
  const make = options.observer === undefined ? browserObserver() : options.observer;
  if (!make || !content) return () => undefined;

  let held = true;
  const observer = make(() => {
    if (held) place();
  });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const release = (): void => {
    if (!held) return;
    held = false;
    observer.disconnect();
    if (timer) clearTimeout(timer);
    for (const type of TAKEOVER) scroller.removeEventListener(type, release);
  };
  observer.observe(content);
  for (const type of TAKEOVER) scroller.addEventListener(type, release, { passive: true });
  timer = setTimeout(release, options.holdMs ?? PIN_MS);
  return release;
}
