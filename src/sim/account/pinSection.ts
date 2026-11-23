// Wuthering Tools+ — holds a section at the top of a scroller while what is above it fills in.
//
// The palette's "Cost to max: Aemeath" opens the /account drawer at that section. On a cold load the drawer is 881 px
// tall when it opens and 2,835 px a few seconds later (Best DMG, crit luck, what to invest in next and the echo check
// arrive one by one), so one `scrollIntoView` left the section at y 1193 of a 915 px screen (2026-11-08 hunt, L1).
// The section is put back each time the content above it changes size, until the player touches the drawer: from then
// on where it scrolls is theirs, and a section that still arrives above it no longer moves what they are reading
// (2026-11-23: Chromium's own scroll anchoring did not hold the dialog in every run, and the section was pushed
// 1,900 px down under the reader). It all stops by itself after PIN_MS.

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

/** how close to the drawer's top edge the section must start for the player to be reading it or below it */
const READING_EDGE_PX = 24;

/**
 * Scrolls `target()` to the top of `scroller` now and again whenever `content` (what the scroller scrolls) changes
 * size. Once the player touches the drawer the section is no longer put back at the top: it is kept where the player
 * has it on screen (content that arrives above it scrolls the drawer by its own height, so nothing moves under the
 * reader's thumb), and only while nothing above it is on screen, since that is content the player could be opening.
 * Browsers that anchor the scroll themselves already did that: the correction is then 0. Returns the release; it is
 * safe to call twice.
 */
export function pinSection(scroller: HTMLElement, content: Element | null, target: () => Element | null, options: PinOptions = {}): () => void {
  const place = (): void => target()?.scrollIntoView({ block: "start" });
  place();
  const make = options.observer === undefined ? browserObserver() : options.observer;
  if (!make || !content) return () => undefined;

  /** the section's top, from the drawer's top edge */
  const offsetOf = (el: Element): number => el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  let mode: "held" | "kept" | "off" = "held";
  /** where the section was on screen when the player last scrolled (kept mode) */
  let lastOffset: number | null = null;
  const note = (): void => {
    const el = target();
    lastOffset = el ? offsetOf(el) : null;
  };
  const keep = (): void => {
    const el = target();
    if (!el) return;
    const now = offsetOf(el);
    if (lastOffset !== null && lastOffset <= READING_EDGE_PX) {
      const moved = now - lastOffset;
      if (Math.abs(moved) >= 1) scroller.scrollTop += moved;
    }
    note();
  };
  const observer = make(() => {
    if (mode === "held") place();
    else if (mode === "kept") keep();
  });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const takeOver = (): void => {
    if (mode !== "held") return;
    mode = "kept";
    for (const type of TAKEOVER) scroller.removeEventListener(type, takeOver);
    note();
    scroller.addEventListener("scroll", note, { passive: true });
  };
  const release = (): void => {
    if (mode === "off") return;
    mode = "off";
    observer.disconnect();
    if (timer) clearTimeout(timer);
    for (const type of TAKEOVER) scroller.removeEventListener(type, takeOver);
    scroller.removeEventListener("scroll", note);
  };
  observer.observe(content);
  for (const type of TAKEOVER) scroller.addEventListener(type, takeOver, { passive: true });
  timer = setTimeout(release, options.holdMs ?? PIN_MS);
  return release;
}
