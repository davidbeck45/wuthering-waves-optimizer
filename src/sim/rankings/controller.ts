/**
 * Hosts Riley31415/wuwa_calc's comparison table + detail pages inside this app.
 *
 * A port of his `src/index.ts` (the page controller) with three changes: the DOM his page modules
 * look up at import time (`#app`, `#topbar`, `#backLink`, `#loading`) is built here inside a
 * persistent `.skittle-root` element that survives route changes; his modules are imported lazily
 * after that DOM exists; and detail navigation goes through vue-router so its history state is not
 * clobbered. Everything else — the solve/run passes, the overlay, the worker pool — is his logic.
 * The engine, kits and page modules themselves come straight from the submodule via `@skittle/*`.
 */
import type { Router } from "vue-router";
import type { BuildRolls } from "./myBuilds";
import { useToast } from "../../composables/useToast";
import { importTeamFromRankings } from "./importFromRankings";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Member = { name: string; mainDps: boolean };
type TeamRow = { key: string; teamKey: string; members: Member[]; combo: any[] };
type Solved = { picks: any; rows: any[]; scores: any; hidden: any[]; hiddenScores: any[] };
interface Mods {
  display: any; solver: any; teamrun: any; model: any; panels: any; table: any; detail: any; stats: any; substats: any;
}

const TEMPLATE = `
  <div class="wt-toolbar">
    <button type="button" class="btn btn-sm btn-primary" data-test-rankings-filters>Filters &amp; options</button>
    <span class="wt-toolbar__hint">team cost · resonators · standards</span>
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

/** phones: Riley's aside lives in a bottom sheet (skittle-theme.css) toggled from the toolbar */
const openSide = (open: boolean): void => {
  root?.classList.toggle("wt-side-open", open);
};
const onKeydown = (e: KeyboardEvent): void => { if (e.key === "Escape") openSide(false); };

function buildDom(): HTMLElement {
  const el = document.createElement("div");
  el.className = "skittle-root";
  el.innerHTML = TEMPLATE;
  el.querySelector("[data-test-rankings-filters]")!.addEventListener("click", () => el.classList.toggle("wt-side-open"));
  el.querySelector(".wt-backdrop")!.addEventListener("click", () => el.classList.remove("wt-side-open"));
  el.querySelector("[data-test-rankings-filters-close]")!.addEventListener("click", () => el.classList.remove("wt-side-open"));
  app = el.querySelector<HTMLElement>("#app")!;
  backLink = el.querySelector<HTMLElement>("#backLink")!;
  overlay = el.querySelector<HTMLElement>("#loading")!;
  overlayStatus = overlay.querySelector<HTMLElement>(".status-text")!;
  overlayCount = overlay.querySelector<HTMLElement>(".progress-count")!;
  overlayFill = overlay.querySelector<HTMLElement>(".progress-fill")!;
  return el;
}

async function loadModules(): Promise<Mods> {
  const [display, solver, teamrun, model, panels, table, detail, stats, substats] = await Promise.all([
    import("@skittle/display"), import("@skittle/solver"), import("@skittle/teamrun"),
    import("@skittle/page/model"), import("@skittle/page/panels"), import("@skittle/page/table"), import("@skittle/page/detail"),
    import("@skittle/engine/stats"), import("@skittle/shared/substats"),
  ]);
  return { display, solver, teamrun, model, panels, table, detail, stats, substats };
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
const OVERLAY_ROWS = 200;
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
  overlayCount.textContent = `${fmt(done)} / ${fmt(total)}`;
}
let lastPaint = performance.now();
async function breathe(): Promise<void> {
  if (performance.now() - lastPaint <= 50) return;
  await paint();
  lastPaint = performance.now();
}

/* ------------------------------------------------------------------------------ the passes */

async function runMissing(rows: TeamRow[]): Promise<void> {
  const { results } = mods!.model;
  const { runTeam } = mods!.teamrun;
  const missing = rows.filter((row) => !results.has(row.key));
  if (!missing.length) return;
  overlayPhase("Running Rotations…", true);
  const cached = rows.length - missing.length;
  barProgress(cached, rows.length);
  for (let i = 0; i < missing.length; i++) {
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
/** The builds changed in the app (a character's echoes were edited): re-register and redraw. */
export function updateMyBuilds(builds: BuildRolls[]): void {
  myBuilds = builds;
  applyMyBuilds();
  if (mods && booted && tableRequested) void refresh();
}

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
    for (const w of pool) w.postMessage({ type: "mySubstats", builds: myBuilds, clear: [] });
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}

function solveOnWorkers(
  workers: Worker[], teams: [string, Member[]][],
  onDone: (members: Member[]) => void, onShare?: (members: Member[], share: number) => void,
): Promise<void> {
  const { filters, picksCache, storeSolved, solveFits } = mods!.model;
  const { picksKey, bestKey, isProgress, solveTeam } = mods!.solver;
  return new Promise((resolve) => {
    let next = 0, live = 0, id = 0;
    const pump = (w: Worker): void => {
      if (next >= teams.length) {
        if (--live === 0) resolve();
        return;
      }
      const [key, members] = teams[next++]!;
      const known = picksCache.get(picksKey(key, members, filters)) ?? null;
      const finish = (solved: Solved): void => {
        storeSolved(key, solved);
        onDone(members);
        pump(w);
      };
      w.onmessage = ({ data }: MessageEvent<any>) => {
        if (isProgress(data)) { onShare?.(members, data.share); return; }
        const solved: Solved = { picks: data.picks, rows: data.rows, scores: data.scores, hidden: data.hidden ?? [], hiddenScores: data.hiddenScores ?? [] };
        if (solveFits(bestKey(key, members, filters), solved)) { finish(solved); return; }
        console.warn(`worker's solve for ${key} does not fit this build; solving it here`);
        finish(solveTeam(key, members, filters, known));
      };
      w.onerror = (e) => {
        console.warn(`worker failed on ${key}, solving it here:`, e.message);
        e.preventDefault();
        finish(solveTeam(key, members, filters, known));
      };
      w.postMessage({ id: id++, teamKey: key, filters, picks: known });
    };
    for (const w of workers.slice(0, teams.length)) { live++; pump(w); }
    if (live === 0) resolve();
  });
}

async function ensureBestPicks(inPlay: [string, Member[]][]): Promise<boolean> {
  const { filters, bestPicks, picksCache, storeSolved, loadShipped, estimatedRowCount } = mods!.model;
  const { hasBuild, bestKey, picksKey, solveTeam } = mods!.solver;
  await loadShipped(filters);
  const teams = inPlay.filter(([key, members]) => !bestPicks.has(bestKey(key, members, filters)));
  if (!teams.length) return false;
  const rowsOf = (members: Member[]): number => (members.every((m) => hasBuild(m, filters)) ? estimatedRowCount(members) : 0);
  const solvable = teams.filter(([, members]) => members.every((m) => hasBuild(m, filters)))
    .map((t) => [t, rowsOf(t[1])] as const).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  if (!solvable.length) return false;
  const total = solvable.reduce((n, [, members]) => n + rowsOf(members), 0);
  await overlayNow("Running Calculations...");
  let done = 0;
  const progress = (): void => barProgress(done, total);
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
  const workers = workerPool();
  if (workers) await solveOnWorkers(workers, solvable, (members) => share(members, 1), share);
  else {
    for (const [key, members] of solvable) {
      const known = picksCache.get(picksKey(key, members, filters)) ?? null;
      storeSolved(key, solveTeam(key, members, filters, known, (part: number) => share(members, part)));
      share(members, 1);
      await breathe();
    }
  }
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
function mountImportControls(key: string): void {
  const topbar = root?.querySelector<HTMLElement>("#topbar");
  if (!topbar) return;
  let box = topbar.querySelector<HTMLElement>(".wt-import");
  if (!box) {
    box = document.createElement("div");
    box.className = "wt-import";
    box.innerHTML = `
      <label class="wt-import__opt"><input type="checkbox" data-test-rankings-import-rotations checked> also save each member's rotation</label>
      <button type="button" class="btn btn-primary btn-xs" data-test-rankings-import-team>Import team into Wuthering Tools+</button>`;
    topbar.appendChild(box);
    box.querySelector("button")!.addEventListener("click", () => void runImport());
  }
  box.dataset.team = key;
}

async function runImport(): Promise<void> {
  if (importBusy || !mods) return;
  const box = root?.querySelector<HTMLElement>(".wt-import");
  const key = box?.dataset.team ?? (mods.model.hashParams() as URLSearchParams).get("team");
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
    if (button) { button.disabled = false; button.textContent = "Import team into Wuthering Tools+"; }
  }
}

let tableRequested = false;
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
  if (!tableRequested) { void refresh(); return; }
  mods!.table.renderComparison();
}

async function refresh(): Promise<void> {
  const M = mods!.model;
  const { bestKey } = mods!.solver;
  tableRequested = true;
  await syncRouter();
  barReset();
  try {
    const inPlay = (Object.entries(M.TEAMS) as [string, Member[]][]).filter(([key, members]) => M.teamWanted(key, members)); // Riley's teamWanted takes the key since Sept 2026
    if (inPlay.some(([key, members]) => !M.bestPicks.has(bestKey(key, members, M.filters)))) workerPool();
    if (!M.visibleRows.length) route();

    await ensureBestPicks(inPlay);
    M.saveSolves();
    const rows: TeamRow[] = M.teamRows();
    const cached = rows.filter((row) => M.results.has(row.key));
    const missing = cached.length !== rows.length;
    if (!missing && cached.length) {
      await overlayNow("Rendering Table...", rows.length);
      barProgress(rows.length, rows.length);
      M.setVisibleRows(cached);
      route();
    } else if (!missing) {
      M.setVisibleRows([]);
      route();
    }
    await runMissing(rows);
    if (missing) {
      await overlayNow("Rendering Table…", rows.length);
      M.setVisibleRows(rows);
      route();
    }
  } catch (err) {
    if (M.discardRestoredSolves()) {
      console.warn("restored solves failed to load; solving the roster here instead", err);
      M.setVisibleRows([]);
      await refresh();
      return;
    }
    showBootError(err);
  }
  overlayHide();
}

async function bootDetail(): Promise<boolean> {
  const { hashParams, results, rowFromKey } = mods!.model;
  const key = hashParams().get("team");
  if (!key || results.has(key)) return false;
  const row = rowFromKey(key);
  if (!row) return false;
  overlayPhase("Running Rotation…", true);
  await paint();
  results.set(key, mods!.teamrun.runTeam(row.teamKey, row.members, row.combo, true));
  mods!.detail.renderDetail(key);
  mountImportControls(key);
  overlayHide();
  return true;
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
  const key = M.hashParams().get("team");
  if (key && !M.results.has(key) && M.rowFromKey(key)) { void bootDetail(); return; }
  if (tableRequested && M.routeTeam() === renderedKey) return; // the location moved without changing what is on screen
  route();
}

async function boot(): Promise<void> {
  const M = mods!.model;
  mods!.table.onRefresh(refresh);
  M.applyHash();
  await M.loadSolves();
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
  mods!.panels.wireSourcePanels(app);
  root!.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".gotodetail");
    if (el?.dataset.team) void goToDetail(el.dataset.team);
  });
  backLink.addEventListener("click", (e) => { e.preventDefault(); goBack(); });
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

export async function mountRankings(host: HTMLElement, r: Router, builds: BuildRolls[] = []): Promise<void> {
  router = r;
  myBuilds = builds;
  patchFetch();
  if (!root) root = buildDom();
  host.appendChild(root);
  document.addEventListener("keydown", onKeydown);
  try {
    if (!mods) mods = await loadModules();
    applyMyBuilds();
    if (!booted) { booted = boot(); await booted; }
    else onLocationChange();
  } catch (err) {
    showBootError(err);
  }
}

export function unmountRankings(): void {
  document.removeEventListener("keydown", onKeydown);
  openSide(false);
  root?.remove();
  mods?.panels?.clearPops?.();
  document.body.querySelectorAll(":scope > .ctxmenu").forEach((el) => el.remove());
}
