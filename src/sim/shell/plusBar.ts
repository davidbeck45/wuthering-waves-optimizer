// Wuthering Tools+ — a plus page's own action bar pinned to the bottom of a phone screen (the Echo plan's "Sonatas to
// set" bar, Build my team's run and save bars). Each one publishes its height as `--plus-bar-h` on <html>, so the Ask
// button and the page's bottom clearance sit above it instead of on its buttons (phone.css § 16). Only a bar that is
// really `position: fixed` counts: Build my team's bars sit in the page flow on a desktop. `{ pinned: true }` is for a
// line that ends a fixed-height page (the /rankings credit under Riley's scrolling table): always at the bottom.
//
// Give the element the class `wt-plus-bar` too: phone.css slides it down with Ryan's bottom bar when that tucks away.
import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";

export const PLUS_BAR_VAR = "--plus-bar-h";

// several bars can be up at once (a page with two): the variable is the tallest
const heights = new Map<symbol, number>();

// Writes only when the height moves: a custom property set on <html> restyles the whole page, and a write on every
// measure restarted a dialog's opening transition (the Echo plan's chip sheet sat 40 px low; account-rankings track).
function publish(): void {
  if (typeof document === "undefined") return;
  const value = `${Math.max(0, ...heights.values())}px`;
  const root = document.documentElement.style;
  if (root.getPropertyValue(PLUS_BAR_VAR) === value) return;
  root.setProperty(PLUS_BAR_VAR, value);
}

/** The height a bar takes from the bottom of the screen: its own when fixed and showing, else 0. */
export function pinnedHeight(el: HTMLElement | null, pinned = false): number {
  if (!el) return 0;
  const style = getComputedStyle(el);
  if ((!pinned && style.position !== "fixed") || style.display === "none" || style.visibility === "hidden") return 0;
  return Math.round(el.getBoundingClientRect().height);
}

export function usePlusBar(target: Ref<HTMLElement | null>, options: { pinned?: boolean } = {}): void {
  const id = Symbol("plus-bar");
  let observer: ResizeObserver | null = null;
  const measure = (): void => {
    heights.set(id, pinnedHeight(target.value, options.pinned));
    publish();
  };
  const onResize = (): void => measure();

  onMounted(() => {
    watch(
      target,
      (el) => {
        observer?.disconnect();
        observer = null;
        measure();
        if (el && typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(measure);
          observer.observe(el);
        }
      },
      { immediate: true, flush: "post" },
    );
    // a breakpoint can change `position` without changing the bar's size
    window.addEventListener("resize", onResize);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    window.removeEventListener("resize", onResize);
    heights.delete(id);
    publish();
  });
}
