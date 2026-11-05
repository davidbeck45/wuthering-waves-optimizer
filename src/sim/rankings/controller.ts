/**
 * Hosts Riley31415/wuwa_calc's comparison table + detail pages inside this app.
 *
 * A port of his `src/page/index.ts` (the page controller) with three changes: the DOM his page modules
 * look up at import time (`#app`, `#topbar`, `#backLink`, `#loading`) is built here inside a
 * persistent `.skittle-root` element that survives route changes; his modules are imported lazily
 * after that DOM exists; and detail navigation goes through vue-router so its history state is not
 * clobbered. Everything else — the solve/run passes, the overlay, the worker pool — is his logic.
 * The engine, kits and page modules themselves come straight from the submodule via `@skittle/*`.
 */
import { shallowRef } from "vue";
import type { Router } from "vue-router";
import { mountRotationLink } from "../rotation/rankingsLink";
import type { BuildRolls } from "./myBuilds";
import type { RileyAccountEntry } from "../account/accountState";
import { useToast } from "../../composables/useToast";
import { importTeamFromRankings, notInApp, type ImportResult } from "./importFromRankings";
import { runSync, type SolvedBest, type SyncReport, type TeamLike } from "./syncTeams";
import { spreadOf } from "../display/numberBasis";
import { rosterOf, type RosterEntry } from "./filterChips";
import { compareScale, shareText, shareWidth, strengthOf, teamFigureOf, type CompareScale, type TeamMode } from "./compareColumn";
import { cardMemberOf, mainFirst, tableOrder, teamCards, type CardMember, type RunRowLike, type TeamCard } from "./phoneCards";
import { appKeyOf } from "./rileyNames";
import { soFarScheduler, type SoFarScheduler } from "./soFar";
import { dropUnkept, keepInLine } from "./solveQueue";
import { leavesTabRing } from "./tabEscape";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Member = { name: string; mainDps: boolean };
type TeamRow = { key: string; teamKey: string; members: Member[]; combo: any[] };
type Solved = { picks: any; rows: any[]; scores: any; hidden: any[]; hiddenScores: any[] };
interface Mods {
  display: any; solver: any; teamrun: any; model: any; panels: any; table: any; detail: any; pickmenu: any; stats: any; substats: any;
  filterbar: any;
}

const TEMPLATE = `
  <div class="wt-toolbar">
    <button type="button" class="btn btn-sm btn-primary" data-test-rankings-filters><svg viewBox="0 0 24 24" class="wt-toolbar__icon" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5" stroke-linecap="round"/></svg><span>Search &amp; compare</span></button>
    <span class="wt-toolbar__hint">weapons · echoes · sequences</span>
    <button type="button" class="wt-sheet-close btn btn-sm btn-circle btn-ghost" aria-label="Close" data-test-rankings-filters-close>&#x2715;</button>
  </div>
  <div class="wt-backdrop"></div>
  <div id="topbar" class="topbar" hidden>
    <a id="backLink" class="backlink" href="#">&larr; Back</a>
  </div>
  <div id="app"></div>
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

let root: HTMLElement | null = null;
let mods: Mods | null = null;
let router: Router | null = null;
let booted: Promise<void> | null = null;
let detailPushed = false;

let app!: HTMLElement;
let backLink!: HTMLElement;
let overlay!: HTMLElement;
let overlayStatus!: HTMLElement;
let overlayCount!: HTMLElement;
let overlayFill!: HTMLElement;

/** phones: Riley's aside (his search and its gear / compare bubbles) is a sheet docked right under the toolbar, which
 *  shows only while it is open, as the sheet's header with ✕ (skittle-theme.css); the account bar's Search button opens
 *  it. The sheet's top is measured off the header, so header and body always touch. */
function setSide(el: HTMLElement | null, open: boolean): void {
  if (!el) return;
  el.classList.toggle("wt-side-open", open);
  if (!open) return;
  const head = el.querySelector<HTMLElement>(".wt-toolbar");
  el.style.setProperty("--wt-sheet-top", `${Math.round(head?.getBoundingClientRect().bottom ?? 0)}px`);
  el.querySelector<HTMLInputElement>(".tcside #optionSearch")?.focus({ preventScroll: true });
}
const openSide = (open: boolean): void => setSide(root, open);
/** The account bar's Search button (phones): open or close Riley's aside. */
export function toggleRankingsSearch(open?: boolean): void {
  if (!root) return;
  setSide(root, open ?? !root.classList.contains("wt-side-open"));
}
const onKeydown = (e: KeyboardEvent): void => { if (e.key === "Escape") openSide(false); };
/** Riley's filter-bar ring (`page/table.ts` CHIP_RING, not exported): every bubble and both Clear buttons. */
const RILEY_CHIP_RING = ".tcchips .rchip, .tcchips .clearall, .tcpins .rchip, .tcpins .clearpins";
/** The way out of his Tab ring at its two ends (tabEscape.ts; a11y audit H1): window, capture phase, so it runs
 *  before his document listeners and hides the press from them; the browser then moves focus in page order. */
const onTabEscape = (e: KeyboardEvent): void => {
  if (e.key !== "Tab" || !root) return;
  const search = root.querySelector<HTMLElement>("#optionSearch");
  if (!search) return;
  const ring: HTMLElement[] = [search, ...root.querySelectorAll<HTMLElement>(RILEY_CHIP_RING)];
  let hasHits = false;
  try { hasHits = !!mods?.filterbar?.searchHits?.().length; } catch { /* his module not booted yet */ }
  if (leavesTabRing(e, e.target as HTMLElement | null, ring, hasHits)) e.stopImmediatePropagation();
};

function buildDom(): HTMLElement {
  const el = document.createElement("div");
  el.className = "skittle-root";
  el.innerHTML = TEMPLATE;
  el.querySelector("[data-test-rankings-filters]")!.addEventListener("click", () => setSide(el, !el.classList.contains("wt-side-open")));
  el.querySelector(".wt-backdrop")!.addEventListener("click", () => setSide(el, false));
  el.querySelector("[data-test-rankings-filters-close]")!.addEventListener("click", () => setSide(el, false));
  app = el.querySelector<HTMLElement>("#app")!;
  backLink = el.querySelector<HTMLElement>("#backLink")!;
  overlay = el.querySelector<HTMLElement>("#loading")!;
  overlayStatus = overlay.querySelector<HTMLElement>(".status-text")!;
  overlayCount = overlay.querySelector<HTMLElement>(".progress-count")!;
  overlayFill = overlay.querySelector<HTMLElement>(".progress-fill")!;
  return el;
}

async function loadModules(): Promise<Mods> {
  // Riley moved the solver and team run into solve/, display.ts into page/, teams.ts into resonators/ (Oct 2026)
  const [display, solver, teamrun, model, panels, table, detail, pickmenu, stats, substats, filterbar] = await Promise.all([
    import("@skittle/page/display"), import("@skittle/solve/solver"), import("@skittle/solve/teamrun"),
    import("@skittle/page/model"), import("@skittle/page/panels"), import("@skittle/page/table"), import("@skittle/page/detail"),
    import("@skittle/page/pickmenu"), import("@skittle/engine/stats"), import("@skittle/shared/substats"),
    import("@skittle/page/filterbar"), // table.ts imports it already; read here for searchHits() (onTabEscape)
  ]);
  return { display, solver, teamrun, model, panels, table, detail, pickmenu, stats, substats, filterbar };
}

/* ---------------------------------------------------------------------------------- overlay */

/** Two frames, not one: the first rAF callback runs before the frame is committed. Races a short
 *  timeout because rAF never fires in a background tab (or a headless runner), and every phase
 *  below awaits this — Riley's original would sit on "Rendering Table…" until the tab came back. */
const paint = (): Promise<void> =>
  new Promise((resolve) => {
    const done = (): void => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 80);
    requestAnimationFrame(() => requestAnimationFrame(done));
  });
let overlayTimer: ReturnType<typeof setTimeout> | undefined;
function overlayPhase(text: string, now = false): void {
  overlayStatus.textContent = text;
  if (!overlay.hidden) return;
  if (now) { clearTimeout(overlayTimer); overlayTimer = undefined; overlay.hidden = false; return; }
  if (overlayTimer === undefined) overlayTimer = setTimeout(() => { overlayTimer = undefined; overlay.hidden = false; }, 100);
}
const OVERLAY_ROWS = 1_000;
async function overlayNow(text: string, rows = Infinity): Promise<void> {
  overlayPhase(text, rows >= OVERLAY_ROWS);
  await paint();
}
function overlayHide(): void {
  clearTimeout(overlayTimer);
  overlayTimer = undefined;
  overlay.hidden = true;
}
function barReset(): void { overlayFill.style.width = "0%"; overlayCount.textContent = ""; }
function barProgress(done: number, total: number): void {
  const { fmt } = mods!.display;
  overlayFill.style.width = `${total ? (done / total) * 100 : 100}%`;
  // the docked "so far" box counts teams (showSoFar), the list's own unit; the fill still follows the rows
  if (soFar?.drawn) return;
  overlayCount.textContent = `${fmt(done)} / ${fmt(total)}`;
}
let lastPaint = performance.now();
async function breathe(): Promise<void> {
  if (performance.now() - lastPaint <= 50) return;
  await paint();
  lastPaint = performance.now();
}

/* ------------------------------------------------------------------------------ the passes */

/** Run every row the filters opened that hasn't been run. Stops where a newer pass has started; what it ran is kept. */
async function runMissing(rows: TeamRow[], stale: () => boolean = () => false): Promise<void> {
  const { results } = mods!.model;
  const { runTeam } = mods!.teamrun;
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length) return;
  overlayPhase("Running Rotations…", true);
  const cached = rows.length - missing.length;
  barProgress(cached, rows.length);
  for (let i = 0; i < missing.length; i++) {
    if (stale()) return;
    const row = missing[i]!;
    results.set(row.key, runTeam(row.teamKey, row.members, row.combo));
    barProgress(cached + i + 1, rows.length);
    await breathe();
  }
  await paint();
}

// ---- the player's own substat spreads ("My build" rows of a Substats compare): registered on the
// page's loadouts and in every solver worker, since the worker is what builds the rows
let myBuilds: BuildRolls[] = [];
let registered = new Set<string>();
function applyMyBuilds(): void {
  if (!mods) return;
  const next = new Set(myBuilds.map((b) => b.name));
  const clear = [...registered].filter((n) => !next.has(n));
  for (const name of clear) mods.solver.setMySubstat(name, null);
  for (const b of myBuilds) mods.solver.setMySubstat(b.name, mods.substats.customSubstats("My build", b.rolls), b.key);
  registered = next;
  for (const w of pool ?? []) w.postMessage({ type: "mySubstats", builds: myBuilds, clear });
}
const buildsStamp = (builds: BuildRolls[]): string => builds.map((b) => `${b.name}:${b.key}`).join(",");
/** The builds changed in the app (a character's echoes were edited): re-register and redraw. */
export function updateMyBuilds(builds: BuildRolls[]): void {
  myBuilds = builds;
  applyMyBuilds();
  if (mods && booted && tableRequested) void refresh();
}

// ---- the player's account (src/sim/account): the `mine` Team Cost runs every member at the
// sequence, weapon and refinement the player has set up. Registered on the page and in every solver
// worker, keyed so a changed account never reads a stale solve.
export interface AccountRegistration { entries: Record<string, RileyAccountEntry>; key: string }
let account: AccountRegistration | null = null;
function applyAccountState(): void {
  if (!mods) return;
  mods.solver.setAccountState(account?.entries ?? null, account?.key ?? "");
  for (const w of pool ?? []) w.postMessage({ type: "accountState", entries: account?.entries ?? null, key: account?.key ?? "" });
}
/** The account changed in the app (a weapon equipped, a chain toggled): re-register and redraw. */
export function updateAccountState(next: AccountRegistration | null): void {
  if ((next?.key ?? "") === (account?.key ?? "")) return;
  account = next;
  applyAccountState();
  if (mods && booted && tableRequested) void refresh();
}

/* ------------------------------------------------------------------- the solver worker pool */
// Riley's job queue (his `src/page/index.ts`, Oct 2026), ported: one team per message, every job carrying the filters
// of the pass that asked for it (never whatever they are by the time it comes back), a newer pass dropping the older
// one's teams still in line (`cancelQueued`), and a pass that wants a team already out waiting on that answer
// (`inFlight`). The earlier port re-pointed each worker's `onmessage` per pass: two passes at once (a tier picked in
// the account bar mid-solve, which the overlay never blocked) stole each other's answers, and a reply was filed under
// the filters of the moment — a `mine` solve could land as a Riley-tier solve and be saved to localStorage.

const WORKER_LIMIT = 8;
let pool: Worker[] | null = null;
let poolTried = false;
function workerPool(): Worker[] | null {
  if (poolTried) return pool;
  poolTried = true;
  const want = Math.max(1, Math.min(WORKER_LIMIT, (navigator.hardwareConcurrency || 4) - 1));
  try {
    pool = Array.from({ length: want }, () =>
      new Worker(new URL("./solver.worker.ts", import.meta.url), { type: "module" }));
    for (const w of pool) {
      w.postMessage({ type: "mySubstats", builds: myBuilds, clear: [] });
      w.postMessage({ type: "accountState", entries: account?.entries ?? null, key: account?.key ?? "" });
      listen(w);
    }
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}

/** A team to solve: the filters it was asked under, the `bestKey()` it was asked for (the account key is part of a
 *  `mine` key: an answer that comes back after the account changed is not filed under the new one), and who waits. */
interface Job {
  id: number; key: string; members: Member[]; f: any; bk: string; known: any;
  /** a sync's own teams: a table pass starting behind it never drops them */
  keep: boolean;
  onShare: (share: number) => void; done: () => void;
}
const queue: Job[] = [];
const busy = new Map<Worker, Job>();
const inFlight = new Map<string, Promise<void>>();
let jobId = 0;

/** A worker's answers, routed by request id to the team it is on. One that throws or answers with a solve that does
 *  not fit this build is solved here instead, so the table is always complete. */
function listen(w: Worker): void {
  w.onmessage = ({ data }: MessageEvent<any>) => {
    const job = busy.get(w);
    if (!job || !mods || data?.id !== job.id) return;
    const S = mods.solver;
    if (S.isProgress(data)) { job.onShare(data.share); return; }
    const solved: Solved = { picks: data.picks, rows: data.rows, scores: data.scores, hidden: data.hidden ?? [], hiddenScores: data.hiddenScores ?? [] };
    if (mods.model.solveFits(job.bk, solved)) { settle(w, job, solved); return; }
    console.warn(`worker's solve for ${job.key} does not fit this build; solving it here`);
    settle(w, job, S.solveTeam(job.key, job.members, job.f, job.known));
  };
  w.onerror = (e) => {
    const job = busy.get(w);
    e.preventDefault();
    if (!job || !mods) return;
    console.warn(`worker failed on ${job.key}, solving it here:`, e.message);
    settle(w, job, mods.solver.solveTeam(job.key, job.members, job.f, job.known));
  };
}

function file(job: Job, solved: Solved): void {
  // filed only under the key it was asked for: the account (or a "My build" spread) moved while it was out otherwise
  if (mods!.solver.bestKey(job.key, job.members, job.f) === job.bk) mods!.model.storeSolved(job.key, solved, job.f);
}
function settle(w: Worker, job: Job, solved: Solved): void {
  file(job, solved);
  busy.delete(w);
  // the worker gets its next team before anything hears of this one: a rows-so-far paint may run on this landing
  handOut(w);
  job.done();
}
function handOut(w: Worker): void {
  const job = queue.shift();
  if (!job) return;
  busy.set(w, job);
  w.postMessage({ id: job.id, teamKey: job.key, filters: job.f, picks: job.known });
}

/** With no pool, the line is solved here, one team at a time, yielding so the bar still moves. */
let draining = false;
async function drainHere(): Promise<void> {
  if (draining) return;
  draining = true;
  for (let job = queue.shift(); job; job = queue.shift()) {
    file(job, mods!.solver.solveTeam(job.key, job.members, job.f, job.known, job.onShare));
    job.done();
    await breathe();
  }
  draining = false;
}

/** A new pass has started: the old one's teams still in line are dropped, unsolved (a sync's are kept). */
function cancelQueued(): void {
  for (const job of dropUnkept(queue)) job.done();
}

/** Solve `teams` under `f` — on the pool when there is one — waiting on any already out. `onTeam` hears each team
 *  that lands (the table's rows-so-far paint). */
function solveAll(teams: [string, Member[]][], f: any, share: (members: Member[], part: number) => void, keep = false, onTeam?: () => void): Promise<void> {
  const { picksCache } = mods!.model;
  const { bestKey, picksKey } = mods!.solver;
  const waits = teams.map(([key, members]) => {
    const bk = bestKey(key, members, f);
    const out = inFlight.get(bk);
    if (out) {
      if (keep) keepInLine(queue, bk);
      return out.then(() => { share(members, 1); onTeam?.(); });
    }
    const solved = new Promise<void>((resolve) => queue.push({
      id: jobId++, key, members, f, bk, keep, known: picksCache.get(picksKey(key, members, f)) ?? null,
      onShare: (part) => share(members, part),
      done: () => {
        inFlight.delete(bk);
        share(members, 1);
        onTeam?.();
        resolve();
      },
    }));
    inFlight.set(bk, solved);
    return solved;
  });
  const workers = workerPool();
  if (workers) {
    for (const w of workers) if (!busy.has(w)) handOut(w);
  } else void drainHere();
  return Promise.all(waits).then(() => undefined);
}

/** Solve every team in play whose answer isn't in hand under `f`; the bar counts the rows this phase opens. Stops
 *  where a newer pass has started. `onTeam(done, total)` counts teams as they land. @returns whether anything was solved. */
async function ensureBestPicks(
  inPlay: [string, Member[]][], f: any, stale: () => boolean = () => false,
  options: { keep?: boolean; onTeam?: (done: number, total: number) => void } = {},
): Promise<boolean> {
  const { bestPicks, loadShipped, estimatedRowCount } = mods!.model;
  const { hasBuild, bestKey } = mods!.solver;
  await loadShipped(f);
  if (stale()) return false;
  const teams = inPlay.filter(([key, members]) => !bestPicks.has(bestKey(key, members, f)));
  if (!teams.length) return false;
  // the heaviest teams (most rows to open) go first, so the pool's tail is not one worker on a 5x team
  const rowsOf = (members: Member[]): number => (members.every((m) => hasBuild(m, f)) ? estimatedRowCount(members, f) : 0);
  const solvable = teams.filter(([, members]) => members.every((m) => hasBuild(m, f)))
    .map((t) => [t, rowsOf(t[1])] as const).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  if (!solvable.length) return false;
  const total = solvable.reduce((n, [, members]) => n + rowsOf(members), 0);
  await overlayNow("Running Calculations...");
  if (stale()) return false;
  let done = 0;
  // the bar is the newest pass's alone: an older one's teams finishing behind it move nothing
  const progress = (): void => {
    if (!stale()) barProgress(done, total);
  };
  progress();
  const counted = new Map<Member[], number>();
  const share = (members: Member[], part: number): void => {
    const at = Math.min(rowsOf(members), Math.round(rowsOf(members) * part));
    const was = counted.get(members) ?? 0;
    if (at <= was) return;
    counted.set(members, at);
    done += at - was;
    progress();
  };
  let teamsDone = 0;
  const onTeam = options.onTeam ? (): void => { teamsDone++; if (!stale()) options.onTeam!(teamsDone, solvable.length); } : undefined;
  await solveAll(solvable, f, share, options.keep ?? false, onTeam);
  if (stale()) return false;
  await paint();
  return true;
}

/**
 * Wuthering Tools+: every team the detail page can show is importable — a
 * Team Rotation (and optionally each member's loop) built from the engine's
 * executed casts (see importFromRankings.ts). The controls live in his topbar
 * next to Back and are re-pointed at the current team on each detail render.
 */
let importBusy = false;
/** the Import button's label: in full on a desktop, "Import team" on a phone (skittle-theme.css), so it shares Back's line */
const IMPORT_LABEL = `<span class="wt-import__long">Import team into Wuthering Tools+</span><span class="wt-import__short">Import team</span>`;
function mountImportControls(key: string): void {
  const topbar = root?.querySelector<HTMLElement>("#topbar");
  if (!topbar) return;
  let box = topbar.querySelector<HTMLElement>(".wt-import");
  if (!box) {
    box = document.createElement("div");
    box.className = "wt-import";
    box.innerHTML = `
      <label class="wt-import__opt" title="also save each member's rotation to that character"><input type="checkbox" data-test-rankings-import-rotations checked> <span class="wt-import__long">also save each member's rotation</span><span class="wt-import__short">+ rotations</span></label>
      <button type="button" class="btn btn-primary btn-xs" title="Import team into Wuthering Tools+" data-test-rankings-import-team>${IMPORT_LABEL}</button>
      ${BUILD_TEAM_LINK}`;
    topbar.appendChild(box);
    box.querySelector("button")!.addEventListener("click", () => void runImport());
    // Wuthering Tools+ build-my-team: these three, re-geared from the player's echoes (src/sim/buildTeam/)
    box.querySelector<HTMLAnchorElement>("[data-test-rankings-build-team]")!.addEventListener("click", (e) => {
      e.preventDefault();
      const href = (e.currentTarget as HTMLAnchorElement).getAttribute("href");
      if (href) void router?.push(href);
    });
  }
  box.dataset.team = key;
  pointBuildTeamLink(box, key);
  mountMemberStrip(topbar, key);
  mountRotationLink(box, key, (path) => void router?.push(path)); // Wuthering Tools+: the rotation view (src/sim/rotation/)
}

/** Wuthering Tools+ build-my-team: the topbar link beside Import (an icon on a phone, where Back and Import share a line). */
const BUILD_TEAM_LINK = `<a class="btn btn-ghost btn-xs wt-import__build" href="/build-team" title="Build my team: re-gear these three from your echoes" aria-label="Build my team from your echoes" data-test-rankings-build-team>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke-linejoin="round"/></svg>
  <span class="wt-import__long">Build from my echoes</span></a>`;
/** Points the link at this row's three (main DPS first) and its wuwa_calc team key. */
function pointBuildTeamLink(box: HTMLElement, key: string): void {
  const link = box.querySelector<HTMLAnchorElement>("[data-test-rankings-build-team]");
  const run = mods?.model.results.get(key) as { teamKey?: string; members?: Array<{ name: string; mainDps?: boolean }> } | undefined;
  if (!link) return;
  const members = [...(run?.members ?? [])].sort((a, b) => Number(!!b.mainDps) - Number(!!a.mainDps)).map((m) => appKeyOf(m.name));
  const teamKey = run?.teamKey ?? (/^t\d+/.exec(key)?.[0] ?? "");
  const query = new URLSearchParams();
  if (members.length) query.set("members", members.join(","));
  if (teamKey) query.set("key", teamKey);
  link.setAttribute("href", `/build-team${query.size ? `?${query.toString()}` : ""}`);
  // released content only: no link for a team with a kit the app does not list yet
  link.hidden = !members.length || notInApp(members).length > 0;
}

/**
 * Wuthering Tools+: the detail page's member strip — each member's portrait, the investment the row runs,
 * the account's own S/R and build, and the weapon — between Back and the Import controls. The controller
 * keeps a host element in his topbar and publishes the members (`rankingsDetail`); RankingsMemberStrip.vue
 * teleports into the host and reads the account from the stores.
 */
export interface DetailView {
  key: string;
  /** main DPS first (phoneCards.ts `mainFirst`) */
  members: CardMember[];
  /** the row runs at My account (the members' S/R are the account's own) */
  mine: boolean;
}
export const rankingsDetail = shallowRef<DetailView | null>(null);
let stripEl: HTMLElement | null = null;
/** The element RankingsMemberStrip.vue teleports into: lives in his `#topbar`, right after Back. */
export function stripHost(): HTMLElement {
  stripEl ??= Object.assign(document.createElement("div"), { className: "wt-strip-host" });
  return stripEl;
}
function mountMemberStrip(topbar: HTMLElement, key: string): void {
  const host = stripHost();
  if (host.parentElement !== topbar) backLink.after(host);
  const run = mods?.model.results.get(key) as RunRowLike | undefined;
  if (!run || !mods) { rankingsDetail.value = null; return; }
  const M = mods.model;
  const members = run.members.map((m, j) => cardMemberOf(m, run.combo[j]!, j, run.members.length, rankShown(run, j)));
  rankingsDetail.value = { key, members: mainFirst(members), mine: M.filters.cost === "mine" };
}
/** The two solver questions behind his table's `rankToken` beyond the weapon itself: the member's rank is a
 *  compared axis on the row (`compares(m, filters, "refines", combo)`), or that weapon's ranks are shown at
 *  this sequence (`shownRanks`) — either way the token reads the rank, never "R0". */
function rankShown(run: RunRowLike, j: number): boolean {
  if (!mods) return false;
  const S = mods.solver, f = mods.model.filters;
  const m = run.members[j] as any, combo = run.combo[j] as any;
  try {
    if (S.compares(m, f, "refines", combo)) return true;
    const base = S.weaponBase(combo.weapon);
    return (S.shownRanks(m, f) as [number, number, number][]).some(([w, , seq]) =>
      seq === combo.sequence && !!m.loadout?.weapons?.[w] && S.weaponBase(m.loadout.weapons[w]) === base);
  } catch {
    return false;
  }
}

async function runImport(): Promise<void> {
  if (importBusy || !mods) return;
  const box = root?.querySelector<HTMLElement>(".wt-import");
  const key = box?.dataset.team ?? mods.model.hashTeam();
  if (!key) return;
  const { showToast } = useToast();
  const button = box?.querySelector<HTMLButtonElement>("button");
  const withRotations = box?.querySelector<HTMLInputElement>("input[type=checkbox]")?.checked ?? true;
  importBusy = true;
  if (button) { button.disabled = true; button.textContent = "Importing…"; }
  try {
    const result = await importTeamFromRankings(mods, key, { characterRotations: withRotations });
    let message = `Imported "${result.teamName}" (${result.actions} actions) into Teams.`;
    if (withRotations) {
      message += result.characterRotationsSaved.length ? ` Rotations saved for ${result.characterRotationsSaved.join(", ")}.` : "";
      message += result.characterRotationsSkipped.length ? ` Not set up in the calculator yet, so no rotation saved: ${result.characterRotationsSkipped.join(", ")}.` : "";
    }
    if (result.notPorted.length) message += ` Not ported: ${result.notPorted.join(", ")}.`;
    showToast(message, "success", 9000);
    box?.setAttribute("data-test-rankings-import-done", result.teamId);
  } catch (err) {
    showToast(err instanceof Error ? err.message : String(err), "error", 8000);
  } finally {
    importBusy = false;
    if (button) { button.disabled = false; button.innerHTML = IMPORT_LABEL; }
  }
}

/**
 * Wuthering Tools+ "Sync my teams": re-import every saved wuwa_calc team at the account's own state
 * (`mine`) and update it in place. The page's filters are switched to `mine` only while the rows are
 * solved and read (restored after, nothing re-rendered), so the table the player is looking at stays.
 */
let syncBusy = false;
export async function syncMyTeams(teams: TeamLike[]): Promise<SyncReport> {
  if (!mods || !booted) throw new Error("The rankings page is still loading — try again in a moment.");
  if (syncBusy) throw new Error("A sync is already running.");
  syncBusy = true;
  await booted;
  const M = mods.model;
  const was = M.filters.cost;
  const withMine = async <T>(fn: () => Promise<T>): Promise<T> => {
    M.filters.cost = "mine";
    try {
      return await fn();
    } finally {
      M.filters.cost = was;
    }
  };
  const S = mods.solver;
  const engine = mods;
  // the best row per composition at `mine`, as the table's top row for it would read
  const solveBest = (keys: string[]): Promise<Map<string, SolvedBest | null>> =>
    withMine(async () => {
      await ensureBestPicks(keys.map((k) => [k, M.TEAMS[k] as Member[]]), structuredClone(M.filters), undefined, { keep: true });
      const out = new Map<string, SolvedBest | null>();
      for (const key of keys) {
        const members = M.TEAMS[key] as Member[];
        const solved = M.bestPicks.get(S.bestKey(key, members, M.filters)) as Solved | undefined;
        const row = solved?.rows?.[0];
        if (!row) { out.set(key, null); continue; }
        const combo = row.map((p: any, i: number) => S.comboOf((members[i] as any).loadout, p));
        const score = solved!.scores?.[0] as { total?: number; sectionTotals?: number[]; seconds?: number } | undefined;
        const dpr = score?.sectionTotals?.length ? teamFigureOf({ sectionTotals: score.sectionTotals, seconds: Number(score.seconds) || 1 }, "dpr") : null;
        out.set(key, { total: Number(score?.total ?? 0), dpr, ref: `${key}-${combo.map((c: any) => c.key).join("-")}` });
      }
      return out;
    });
  const importInto = (team: TeamLike, best: SolvedBest): Promise<ImportResult> =>
    withMine(() => importTeamFromRankings(engine, best.ref as string, { replaceTeamId: team.id }));
  try {
    const report = await runSync({ teams, rileyTeams: M.TEAMS, solveBest, importInto });
    report.subs = spreadOf(M.filters.subs); // the report names the spread its figures ran on
    M.saveSolves();
    return report;
  } finally {
    syncBusy = false;
    overlayHide();
  }
}

/* -------------------------------------------------------- Wuthering Tools+ post-render passes */
// Riley's page draws its own DOM: the table's scroll window on every scroll (`drawWindow`), the whole
// page on every filter change (`renderComparison`), the detail page on every visit (`renderDetail`).
// The passes below re-dress what he drew. A MutationObserver on #app runs them after each of his
// draws — a microtask, so before the browser paints and nothing flickers. Each pass only writes
// what differs, and the observer is off while they write.

/** His roster as the account bar's chips need it (filterChips.ts), filled once his modules load. */
export const rankingsRoster = shallowRef<RosterEntry[]>([]);

/** The team the player pinned as the Compare reference — his `baselineTeam` is module-private, so it
 *  is mirrored from the same click (capture phase: ahead of his own handler and the redraw it causes)
 *  and re-synced from the `.isbaseline` row whenever that row is drawn. */
let pinnedTeam: string | null = null;
function onBaselineClick(e: MouseEvent): void {
  const el = (e.target as Element | null)?.closest?.<HTMLElement>(".skittle-root .trow .c.baseline[data-team]");
  const team = el?.dataset.team;
  if (team) pinnedTeam = pinnedTeam === team ? null : team;
}

let scaleMemo: { rows: unknown; mode: TeamMode; pinned: string | null; runs: number; scale: CompareScale } | null = null;
/** Top / weakest / reference figure over every listed row, drawn or not (only a window is in the DOM). */
function tableScale(): CompareScale {
  const M = mods!.model;
  const mode: TeamMode = mods!.table.teamMode === "dps" ? "dps" : "dpr";
  const rows = M.visibleRows as TeamRow[];
  const runs = M.results.size as number;
  if (scaleMemo && scaleMemo.rows === rows && scaleMemo.mode === mode && scaleMemo.pinned === pinnedTeam && scaleMemo.runs === runs) return scaleMemo.scale;
  const totals: number[] = [];
  let pinnedTotal: number | null = null;
  for (const row of rows) {
    const run = M.results.get(row.key);
    if (!run) continue;
    const t = teamFigureOf(run, mode);
    totals.push(t);
    if (row.key === pinnedTeam) pinnedTotal = t;
  }
  const scale = compareScale(totals, pinnedTotal);
  scaleMemo = { rows, mode, pinned: pinnedTeam, runs, scale };
  return scale;
}

/** The Compare column as "% of the top row" (or of the pinned row) on a neutral → accent scale
 *  (compareColumn.ts; the colours are skittle-theme.css `.c.baseline.wt-pct`). */
function comparePass(): void {
  const grid = app.querySelector<HTMLElement>(".tgrid");
  if (!grid || !mods) return;
  const rows = [...grid.querySelectorAll<HTMLElement>(".trow[data-team][data-total]")];
  // his own pin wins wherever the pinned row is drawn
  const marked = rows.find((r) => r.classList.contains("isbaseline"))?.dataset.team ?? null;
  if (marked && marked !== pinnedTeam) pinnedTeam = marked;
  else if (!marked && pinnedTeam && rows.some((r) => r.dataset.team === pinnedTeam)) pinnedTeam = null;
  let scale = tableScale();
  // his drawn figures are the truth: should his formula ever move away from `teamFigureOf`, a drawn
  // row above the computed top still reads as the top
  const drawnTop = Math.max(0, ...rows.map((r) => Number(r.dataset.total) || 0));
  if (drawnTop > scale.top) scale = { ...scale, top: drawnTop, ref: scale.pinned ? scale.ref : drawnTop };
  for (const row of rows) {
    const cell = row.querySelector<HTMLElement>(".c.baseline");
    if (!cell) continue;
    const total = Number(row.dataset.total) || 0;
    const text = shareText(total, scale.ref);
    if (cell.textContent !== text) cell.textContent = text;
    cell.classList.add("wt-pct");
    cell.style.setProperty("--wt-share", shareWidth(total, scale.ref).toFixed(4));
    cell.style.setProperty("--wt-k", strengthOf(total, scale).toFixed(4));
  }
  // the zero-height sizing row: the column is as wide as its widest share, not his old figures
  const ghost = grid.querySelector<HTMLElement>(".trow.tghost .c.baseline");
  if (ghost) {
    const a = shareText(scale.top, scale.ref), b = shareText(scale.low, scale.ref);
    const widest = (b.length > a.length ? b : a) || "100.0%";
    if (ghost.textContent !== widest) ghost.textContent = widest;
  }
  const head = grid.querySelector<HTMLElement>(".trow.thead .c.huehead");
  if (head) {
    const label = scale.pinned ? "% of pinned" : "% of top";
    if (head.textContent !== label) head.textContent = label;
    head.title = scale.pinned
      ? "Each team as a share of the pinned row. Click that row's figure again to measure against the top row; click here to switch the colour scale off or on."
      : "Each team as a share of the top row. Click a row's figure to measure everything against that team instead; click here to switch the colour scale off or on.";
  }
  // his "Team Avg DPR" heading in words (2026-11-02 audit D9); the "25.0s" beside each figure reads "25.0s loop"
  // (skittle.css `.looptime::after`). DPS mode keeps his "Team DPS".
  const dpr = grid.querySelector<HTMLElement>(".trow.thead .c.dprhead");
  if (dpr && mods.table.teamMode !== "dps") {
    if (dpr.textContent !== DPR_HEAD) dpr.textContent = DPR_HEAD;
    if (dpr.title !== DPR_HEAD_TITLE) dpr.title = DPR_HEAD_TITLE;
  }
}
const DPR_HEAD = "Avg damage / rotation";
const DPR_HEAD_TITLE =
  "Team avg DPR: the damage of one rotation, averaged over wuwa_calc's four. The small figure beside it is how long the last of the four took; DPS divides by the time all four took, so it can differ from this figure ÷ that time. Click to rank by damage per second (DPS) instead.";

/** The detail page's rotation log keeps its Member and Action columns in view while it scrolls
 *  sideways: whichever of the two lead the log (his columns can be dragged into any order — a
 *  stylesheet hands each cell position a grid `order`, nothing is re-rendered) stick at their offset. */
let stickyStyle: HTMLStyleElement | null = null;
function stickyLogPass(): void {
  const grid = app.querySelector<HTMLElement>(".gridwrap .grid");
  const head = grid?.querySelector<HTMLElement>(":scope > .r.head");
  let css = "";
  if (head) {
    const cells = [...head.children] as HTMLElement[];
    const visual = cells
      .map((c, i) => ({ c, i, order: Number(getComputedStyle(c).order) || 0 }))
      .sort((a, b) => a.order - b.order || a.i - b.i);
    let left = 0;
    const stuck: number[] = [];
    for (const { c, i } of visual) {
      const col = c.dataset.col;
      if (col !== "member" && col !== "action") break;
      css += `.skittle-root .gridwrap .grid .r>.c:nth-child(${i + 1}){position:sticky;left:${left}px;z-index:3}`;
      stuck.push(i + 1);
      left += parseFloat(getComputedStyle(c).width) || 0;
    }
    // the last stuck column draws the edge the rest of the log slides under; the action column has no
    // wash of its own, so it takes its row's
    const last = stuck[stuck.length - 1];
    if (last) css += `.skittle-root .gridwrap .grid .r>.c:nth-child(${last}){box-shadow:inset -1px 0 0 var(--line-2)}`;
    for (const n of stuck) css += `.skittle-root .gridwrap .grid .r>.c:nth-child(${n}):not(.member){background-color:inherit}`;
  }
  if (!css && !stickyStyle) return;
  stickyStyle ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "wt-log-sticky" }));
  if (stickyStyle.textContent !== css) stickyStyle.textContent = css;
}

/* ------------------------------------------------------------- Wuthering Tools+ phone cards */
// Below 768 px his grid scrolls sideways inside its own box (Slot 1 and the team's figure off-screen), so a
// phone reads the same rows as cards (phoneCards.ts, RankingsCards.vue): the controller keeps one host
// element and re-attaches it inside his `.tcbody` after each of his draws (he rewrites `#app` wholesale,
// the host and the Vue DOM inside it survive the move), publishes the rows in table order
// (`rankingsCards`), and a `wt-cards` class on the root hides his grid. His aside (the "Search & compare"
// bottom sheet), filters, hash and solves are untouched — the cards are another face of `visibleRows`.

export interface CardsView {
  cards: TeamCard[];
  mode: TeamMode;
  /** the shares are of a pinned row, not the top one */
  pinned: boolean;
  /** bumps whenever the listed rows change (a filter, a tier), not on a DPR/DPS switch */
  listId: number;
  /** the rows run at My account */
  mine: boolean;
  /** a phone (the card list); false = a desktop, where only the empty state is drawn (his grid has none) */
  phone: boolean;
  /** his rows are still being solved / run: an empty list means "not yet", not "no match" */
  loading: boolean;
}
export const rankingsCards = shallowRef<CardsView | null>(null);
const PHONE_QUERY = "(max-width: 767px)";
let phoneMedia: MediaQueryList | null = null;
let cardsClaims = 0;
let cardsEl: HTMLElement | null = null;
/** The element RankingsCards.vue teleports into. */
export function cardsHost(): HTMLElement {
  cardsEl ??= Object.assign(document.createElement("div"), { className: "wt-cards-host" });
  return cardsEl;
}
/** RankingsCards.vue says it is mounted (or gone): only then does a phone trade his grid for the cards. */
export function claimCards(on: boolean): void {
  cardsClaims = Math.max(0, cardsClaims + (on ? 1 : -1));
  if (root && mods && booted) runPasses();
}
const onPhoneChange = (): void => {
  if (!root || !mods) return;
  runPasses();
  // back on a desktop his grid shows again: his own resize handler redrew its scroll window first, while the
  // cards still hid it, so draw it once more now that it is visible
  if (!phoneMedia?.matches && !renderedKey) mods.table.drawWindow?.(true);
};

let cardsMemo: { rows: unknown; mode: TeamMode; runs: number; pinned: string | null; pins: string; mine: boolean; phone: boolean; loading: boolean } | null = null;
let listRows: unknown = null;
let listId = 0;
/** where the card list was scrolled when a card opened its team, restored on the way back */
let cardScroll: { listId: number; top: number } | null = null;

function cardsPass(): void {
  if (!root || !mods) return;
  const M = mods.model;
  const rows = M.visibleRows as TeamRow[];
  const phone = !!phoneMedia?.matches;
  // a phone trades his grid for the cards; a desktop keeps the grid and only borrows the host for the
  // empty state his grid lacks (no team matches, or nothing set up at My account)
  const wanted = cardsClaims > 0 && (phone || !rows.length);
  const body = wanted && !renderedKey ? app.querySelector<HTMLElement>(".tcbody") : null;
  root.classList.toggle("wt-cards", phone && !!body);
  root.classList.toggle("wt-cards-empty", !phone && !!body);
  if (!wanted) {
    if (rankingsCards.value) rankingsCards.value = null;
    cardsMemo = null;
    cardsEl?.remove();
    return;
  }
  if (!body) return; // a detail page, or his table not drawn yet: the list keeps its state for the way back
  const host = cardsHost();
  if (host.parentElement !== body) {
    body.appendChild(host);
    if (cardScroll && cardScroll.listId === listId) {
      const main = app.querySelector<HTMLElement>("main");
      if (main) main.scrollTop = cardScroll.top;
    }
    cardScroll = null;
  }
  const mode: TeamMode = mods.table.teamMode === "dps" ? "dps" : "dpr";
  const runs = M.results.size as number;
  const mine = M.filters.cost === "mine";
  const loading = refreshing > 0;
  // his pinned rows (`pinnedRows`, hash `pin=`) stand above the rest, as in his table
  const pinSet = M.pinnedRows as Set<string> | undefined;
  const pins = pinSet?.size ? [...pinSet].join(",") : "";
  const m = cardsMemo;
  if (m && m.rows === rows && m.mode === mode && m.runs === runs && m.pinned === pinnedTeam && m.pins === pins && m.mine === mine
    && m.phone === phone && m.loading === loading) return;
  cardsMemo = { rows, mode, runs, pinned: pinnedTeam, pins, mine, phone, loading };
  const list = passOf.get(rows) ?? rows;
  if (list !== listRows) {
    listRows = list;
    listId++;
  }
  const ordered = tableOrder(rows, (k) => M.results.get(k) as RunRowLike | undefined, mode, (k) => !!pinSet?.has(k));
  const scale = tableScale();
  rankingsCards.value = { cards: teamCards(ordered, scale, mode, rankShown), mode, pinned: scale.pinned, listId, mine, phone, loading };
}

/** A card opens its team's detail page — the same navigation as his "view rotation" link. */
export function openRankingsTeam(key: string): void {
  if (!mods || !router) return;
  cardScroll = { listId, top: app.querySelector<HTMLElement>("main")?.scrollTop ?? 0 };
  void goToDetail(key);
}
/** DPR / DPS from the cards: his own switch is the hidden grid's heading (table.ts `teamMode`), clicked. */
export function setRankingsTeamMode(mode: TeamMode): void {
  if (!mods || (mods.table.teamMode === "dps" ? "dps" : "dpr") === mode) return;
  app.querySelector<HTMLElement>(".tgrid .trow.thead .c.dprhead")?.click();
}

let passObserver: MutationObserver | null = null;
const OBSERVE: MutationObserverInit = { childList: true, subtree: true };
/** His "N teams" heading reads "N teams so far" while the rows on screen are a pass's rows so far (his heading is a grid:
 *  the words go into his own count's text, not an element of their own). */
const SO_FAR = " so far";
function soFarPass(): void {
  const head = app.querySelector<HTMLElement>("#teamCount");
  const text = head?.firstChild;
  if (!head || !(text instanceof Text)) return;
  const want = !!soFar?.drawn;
  const has = text.data.endsWith(SO_FAR);
  if (want && !has) text.data += SO_FAR;
  else if (!want && has) text.data = text.data.slice(0, -SO_FAR.length);
  head.toggleAttribute("data-test-rankings-sofar", want);
}

function runPasses(): void {
  passObserver?.disconnect();
  try {
    comparePass();
    stickyLogPass();
    cardsPass();
    soFarPass();
  } catch (err) {
    console.warn("Wuthering Tools+ rankings pass failed:", err);
  } finally {
    passObserver?.observe(app, OBSERVE);
  }
}
function observeRenders(): void {
  if (passObserver) return;
  passObserver = new MutationObserver((records) => {
    // the search list redraws on every keystroke, and the cards are Vue's own DOM: nothing in either is
    // ours to re-dress
    if (records.every((r) => (r.target as Element).id === "searchResults" || !!cardsEl?.contains(r.target))) return;
    runPasses();
  });
  passObserver.observe(app, OBSERVE);
}

let tableRequested = false;
/** Whether the filters moved under a detail page (a pick menu's switch) since the table's rows were expanded. */
let tableStale = false;
/** the team whose detail is on screen, null while the comparison table is */
let renderedKey: string | null = null;
let routerSyncing = false;

/** Riley's `syncHash` writes every filter into the hash with `history.replaceState`, which vue-router never
 *  sees, so the router's idea of the current URL goes stale. Its next push (opening a rotation) or any nav
 *  link first rewrites the current history entry to that stale URL — and Back came out on a filter-less
 *  page. Bring the router's location up to date after every filter change instead. */
async function syncRouter(): Promise<void> {
  if (!router || router.currentRoute.value.hash === location.hash) return;
  routerSyncing = true;
  try {
    await router.replace({ hash: location.hash });
  } catch {
    /* a cancelled navigation leaves the url as it is */
  } finally {
    routerSyncing = false;
  }
}

function route(): void {
  const { routeTeam } = mods!.model;
  const key = routeTeam();
  root?.classList.toggle("wt-detail", !!key);
  renderedKey = key;
  if (key) { openSide(false); mods!.detail.renderDetail(key); mountImportControls(key); return; }
  rankingsDetail.value = null;
  if (!tableRequested || tableStale) { void refresh(); return; }
  mods!.table.renderComparison();
}

/** refreshes in flight: while one runs, an empty table means "not solved yet" (the cards' empty state waits) */
let refreshing = 0;
async function refresh(): Promise<void> {
  refreshing++;
  try {
    await refreshRows();
  } finally {
    refreshing--;
    // nothing of his may redraw once the last pass ends, so the passes learn it here
    if (!refreshing && root && mods) runPasses();
  }
}

/** Which refresh / pick pass is the live one: an older pass checks it after every wait and stops (Riley's index.ts). */
let generation = 0;

async function refreshRows(): Promise<void> {
  const M = mods!.model;
  const { bestKey } = mods!.solver;
  tableRequested = true;
  tableStale = false;
  // a filter change made while one pass is still solving takes over: the old pass's teams still in line are dropped,
  // and it stops at its next step — anything it already solved or ran is kept
  const gen = ++generation;
  const stale = (): boolean => gen !== generation;
  cancelQueued();
  const f = structuredClone(M.filters);
  // rows another pass drew so far belong to other filters: the overlay covers them again until this pass has its own
  if (soFar && soFar.gen !== gen) endSoFar();
  await syncRouter();
  if (stale()) return;
  barReset();
  const partial = soFarPainter(gen, stale, f.cost === "mine");
  // the pass's last draw. A team opened from the rows so far stays as it is: drawing the same page again jumped its
  // scroll to the top (700 px to 0 on a phone) for nothing, and Back draws the table from the visible rows
  const drawRows = (): void => {
    if (!(soFar?.gen === gen && renderedKey && renderedKey === M.routeTeam())) route();
  };
  try {
    const inPlay = (Object.entries(M.TEAMS) as [string, Member[]][]).filter(([key, members]) => M.teamWanted(key, members)); // Riley's teamWanted takes the key since Sept 2026
    // workers come up while the empty table draws, but only if there is something to solve
    if (inPlay.some(([key, members]) => !M.bestPicks.has(bestKey(key, members, f)))) workerPool();
    if (!M.visibleRows.length) route();

    await ensureBestPicks(inPlay, f, stale, { onTeam: partial.onTeam });
    partial.stop();
    if (stale()) return;
    M.saveSolves();
    const rows: TeamRow[] = M.teamRows();
    passOf.set(rows, gen);
    const cached = rows.filter((row) => M.results.has(row.key));
    passOf.set(cached, gen);
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      await overlayNow("Rendering Table...", rows.length);
      if (stale()) return;
      barProgress(rows.length, rows.length);
      settleSoFar();
      M.setVisibleRows(cached);
      drawRows();
    } else if (!missing) {
      settleSoFar();
      M.setVisibleRows([]);
      drawRows();
    }
    await runMissing(rows, stale);
    if (stale()) return;
    if (missing) {
      await overlayNow("Rendering Table…", rows.length);
      if (stale()) return;
      settleSoFar();
      M.setVisibleRows(rows);
      drawRows();
    }
  } catch (err) {
    partial.stop();
    if (stale()) return;
    if (M.discardRestoredSolves()) {
      console.warn("restored solves failed to load; solving the roster here instead", err);
      M.setVisibleRows([]);
      await refreshRows();
      return;
    }
    showBootError(err);
  }
  endSoFar();
  overlayHide();
}

/* ------------------------------------------------- Wuthering Tools+ rows so far (first useful paint) */
// His table waited for every team in play to be solved before it drew a row. At My account nothing is shipped — the
// page solves the roster in its workers (104 teams on David's export, 3-4 s on a desktop, far more on a phone) — so
// the page sat under "Running Calculations…" the whole time. Now the rows solved so far are drawn while the rest are
// solved: once each worker has answered (or shortly after the first answer), then about once a second (soFar.ts). The overlay
// docks into a small box ("Solving teams at your account · 37 of 104", "the list shows the teams solved so far"), the
// phone cards' heading and his "N teams" read "so far", and the figures are his own (`teamRows()` lists only solved
// teams, their runs filed off the solve's scores). A paint is skipped while a detail page is up or the player is in his
// search box; the last pass draws the whole table exactly as before.

export interface SolvingView {
  /** teams solved in this pass, and how many it solves */
  done: number;
  total: number;
  /** solving at My account (else one of Riley's tiers, a compare) */
  mine: boolean;
}
/** While the rows on screen are a pass's rows so far: how far it is (RankingsCards.vue's heading). */
export const rankingsSolving = shallowRef<SolvingView | null>(null);
let soFar: { gen: number; done: number; total: number; mine: boolean; drawn: boolean } | null = null;
/** the pass each `setVisibleRows()` list came from: a list that grows within one pass keeps the cards' place */
const passOf = new WeakMap<object, number>();

function soFarPainter(gen: number, stale: () => boolean, mine: boolean): SoFarScheduler {
  return soFarScheduler({
    stale,
    wave: () => pool?.length ?? 1,
    paint: (done, total) => paintSoFar(gen, done, total, mine),
    update: (done, total) => {
      if (soFar?.gen !== gen || !soFar.drawn) return;
      soFar.done = done;
      soFar.total = total;
      showSoFar();
    },
  });
}

/** Draw the rows solved so far; false when it is not the moment (a detail page, the search box in use, nothing yet). */
function paintSoFar(gen: number, done: number, total: number, mine: boolean): boolean {
  // the player left the page mid-solve (unmountRankings detached it): no paint the main thread pays for off-screen; the
  // next landing after a return draws, and the pass's last draw is made either way
  if (!mods || !root || !root.isConnected || renderedKey || tableStale || mods.model.routeTeam()) return false;
  // the player is in his search (with something typed) or another of his aside's controls: the last draw catches up.
  // An empty search box only holds his opening caret (`openingFocus`), which is put back after the draw.
  const active = document.activeElement;
  const search = root.querySelector<HTMLInputElement>(".tcside #optionSearch");
  const caret = !!search && active === search && !search.value;
  if (active && active !== document.body && !caret && root.querySelector(".tcside")?.contains(active)) return false;
  const M = mods.model;
  const rows: TeamRow[] = M.teamRows();
  // a row with no run filed off its solve would need a run here: the pass's own run phase does that
  if (!rows.length || rows.some((row) => !M.results.has(row.key))) return false;
  soFar = { gen, done, total, mine, drawn: true };
  passOf.set(rows, gen);
  M.setVisibleRows(rows);
  root.classList.add("wt-sofar");
  showSoFar();
  // a phone reads the cards, and his grid under them is hidden: the cards alone catch up (his whole table render and
  // its measuring were most of a paint's cost); the pass's last draw renders his table as before
  if (cardsClaims > 0 && phoneMedia?.matches && root.classList.contains("wt-cards")) runPasses();
  else route();
  if (caret) root.querySelector<HTMLInputElement>(".tcside #optionSearch")?.focus({ preventScroll: true });
  return true;
}

/** The docked overlay's line and the cards' heading, from `soFar`. */
function showSoFar(): void {
  if (!soFar) return;
  overlayStatus.textContent = soFar.mine ? "Solving teams at your account" : "Solving teams";
  overlayCount.textContent = `${soFar.done} of ${soFar.total}`;
  rankingsSolving.value = { done: soFar.done, total: soFar.total, mine: soFar.mine };
}

/** The pass is about to draw its whole table: the rows on screen stop being "so far" (the docked box stays up until
 *  the overlay goes, so it never jumps back to the full-screen veil over rows already shown). */
function settleSoFar(): void {
  if (soFar) soFar.drawn = false;
  if (rankingsSolving.value) rankingsSolving.value = null;
}
function endSoFar(): void {
  soFar = null;
  root?.classList.remove("wt-sofar");
  if (rankingsSolving.value) rankingsSolving.value = null;
}

/** A `#team=` load served off its key alone: one traced run, no table build. A team code (Riley's
 *  teamcode.ts) leaving gear to the solver reads back once that one team is solved with its gear
 *  compares shut. */
async function bootDetail(): Promise<boolean> {
  const { hashTeam, results, rowFromKey, tagTeam, gearShut, filters } = mods!.model;
  let key: string | null = hashTeam();
  const pending = key && !rowFromKey(key) ? tagTeam(key) : null;
  if (pending) {
    overlayPhase("Solving Team…", true);
    await paint();
    await solveQuiet(pending, gearShut(filters));
    key = hashTeam();
    if (key && !rowFromKey(key)) overlayHide();
  }
  if (!key || results.has(key)) return false;
  const row = rowFromKey(key);
  if (!row) return false;
  overlayPhase("Running Rotation…", true);
  await paint();
  results.set(key, mods!.teamrun.runTeam(row.teamKey, row.members, row.combo, true));
  // a detail page opened straight from a link is a detail page too (no phone toolbar, no cards)
  root?.classList.add("wt-detail");
  renderedKey = key;
  mods!.detail.renderDetail(key);
  mountImportControls(key);
  overlayHide();
  return true;
}

/** A detail pick (Riley's pickmenu.ts): solve the one team under each try's filters in turn, open the
 *  first row one names, and let the table catch up when next shown. `undo` puts the filters back if none. */
async function switchTo(teamKey: string, attempts: { setUp: () => boolean; choose: (rows: TeamRow[]) => TeamRow | null }[], undo: () => void): Promise<void> {
  const M = mods!.model;
  tableStale = true;
  const gen = ++generation;
  const stale = (): boolean => gen !== generation;
  cancelQueued();
  if (soFar) endSoFar();
  barReset();
  try {
    for (const attempt of attempts) {
      if (!attempt.setUp()) continue;
      await ensureBestPicks([[teamKey, M.TEAMS[teamKey] as Member[]]], structuredClone(M.filters), stale);
      if (stale()) return;
      M.saveSolves();
      const row = attempt.choose(M.solvedRows(teamKey));
      if (!row) continue;
      // a teammate re-picked past the guess the pick was costed on can still trip a filter
      M.admitBuild(row.members, row.combo);
      await overlayNow("Running Rotation…", 1);
      if (stale()) return;
      await reopenDetail(row.key);
      overlayHide();
      return;
    }
  } catch (err) {
    if (!stale()) showBootError(err);
    return;
  }
  undo();
  overlayHide();
}

/** One team solved under `f` with no overlay and no redraw — what an open pick menu reads its
 *  Compare figures off (pickmenu.ts), and what a team code's gear is read back from. */
async function solveQuiet(teamKey: string, f: any): Promise<void> {
  const M = mods!.model, S = mods!.solver;
  const members = M.TEAMS[teamKey] as Member[];
  await M.loadShipped(f);
  if (M.bestPicks.has(S.bestKey(teamKey, members, f)) || !members.every((m) => S.hasBuild(m, f))) return;
  await solveAll([[teamKey, members]], f, () => {});
  M.saveSolves();
}

/** Riley's `reopenDetail()` through vue-router: the entry under the detail page becomes the table on
 *  the new filters, so Back lands on a table that can show the new row, and the new row goes on top. */
async function reopenDetail(key: string): Promise<void> {
  mods!.model.syncHash(null);
  await syncRouter();
  await goToDetail(key);
}

/** Navigate to a team's detail page through vue-router (a real history entry, its state kept). */
async function goToDetail(teamKey: string): Promise<void> {
  await syncRouter();
  const p = mods!.model.hashParams() as URLSearchParams;
  p.set("team", teamKey);
  detailPushed = true;
  await router!.push({ hash: `#${p.toString()}` });
  route();
}

function goBack(): void {
  if (detailPushed) { detailPushed = false; router!.back(); return; }
  const p = mods!.model.hashParams() as URLSearchParams;
  p.delete("team");
  const hash = p.toString();
  void router!.replace({ hash: hash ? `#${hash}` : "" }).then(() => route());
}

/** The location changed under us (browser back/forward, a nav click): re-read the hash. */
export function onLocationChange(): void {
  if (!mods || !booted || routerSyncing) return;
  const M = mods.model;
  if (M.applyHash()) { void refresh(); return; }
  const key = M.hashTeam();
  if (key && !M.results.has(key) && (M.rowFromKey(key) || M.tagTeam(key))) {
    // a code that still names no row once its team is solved comes back off the URL, and one that
    // opens is written back as it reads (Riley's hashchange)
    void bootDetail().then(async (shown) => {
      M.syncHash();
      await syncRouter();
      if (!shown) route();
    });
    return;
  }
  // the location moved without changing what is on screen (a stale table on screen still has to catch up; a detail page's
  // does when Back shows it)
  if (tableRequested && M.routeTeam() === renderedKey && (renderedKey || !tableStale)) return;
  route();
}

async function boot(): Promise<void> {
  const M = mods!.model;
  mods!.table.onRefresh(refresh);
  mods!.pickmenu.onSwitch(switchTo);
  mods!.pickmenu.onSolve(solveQuiet);
  M.applyHash();
  await M.loadSolves();
  // wired before the first pass, not after it as in his index.ts: the rows solved so far are on screen while that
  // pass solves (paintSoFar), so "view rotation" must open a team and the detail's Back link must go back — unwired,
  // the link's "#" emptied the hash and Back landed on his S0R1 tier mid-solve
  mods!.panels.wireSourcePanels(app);
  root!.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".gotodetail");
    if (el?.dataset.team) void goToDetail(el.dataset.team);
  });
  backLink.addEventListener("click", (e) => { e.preventDefault(); goBack(); });
  const detail = await bootDetail().catch((err: unknown) => {
    if (!M.discardRestoredSolves()) throw err;
    console.warn("restored solves failed to load; solving the roster here instead", err);
    return false;
  });
  if (!detail) await refresh();
  M.syncHash();
  await syncRouter();
  const idle = (globalThis as any).requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 500));
  idle(() => { workerPool(); });
}

function showBootError(err: unknown): void {
  console.error(err);
  // Riley dropped his error page in Sept 2026: the error lives in the overlay box below and the page
  // underneath is left as it was (his index.ts `showError`)
  const box = overlay.querySelector<HTMLElement>(".loading-error");
  if (box) {
    box.hidden = false;
    box.textContent += `${box.textContent ? "\n\n" : ""}${err instanceof Error ? err.stack ?? err.message : String(err)}`;
    overlay.hidden = false;
  }
}

/** Mount into `host`. The skittle DOM is created once and re-attached on later visits, because
 *  Riley's page modules cache `#app`/`#topbar` when they are first imported. */
let fetchPatched = false;
/** Riley's `loadSolves()` probes `/__livereload` (his dev server's hot-reload stamp) and, on a 200,
 *  skips the shipped solves. Vite dev and Vercel's SPA rewrite both answer every path with
 *  index.html, so the probe must be answered with a 404 here or the page would re-solve all
 *  625 teams in the browser on first load. Scoped to that one URL. */
function patchFetch(): void {
  if (fetchPatched) return;
  fetchPatched = true;
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/__livereload" || url.endsWith("/__livereload")) return Promise.resolve(new Response(null, { status: 404 }));
    return real(input, init);
  }) as typeof fetch;
}

/** Wuthering Tools+: a visit that opens on My account with no solve saved for this account (Riley's localStorage
 *  `wuwa.solves.v1`, keyed `…|mine.<account key>|…`) solves its whole roster in the workers. They come up now, while his
 *  page modules load, instead of after them: each worker parses the whole engine graph, which took ~0.75 s before its
 *  first answer on a desktop dev server. A team link (`team=`) or one of his tiers (shipped solves) waits for idle. */
function solvesAhead(): boolean {
  if (poolTried || !account?.key) return false;
  const p = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (p.get("tc") !== "mine" || p.has("team")) return false;
  try {
    return !(localStorage.getItem("wuwa.solves.v1") ?? "").includes(`|mine.${account.key}|`);
  } catch {
    return true;
  }
}

export async function mountRankings(host: HTMLElement, r: Router, builds: BuildRolls[] = [], acct: AccountRegistration | null = null): Promise<void> {
  router = r;
  // the view's watchers (updateMyBuilds, updateAccountState) stop with the page, so a change made on another page lands
  // here: the table on the root is the old account's, and a pass still out would have every answer refused by `file()`
  const movedAway = (acct?.key ?? "") !== (account?.key ?? "") || buildsStamp(builds) !== buildsStamp(myBuilds);
  myBuilds = builds;
  account = acct;
  patchFetch();
  if (!root) root = buildDom();
  host.appendChild(root);
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("keydown", onTabEscape, true);
  document.addEventListener("click", onBaselineClick, true);
  phoneMedia ??= matchMedia(PHONE_QUERY);
  phoneMedia.addEventListener("change", onPhoneChange);
  observeRenders();
  if (solvesAhead()) workerPool();
  try {
    if (!mods) mods = await loadModules();
    if (!rankingsRoster.value.length) rankingsRoster.value = rosterOf(mods.model.TEAMS);
    applyMyBuilds();
    applyAccountState();
    if (!booted) { booted = boot(); await booted; }
    else {
      if (movedAway) tableStale = true;
      onLocationChange();
    }
  } catch (err) {
    showBootError(err);
  }
}

export function unmountRankings(): void {
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("keydown", onTabEscape, true);
  document.removeEventListener("click", onBaselineClick, true);
  phoneMedia?.removeEventListener("change", onPhoneChange);
  openSide(false);
  root?.remove();
  mods?.panels?.clearPops?.();
  document.body.querySelectorAll(":scope > .ctxmenu, :scope > .pickbox").forEach((el) => el.remove());
}
