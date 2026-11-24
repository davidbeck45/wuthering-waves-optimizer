/**
 * Wuthering Tools+ — hosts Riley31415/wuwa_calc's Tier List (`tierlist.html`, `src/page/tierlist.ts`) and Value page
 * (`value.html`, `src/page/value.ts`) inside the app, at `/tier-list` and `/roster-value`.
 *
 * The pattern is the one `../rankings/controller.ts` uses for his comparison and team pages: his modules straight
 * from the submodule (`@skittle/*`), imported lazily after the DOM they look up at import time exists inside a
 * persistent `.skittle-root`, his stylesheet through the scoped `skittle.css`, his pool as `rileyPool.ts`. Unlike
 * index.ts, tierlist.ts and value.ts export nothing: they wire `#app` and boot when imported. So each page gets its
 * own root (one `#app` each, only one in the document at a time), imported once, and driven afterwards through its
 * own controls (a `change` on his `#cost` select runs his handler: options re-read, solved, redrawn).
 *
 * Three things of his that a single-page app cannot take as they are:
 *  - `addEventListener("hashchange", () => location.reload())` in both boots: on a page of its own a typed-in link is
 *    a page load, in the app it would reload the whole app on every hash change anywhere (/rankings writes its hash
 *    on every filter). The registration is held back while his module evaluates (`withoutHashReload`), and a later
 *    visit with another hash is re-read here (`resync`);
 *  - his `loading.ts` takes `#loading` once, when first imported, by whichever page imports it first. The one
 *    overlay is moved into the page on show and back where it came from on leave (`adoptOverlay`); when these pages
 *    imported it first, /rankings' own box is swapped for it when that page mounts (`watchRankingsOverlay`);
 *  - his links are relative to his pages (`./team#t=…`, `./#…`): a click is routed to /rankings (`onLinkClick`).
 * Map: tierlist.ts boot()/load() and value.ts boot()/load() run as he wrote them; their `change` handlers are what
 * `resync` dispatches to; value.ts reads `wuwa.owned.v1` in `prepare()`, which ownedSet.ts writes first.
 */
import type { Router } from "vue-router";
import * as pool from "../rankings/rileyPool";
import { patchFetch, updateAccountState, type AccountRegistration } from "../rankings/controller";
import { accountOwnedSet, decideOwned, ownedLine, rosterOf, type OwnedSource } from "./ownedSet";
import { rankingsTargetOf } from "./links";
import { RARITY } from "../rankings/rileyNames";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type RileyPageKind = "tierlist" | "value";

/** His `wuwa.owned.v1` (value.ts OWNED_KEY) and what plus last wrote there (ownedSet.ts rule 3). */
export const OWNED_KEY = "wuwa.owned.v1";
export const APPLIED_KEY = "wtplus:rosterValue.applied";

const OVERLAY = `
  <div id="loading">
    <p class="loading-status">
      <span class="status-text">Initializing…</span>
      <span class="progress-count"></span>
    </p>
    <div class="progress-track"><div class="progress-fill"></div></div>
    <p class="wt-sofar-note">The list shows the teams solved so far.</p>
    <img class="loading-gif" src="/sim/loading.gif" alt="" width="110" height="79">
    <pre class="loading-error" hidden></pre>
  </div>`;

interface Page { root: HTMLElement; app: HTMLElement; booted: boolean }
const pages = new Map<RileyPageKind, Page>();
let shared: { solver: any; model: any; loading: any } | null = null;
let router: Router | null = null;
let current: RileyPageKind | null = null;

function buildRoot(kind: RileyPageKind): Page {
  const root = document.createElement("div");
  root.className = `skittle-root wt-riley-pages wt-riley-${kind}`;
  // his pages' body class is `valuepage` (both of them); the scoped sheet reads it as `.skittle-root .valuepage`
  root.innerHTML = `<div class="valuepage wt-riley-body"><div id="app"></div></div>`;
  // his handlers sit on `#app` and ours on the root; a `change` going further reaches his table.ts, which listens on the
  // whole document for `#cost` and `#matrixToggle` once /rankings has loaded it and would run a /rankings pass off-screen
  root.addEventListener("change", (e) => e.stopPropagation());
  // his "Best Team DPR" / "Neutral Score Gain" headings switch what the figures read on a click, but are divs: each one
  // he draws becomes a button for the keyboard (Enter or Space), focus kept on it across his redraw
  const app = root.querySelector<HTMLElement>("#app")!;
  const asButtons = (): void => {
    for (const h of app.querySelectorAll<HTMLElement>(".modehead:not([tabindex])")) {
      h.tabIndex = 0;
      h.setAttribute("role", "button");
    }
  };
  new MutationObserver(asButtons).observe(app, { childList: true, subtree: true });
  root.addEventListener("keydown", (e) => {
    const h = (e.target as Element).closest?.<HTMLElement>(".modehead");
    if (!h || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    const at = [...app.querySelectorAll(".modehead")].indexOf(h);
    h.click();
    asButtons();
    app.querySelectorAll<HTMLElement>(".modehead")[at]?.focus();
  });
  return { root, app: root.querySelector<HTMLElement>("#app")!, booted: false };
}

/* --------------------------------------------------------------------------- the one overlay */
let overlayHome: { parent: Node; next: Node | null } | null = null;
let ownOverlay: HTMLElement | null = null;
function adoptOverlay(page: Page): void {
  const el: HTMLElement = shared!.loading.overlay;
  if (el.parentNode === page.root.firstElementChild) return;
  overlayHome = el.parentNode && !(el.parentNode as Element).closest?.(".wt-riley-pages") ? { parent: el.parentNode, next: el.nextSibling } : overlayHome;
  page.root.firstElementChild!.appendChild(el);
}
function returnOverlay(): void {
  const el: HTMLElement | undefined = shared?.loading.overlay;
  if (!el || !overlayHome) return;
  overlayHome.parent.insertBefore(el, overlayHome.next?.parentNode === overlayHome.parent ? overlayHome.next : null);
  overlayHome = null;
}
/** /rankings built its own `#loading` after his loading.ts took ours: put his loading.ts's box in its place. */
let rankingsWatch: MutationObserver | null = null;
function watchRankingsOverlay(): void {
  if (rankingsWatch) return;
  rankingsWatch = new MutationObserver(() => {
    const el: HTMLElement = shared!.loading.overlay;
    const theirs = document.querySelector<HTMLElement>(".skittle-root:not(.wt-riley-pages) #loading");
    if (!theirs || theirs === el) return;
    theirs.replaceWith(el);
    rankingsWatch?.disconnect();
    rankingsWatch = null;
  });
  rankingsWatch.observe(document.body, { childList: true, subtree: true });
}

/** His boot's `hashchange → location.reload()`, held back while `load` runs (his module evaluating). */
async function withoutHashReload<T>(load: () => Promise<T>): Promise<T> {
  const real = window.addEventListener;
  window.addEventListener = function (this: Window, type: string, ...rest: any[]) {
    if (type === "hashchange") return;
    return (real as any).call(this, type, ...rest);
  } as typeof window.addEventListener;
  try {
    return await load();
  } finally {
    window.addEventListener = real;
  }
}

async function loadShared(page: Page): Promise<void> {
  if (shared) return;
  // a `#loading` for his loading.ts to take, in case it has not been imported yet (a first visit here)
  const holder = document.createElement("div");
  holder.innerHTML = OVERLAY;
  ownOverlay = holder.firstElementChild as HTMLElement;
  page.root.firstElementChild!.appendChild(ownOverlay);
  const [solver, model, loading] = await Promise.all([
    import("@skittle/solve/solver"), import("@skittle/page/model"), import("@skittle/page/loading"),
  ]);
  shared = { solver, model, loading };
  if (loading.overlay !== ownOverlay) ownOverlay.remove();
  else watchRankingsOverlay();
  // the same binding /rankings makes; harmless twice
  pool.bindEngine({ ...solver, picksCache: model.picksCache, storeSolved: model.storeSolved, solveFits: model.solveFits });
}

/** The account on the page and in every worker (what `mine` runs on), as /rankings registers it. */
function registerAccount(acct: AccountRegistration | null): void {
  const { solver } = shared!;
  updateAccountState(acct);
  solver.setAccountState(acct?.entries ?? null, acct?.key ?? "");
  pool.broadcast({ type: "accountState", entries: acct?.entries ?? null, key: acct?.key ?? "" });
}

const readList = (key: string): string[] | null => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return Array.isArray(v) ? v.filter((n): n is string => typeof n === "string") : null;
  } catch {
    return null;
  }
};
const writeList = (key: string, list: string[] | null): void => {
  try {
    if (list) localStorage.setItem(key, JSON.stringify(list));
    else localStorage.removeItem(key);
  } catch { /* private window: lasts until the page closes */ }
};

/* ---------------------------------------------------------------- Roster value: the owned set */
/** A tick list as his page reads it: names his roster no longer has are dropped (value.ts `prepare()` does the same),
 *  so a stale name from his own site or an old backup is never counted or named in the line. */
const readTicks = (key: string): string[] | null => {
  const list = readList(key);
  if (!list || !shared) return list;
  const known = new Set(rosterOf(shared.model.TEAMS).map((m) => m.name));
  return list.filter((n) => known.has(n));
};
export interface OwnedState { source: OwnedSource; count: number; line: string; account: string[] | null }
let lastAccount: AccountRegistration | null = null;
let ownedListener: ((s: OwnedState) => void) | null = null;
/** The Vue page's line over his table. */
export function onOwnedState(fn: ((s: OwnedState) => void) | null): void {
  ownedListener = fn;
}
function accountSet(): string[] | null {
  if (!shared || !lastAccount) return null;
  return accountOwnedSet(rosterOf(shared.model.TEAMS), lastAccount.entries);
}
function publishOwned(source: OwnedSource): void {
  const count = readTicks(OWNED_KEY)?.length ?? 0;
  ownedListener?.({ source, count, line: ownedLine(source, count), account: accountSet() });
}
/** Apply the rule before his `prepare()` reads `wuwa.owned.v1`. */
function applyOwned(): void {
  const account = accountSet();
  const { source, write } = decideOwned(account, readTicks(OWNED_KEY), readTicks(APPLIED_KEY));
  if (write) {
    writeList(OWNED_KEY, write);
    writeList(APPLIED_KEY, write);
  }
  publishOwned(source);
}
/** "Use my account's set": the account's set back in his ticks, the page re-packed. */
export function useAccountSet(): void {
  const account = accountSet();
  if (!account) return;
  writeList(OWNED_KEY, account);
  writeList(APPLIED_KEY, account);
  publishOwned({ kind: "account", owned: account, added: [], removed: [] });
  rerun("value");
}
/** After a tick or his Reset Account: what the line says now (his handler has already saved or removed the key). */
function afterTicks(): void {
  const account = accountSet();
  if (!account) { publishOwned({ kind: "none" }); return; }
  const saved = readTicks(OWNED_KEY);
  if (saved === null) {
    // his Reset Account: his default is on screen until the next open, which brings the account's set back
    ownedListener?.({ source: { kind: "none" }, count: 0, line: "Riley's default roster is ticked (his Reset Account). Use your account's set to tick your own again.", account });
    return;
  }
  const { source } = decideOwned(account, saved, readTicks(APPLIED_KEY));
  publishOwned(source);
}

/* ------------------------------------------------------------------------------ the pages */

/** His Team Cost and Matrix from the address into his `filters`, then his own change handler: solved and redrawn. */
function rerun(kind: RileyPageKind): void {
  const page = pages.get(kind);
  if (!page || !shared) return;
  const { model } = shared;
  model.applyHash();
  if (kind === "value") model.filters.matrix = [];
  const select = page.app.querySelector<HTMLSelectElement>("#cost");
  if (!select) return;
  // `mine` with no account registered reads as his default; with one registered since his last draw, his select
  // has no `mine` option yet (costBox lists it while an account is registered): add it for this change
  if (model.filters.cost === "mine" && !shared.solver.hasAccountState()) model.filters.cost = "s0r1";
  if (![...select.options].some((o) => o.value === model.filters.cost)) select.add(new Option("My account", model.filters.cost));
  select.value = model.filters.cost;
  const box = page.app.querySelector<HTMLInputElement>("#matrixToggle");
  if (box) box.checked = model.filters.matrix.length > 0;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  publishCost();
}

/** The filters his team links are built under: his roster.ts keeps one for both pages, so each sets its own. */
async function setBuildFiltersFor(kind: RileyPageKind): Promise<void> {
  const roster = await import("@skittle/page/roster");
  const { solver, model } = shared!;
  roster.setBuildFilters(kind === "value"
    ? () => ({ ...solver.defaultFilters(), cost: model.filters.cost, matrix: [...model.MATRIX_RESONATORS] })
    : () => model.filters);
}

function onLinkClick(e: MouseEvent): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>(".wt-riley-pages a[href]");
  const href = a?.getAttribute("href");
  const to = href ? rankingsTargetOf(href) : null;
  if (!to || !router) return;
  e.preventDefault();
  void router.push(to);
}
/* ------------------------------------------------- the Team Cost, for the "At my own sequences" button */
/** `freeS2`: his free 5-stars everyone runs from S2 (`Rarity.FreeS2`, Jianxin today), the line's exception besides 4-stars. */
export interface CostState { cost: string; hasAccount: boolean; freeS2: string[] }
let costListener: ((s: CostState) => void) | null = null;
export function onCostState(fn: ((s: CostState) => void) | null): void {
  costListener = fn;
  publishCost();
}
function publishCost(): void {
  if (!shared || !costListener) return;
  const freeS2 = rosterOf(shared.model.TEAMS).filter((m) => m.rarity === RARITY.FreeS2).map((m) => m.name).sort();
  costListener({ cost: shared.model.filters.cost, hasAccount: shared.solver.hasAccountState(), freeS2 });
}
function onCostChange(e: Event): void {
  const id = (e.target as Element).id;
  if (id === "cost") publishCost();
  if (id === "cost" || id === "matrixToggle") void syncRouter();
}
/** His handlers write the hash with `history.replaceState`, which the router does not see: its next push saves the URL it
 *  last knew over that entry, and Back came to the Team Cost the page opened on. As /rankings does (controller.ts). */
async function syncRouter(): Promise<void> {
  if (!router || router.currentRoute.value.hash === location.hash) return;
  try {
    await router.replace({ hash: location.hash });
  } catch { /* a cancelled navigation leaves the url as it is */ }
}
/** "At my own sequences and weapons": his select set to `mine` and his own change handler run. */
export function chooseMine(): void {
  const page = current && pages.get(current);
  const select = page?.app.querySelector<HTMLSelectElement>("#cost");
  if (!select || !shared?.solver.hasAccountState()) return;
  if (![...select.options].some((o) => o.value === "mine")) select.add(new Option("My account", "mine"));
  select.value = "mine";
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function onValueChange(e: Event): void {
  if (current !== "value") return;
  if ((e.target as Element).closest?.("input[data-name]")) afterTicks();
}
function onValueClick(e: Event): void {
  if (current !== "value") return;
  if ((e.target as Element).closest?.(".resetlink")) afterTicks();
}

/** Mount `kind` into `host`; the account the app holds now. */
export async function mountRileyPage(kind: RileyPageKind, host: HTMLElement, r: Router, acct: AccountRegistration | null): Promise<void> {
  router = r;
  current = kind;
  lastAccount = acct?.key ? acct : null;
  patchFetch();
  let page = pages.get(kind);
  if (!page) { page = buildRoot(kind); pages.set(kind, page); }
  host.appendChild(page.root);
  document.addEventListener("click", onLinkClick);
  page.root.addEventListener("change", onValueChange);
  page.root.addEventListener("change", onCostChange);
  page.root.addEventListener("click", onValueClick);
  await loadShared(page);
  if (current !== kind) return;
  adoptOverlay(page);
  registerAccount(lastAccount);
  if (kind === "value") applyOwned();
  if (!page.booted) {
    page.booted = true;
    if (kind === "value") await withoutHashReload(() => import("@skittle/page/value"));
    else {
      await setBuildFiltersFor("tierlist");
      await withoutHashReload(() => import("@skittle/page/tierlist"));
    }
    publishCost();
    void syncRouter();
    return;
  }
  await setBuildFiltersFor(kind);
  rerun(kind);
  void syncRouter();
}

/** The account changed while the page is open. */
export function updateRileyPageAccount(acct: AccountRegistration | null): void {
  lastAccount = acct?.key ? acct : null;
  if (!shared || !current) return;
  registerAccount(lastAccount);
  if (current === "value") applyOwned();
  rerun(current);
}

/** The address changed while the page is open (a link to the same page with another Team Cost). */
export function onRileyPageLocation(kind: RileyPageKind): void {
  if (current !== kind || !pages.get(kind) || !shared) return;
  // the hash his own handler wrote, now in the router too (syncRouter): the page already stands on it
  if (!shared.model.applyHash()) return;
  rerun(kind);
}

export function unmountRileyPage(kind: RileyPageKind): void {
  const page = pages.get(kind);
  document.removeEventListener("click", onLinkClick);
  page?.root.removeEventListener("change", onValueChange);
  page?.root.removeEventListener("change", onCostChange);
  page?.root.removeEventListener("click", onValueClick);
  returnOverlay();
  page?.root.remove();
  if (current === kind) current = null;
}
