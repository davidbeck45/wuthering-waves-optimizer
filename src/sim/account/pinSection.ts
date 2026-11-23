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

/**
 * Scrolls `target()` to the top of `scroller` now and again whenever `content` (what the scroller scrolls) changes
 * size. Once the player touches the drawer the section is no longer put back at the top; instead the first block of
 * `content` the player can see is kept where it is on screen: a block that arrives or grows above it scrolls the drawer
 * by as much, so nothing moves under the reader's thumb, and a fold the player opens inside what they see grows below
 * that block's top and moves nothing. Browsers that anchor the scroll themselves already did it: the correction is then
 * 0. Returns the release; it is safe to call twice.
 */
export function pinSection(scroller: HTMLElement, content: Element | null, target: () => Element | null, options: PinOptions = {}): () => void {
  /** an element's top, from the drawer's top edge */
  const offsetOf = (el: Element): number => el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  /** where placing the section puts it: the first line the player sees (the phone drawer is a sheet whose first
   *  visible line is 110 px below its own top edge, so it is measured, not 0) */
  let home = 0;
  const place = (): void => {
    const el = target();
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    home = offsetOf(el);
  };
  place();
  const make = options.observer === undefined ? browserObserver() : options.observer;
  if (!make || !content) return () => undefined;

  let mode: "held" | "kept" | "off" = "held";
  /** the first block the player sees, where it was on screen, and the content's height when that was read (kept mode) */
  let anchor: { el: Element; offset: number } | null = null;
  let height = 0;
  const heightNow = (): number => content.getBoundingClientRect().height;
  const note = (): void => {
    const top = scroller.getBoundingClientRect().top + home;
    const el = Array.from(content.children).find((c) => c.getBoundingClientRect().bottom > top + 1) ?? null;
    anchor = el ? { el, offset: offsetOf(el) } : null;
    height = heightNow();
  };
  // A scroll event is dispatched before the resize observer in the same frame: one that lands after a block arrived
  // and before its resize is handled (the pin's last placement, the browser's own anchoring) would read the anchor
  // after the jump, and the jump would stand. The resize goes first; it reads the anchor again after its correction.
  const onScroll = (): void => {
    if (heightNow() === height) note();
  };
  const keep = (): void => {
    if (anchor && content.contains(anchor.el)) {
      const moved = offsetOf(anchor.el) - anchor.offset;
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
    scroller.addEventListener("scroll", onScroll, { passive: true });
  };
  const release = (): void => {
    if (mode === "off") return;
    mode = "off";
    observer.disconnect();
    if (timer) clearTimeout(timer);
    for (const type of TAKEOVER) scroller.removeEventListener(type, takeOver);
    scroller.removeEventListener("scroll", onScroll);
  };
  observer.observe(content);
  for (const type of TAKEOVER) scroller.addEventListener(type, takeOver, { passive: true });
  timer = setTimeout(release, options.holdMs ?? PIN_MS);
  return release;
}
