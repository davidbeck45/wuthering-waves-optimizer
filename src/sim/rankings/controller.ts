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
import { rosterOf, type RosterEntry } from "./filterChips";
import { compareScale, shareText, shareWidth, strengthOf, teamFigureOf, type CompareScale, type TeamMode } from "./compareColumn";
import { cardMemberOf, mainFirst, tableOrder, teamCards, type CardMember, type RunRowLike, type TeamCard } from "./phoneCards";
import { appKeyOf } from "./rileyNames";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Member = { name: string; mainDps: boolean };
type TeamRow = { key: string; teamKey: string; members: Member[]; combo: any[] };
type Solved = { picks: any; rows: any[]; scores: any; hidden: any[]; hiddenScores: any[] };
interface Mods {
  display: any; solver: any; teamrun: any; model: any; panels: any; table: any; detail: any; pickmenu: any; stats: any; substats: any;
}

const TEMPLATE = `
  <div class="wt-toolbar">
    <button type="button" class="btn btn-sm btn-primary" data-test-rankings-filters><svg viewBox="0 0 24 24" class="wt-toolbar__icon" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" stroke-linecap="round"/></svg><span class="wt-toolbar__long">Search &amp; compare</span><span class="wt-toolbar__short">Filters</span></button>
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
  // Wuthering Tools+: a phone's card list puts its count and DPR / DPS switch in this toolbar (RankingsCards.vue)
  el.querySelector(".wt-toolbar__hint")!.after(cardsHeadHost());
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
  // Riley moved the solver and team run into solve/, display.ts into page/, teams.ts into resonators/ (Oct 2026)
  const [display, solver, teamrun, model, panels, table, detail, pickmenu, stats, substats] = await Promise.all([
    import("@skittle/page/display"), import("@skittle/solve/solver"), import("@skittle/solve/teamrun"),
    import("@skittle/page/model"), import("@skittle/page/panels"), import("@skittle/page/table"), import("@skittle/page/detail"),
    import("@skittle/page/pickmenu"), import("@skittle/engine/stats"), import("@skittle/shared/substats"),
  ]);
  return { display, solver, teamrun, model, panels, table, detail, pickmenu, stats, substats };
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
    }
  } catch (err) {
    console.warn("Workers unavailable, optimizing on the main thread instead:", err);
    pool = null;
  }
  return pool;
}

function solveOnWorkers(
  workers: Worker[], teams: [string, Member[]][],
  onDone: (members: Member[]) => void, onShare?: (members: Member[], share: number) => void,
  filters: any = mods!.model.filters,
): Promise<void> {
  const { picksCache, storeSolved, solveFits } = mods!.model;
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

async function ensureBestPicks(inPlay: [string, Member[]][], filters: any = mods!.model.filters): Promise<boolean> {
  const { bestPicks, picksCache, storeSolved, loadShipped, estimatedRowCount } = mods!.model;
  const { hasBuild, bestKey, picksKey, solveTeam } = mods!.solver;
  await loadShipped(filters);
  const teams = inPlay.filter(([key, members]) => !bestPicks.has(bestKey(key, members, filters)));
  if (!teams.length) return false;
  const rowsOf = (members: Member[]): number => (members.every((m) => hasBuild(m, filters)) ? estimatedRowCount(members, filters) : 0);
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
  if (workers) await solveOnWorkers(workers, solvable, (members) => share(members, 1), share, filters);
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
      await ensureBestPicks(keys.map((k) => [k, M.TEAMS[k] as Member[]]));
      const out = new Map<string, SolvedBest | null>();
      for (const key of keys) {
        const members = M.TEAMS[key] as Member[];
        const solved = M.bestPicks.get(S.bestKey(key, members, M.filters)) as Solved | undefined;
        const row = solved?.rows?.[0];
        if (!row) { out.set(key, null); continue; }
        const combo = row.map((p: any, i: number) => S.comboOf((members[i] as any).loadout, p));
        out.set(key, { total: Number(solved!.scores?.[0]?.total ?? 0), ref: `${key}-${combo.map((c: any) => c.key).join("-")}` });
      }
      return out;
    });
  const importInto = (team: TeamLike, best: SolvedBest): Promise<ImportResult> =>
    withMine(() => importTeamFromRankings(engine, best.ref as string, { replaceTeamId: team.id }));
  try {
    const report = await runSync({ teams, rileyTeams: M.TEAMS, solveBest, importInto });
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
}

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
let cardsHeadEl: HTMLElement | null = null;
/** The element RankingsCards.vue teleports its heading into: in the phone toolbar, beside "Search & compare". */
export function cardsHeadHost(): HTMLElement {
  cardsHeadEl ??= Object.assign(document.createElement("div"), { className: "wt-toolbar__cards" });
  return cardsHeadEl;
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
  if (rows !== listRows) {
    listRows = rows;
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
function runPasses(): void {
  passObserver?.disconnect();
  try {
    comparePass();
    stickyLogPass();
    cardsPass();
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

async function refreshRows(): Promise<void> {
  const M = mods!.model;
  const { bestKey } = mods!.solver;
  tableRequested = true;
  tableStale = false;
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
      await refreshRows();
      return;
    }
    showBootError(err);
  }
  overlayHide();
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
let switchGen = 0;
async function switchTo(teamKey: string, attempts: { setUp: () => boolean; choose: (rows: TeamRow[]) => TeamRow | null }[], undo: () => void): Promise<void> {
  const M = mods!.model;
  tableStale = true;
  const gen = ++switchGen;
  const stale = (): boolean => gen !== switchGen;
  barReset();
  try {
    for (const attempt of attempts) {
      if (!attempt.setUp()) continue;
      await ensureBestPicks([[teamKey, M.TEAMS[teamKey] as Member[]]], structuredClone(M.filters));
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
  const workers = workerPool();
  if (workers) await solveOnWorkers(workers, [[teamKey, members]], () => {}, undefined, f);
  else M.storeSolved(teamKey, S.solveTeam(teamKey, members, f, M.picksCache.get(S.picksKey(teamKey, members, f)) ?? null));
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
  if (tableRequested && M.routeTeam() === renderedKey) return; // the location moved without changing what is on screen
  route();
}

async function boot(): Promise<void> {
  const M = mods!.model;
  mods!.table.onRefresh(refresh);
  mods!.pickmenu.onSwitch(switchTo);
  mods!.pickmenu.onSolve(solveQuiet);
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

export async function mountRankings(host: HTMLElement, r: Router, builds: BuildRolls[] = [], acct: AccountRegistration | null = null): Promise<void> {
  router = r;
  myBuilds = builds;
  account = acct;
  patchFetch();
  if (!root) root = buildDom();
  host.appendChild(root);
  document.addEventListener("keydown", onKeydown);
  document.addEventListener("click", onBaselineClick, true);
  phoneMedia ??= matchMedia(PHONE_QUERY);
  phoneMedia.addEventListener("change", onPhoneChange);
  observeRenders();
  try {
    if (!mods) mods = await loadModules();
    if (!rankingsRoster.value.length) rankingsRoster.value = rosterOf(mods.model.TEAMS);
    applyMyBuilds();
    applyAccountState();
    if (!booted) { booted = boot(); await booted; }
    else onLocationChange();
  } catch (err) {
    showBootError(err);
  }
}

export function unmountRankings(): void {
  document.removeEventListener("keydown", onKeydown);
  document.removeEventListener("click", onBaselineClick, true);
  phoneMedia?.removeEventListener("change", onPhoneChange);
  openSide(false);
  root?.remove();
  mods?.panels?.clearPops?.();
  document.body.querySelectorAll(":scope > .ctxmenu, :scope > .pickbox").forEach((el) => el.remove());
}
