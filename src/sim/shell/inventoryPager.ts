// Wuthering Tools+ — the inventory on a phone (phone.css § 25): Ryan's echo pager (PaginationControls.vue inside
// InventoryEchoesBrowser.vue) swaps the 20 echoes on the page but leaves the scroll where it was, so after a tap on the
// bottom pager (or the sticky top one, mid-list) a phone shows the middle of the next page. One delegated click
// listener, no change to his files: after a page change below 768 px, the list scrolls back to its first echo, just
// under the sticky pager. A tap that changes nothing (the current page, a disabled arrow) does nothing.

const PHONE = "(max-width: 767px)";
/** the inventory page's list only: the classic calculator's echo browser modal uses the same pager classes, and its
 *  list scrolls inside the sheet, not the window */
const SCOPE = ".inventory__content";

/** Where the list's first echo should land: just under the nav and the sticky top pager. */
export function listTopTarget(listTop: number, scrollY: number, navH: number, pagerH: number): number {
  return Math.max(0, Math.round(scrollY + listTop - navH - pagerH - 8));
}

function onClick(event: MouseEvent): void {
  if (typeof window.matchMedia !== "function" || !window.matchMedia(PHONE).matches) return;
  const button = (event.target as Element | null)?.closest?.(`${SCOPE} .echoes__list__pagination button`);
  if (!button || (button as HTMLButtonElement).disabled || button.getAttribute("aria-current") === "page") return;
  // after Vue re-renders the page (a timer: rAF never fires in headless Electron)
  setTimeout(() => {
    const list = document.querySelector<HTMLElement>(`${SCOPE} .echoes__list__items`);
    if (!list) return;
    const top = list.getBoundingClientRect().top;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 0;
    const pager = document.querySelector<HTMLElement>(`${SCOPE} .echoes__list__pagination`);
    const pagerH = pager?.getBoundingClientRect().height ?? 0;
    // already showing the first echo under the pager: leave the page still
    if (top >= navH + pagerH && top < window.innerHeight / 2) return;
    window.scrollTo({ top: listTopTarget(top, window.scrollY, navH, pagerH), behavior: "auto" });
  }, 30);
}

let installed = false;
/** Installs the listener once (PlusShell.vue). */
export function installInventoryPagerJump(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("click", onClick);
}

/** Ryan's filter panels open by default (useFilterPanelOpen.ts); on a phone the inventory's Filters panel puts the first
 *  echo about two screens down. The first time the inventory opens on a phone, and only while the player has never
 *  toggled that panel, it starts folded — the same setting the panel's own toggle writes, so one tap brings it back
 *  and the choice sticks. */
export const INVENTORY_FILTER_PANEL = "inventory-echoes";

export function foldInventoryFiltersOnPhone(settings: {
  config: { filterPanelsOpen?: Record<string, boolean> } | null;
  // eslint-disable-next-line no-unused-vars -- the parameters of a method type
  addToConfig: (data: Record<string, unknown>) => void;
}): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function" || !window.matchMedia(PHONE).matches) return false;
  if (settings.config?.filterPanelsOpen?.[INVENTORY_FILTER_PANEL] !== undefined) return false;
  settings.addToConfig({ filterPanelsOpen: { [INVENTORY_FILTER_PANEL]: false } });
  return true;
}
