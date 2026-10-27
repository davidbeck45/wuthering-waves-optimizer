// Wuthering Tools+ — the command palette's items and ranking. Pure (no Vue, no stores): CommandPalette.vue
// feeds it the roster, the saved teams and the router's known paths, and runs whatever the chosen item names.
import { normalize } from "../../utils/actionTextMatch";
import { PLUS_PAGES } from "./plusPages";

export type PaletteGroup = "ask" | "page" | "action" | "character" | "team";

export type PaletteRun =
  | { kind: "route"; path: string }
  | { kind: "character"; key: string }
  | { kind: "team"; id: string }
  | { kind: "action"; action: PaletteAction }
  | { kind: "ask"; question: string };

export type PaletteAction = "toggle-theme" | "toggle-ui" | "ai-settings" | "ai-open" | "ai-new-chat";

export interface PaletteItem {
  key: string;
  group: PaletteGroup;
  title: string;
  subtitle?: string;
  /** extra words matched (not shown) */
  keywords?: string[];
  /** 24×24 stroke path for the row icon */
  icon?: string;
  /** an image (character portrait) instead of an icon */
  image?: string;
  /** a short badge on the right ("S6", "Set up", "Ctrl J") */
  badge?: string;
  run: PaletteRun;
}

export const GROUP_LABELS: Record<PaletteGroup, string> = {
  ask: "Claude",
  page: "Pages",
  action: "Actions",
  character: "Characters",
  team: "Saved teams",
};

const ICON = {
  calculator: "M6 20V4M12 20V4M18 20V4M4 15h4M10 9h4M16 13h4",
  inventory: "M5 8h14l-1 12H6L5 8zm4 0V6a3 3 0 016 0v2",
  convene: "M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 3z",
  teams: "M8 11a3 3 0 100-6 3 3 0 000 6zm8 0a3 3 0 100-6 3 3 0 000 6zM2 20a6 6 0 0112 0m-2 0a6 6 0 0110 0",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  info: "M12 22a10 10 0 100-20 10 10 0 000 20zm0-6v-4m0-4h.01",
  updates: "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  theme: "M12 3a9 9 0 109 9 7 7 0 01-9-9z",
  layout: "M4 5h16v14H4zM4 9h16M9 9v10",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z",
  key: "M15 7a4 4 0 11-3.9 4.9L4 19v2h3v-2h2v-2h2l1.1-1.1A4 4 0 0115 7z",
  chat: "M4 5h16v11H8l-4 4V5zm8 3v5m-2.5-2.5h5",
  rank: "M4 20h16M6 20V10M12 20V4M18 20v-7",
  team: "M3 6h18M3 12h18M3 18h18",
};

/** Upstream's pages (the plus ones come from PLUS_PAGES). */
export const CORE_PAGES: Array<{ path: string; title: string; description: string; keywords: string[]; icon: string }> = [
  { path: "/", title: "Calculator", description: "Your active character's stats, damage and builds", keywords: ["home", "damage", "build", "stats", "optimizer", "echoes", "weapon"], icon: ICON.calculator },
  { path: "/inventory", title: "Inventory", description: "Every echo you own: filter, edit, import", keywords: ["echoes", "backpack", "fodder", "feed", "import"], icon: ICON.inventory },
  { path: "/convene", title: "Convene odds", description: "Pull odds and pity planning", keywords: ["gacha", "pull", "banner", "pity", "wish"], icon: ICON.convene },
  { path: "/teams", title: "Team rotations", description: "Saved teams, their rotations and damage", keywords: ["team", "rotation", "party", "presets"], icon: ICON.teams },
  { path: "/settings", title: "Settings", description: "Theme, backup and restore, labs", keywords: ["backup", "restore", "import", "export", "preferences"], icon: ICON.settings },
  { path: "/info", title: "Info", description: "How the calculator works, formulas, credits", keywords: ["help", "formulas", "credits", "about", "cv"], icon: ICON.info },
  { path: "/info/tuning-odds", title: "Echo tuning odds", description: "The odds of each substat roll when you tune an echo", keywords: ["tune", "tuning", "odds", "substat", "roll", "chance"], icon: ICON.info },
  { path: "/info/cv-echo-rating", title: "CV and echo rating", description: "How crit value and the echo rating are worked out", keywords: ["cv", "crit value", "rating", "score", "echo"], icon: ICON.info },
  { path: "/updates", title: "Updates", description: "What changed in the app", keywords: ["changelog", "news", "release"], icon: ICON.updates },
];

/** The page title for a route path (core or plus), for the assistant's page context. */
export function pageTitleOf(path: string): string | null {
  const base = path.split(/[?#]/)[0] || "/";
  return [...CORE_PAGES, ...PLUS_PAGES].find((p) => p.path === base)?.title ?? null;
}

export interface PaletteSources {
  /** router paths that resolve to a page (a PLUS_PAGES entry without its route is skipped) */
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  hasRoute: (path: string) => boolean;
  characters: Array<{ key: string; name: string; rarity?: number | null; element?: string | null; weapon?: string | null; setUp: boolean; sequence?: number | null; portrait?: string }>;
  teams: Array<{ id: string; name: string; members: string[] }>;
  themeStyle: "light" | "dark";
  classicUi: boolean;
  aiKeySet: boolean;
  /** a conversation exists */
  aiChat: boolean;
  /** "Ctrl" or "⌘" */
  mod: string;
}

export function paletteItems(s: PaletteSources): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const p of [...CORE_PAGES, ...PLUS_PAGES]) {
    if (!s.hasRoute(p.path) || items.some((i) => i.run.kind === "route" && i.run.path === p.path)) continue;
    items.push({ key: `page:${p.path}`, group: "page", title: p.title, subtitle: p.description, keywords: [...p.keywords, p.path], icon: p.icon, run: { kind: "route", path: p.path } });
  }
  items.push(
    { key: "action:rank", group: "action", title: "Rank my roster", subtitle: "Score every character and team you can field on your real builds", keywords: ["my rankings", "dps", "best team", "invest"], icon: ICON.rank, run: { kind: "route", path: "/my-rankings" } },
    { key: "action:ai-open", group: "action", title: "Open the assistant", subtitle: s.aiKeySet ? "Ask Claude about your account" : "Set up Claude with your own API key", keywords: ["claude", "ai", "chat", "ask", "assistant", "help"], icon: ICON.sparkle, badge: `${s.mod} J`, run: { kind: "action", action: "ai-open" } },
    ...(s.aiChat ? [{ key: "action:ai-new", group: "action" as const, title: "New chat with Claude", subtitle: "Clear this conversation and start over", keywords: ["claude", "ai", "reset", "clear"], icon: ICON.chat, run: { kind: "action" as const, action: "ai-new-chat" as const } }] : []),
    { key: "action:ai-settings", group: "action", title: "AI settings", subtitle: "API key, model, effort and budget", keywords: ["claude", "anthropic", "key", "model", "opus", "sonnet", "haiku", "budget"], icon: ICON.key, run: { kind: "action", action: "ai-settings" } },
    { key: "action:theme", group: "action", title: s.themeStyle === "light" ? "Switch to dark theme" : "Switch to light theme", subtitle: "Toggle the app's colour theme", keywords: ["theme", "dark", "light", "mode", "colors"], icon: ICON.theme, run: { kind: "action", action: "toggle-theme" } },
    { key: "action:ui", group: "action", title: s.classicUi ? "Switch to the v3 UI" : "Switch to the classic UI", subtitle: s.classicUi ? "The redesigned workspace (the default)" : "The previous layout, still supported", keywords: ["classic", "v3", "layout", "legacy", "ui"], icon: ICON.layout, run: { kind: "action", action: "toggle-ui" } },
  );
  const chars = [...s.characters].sort((a, b) => Number(b.setUp) - Number(a.setUp) || a.name.localeCompare(b.name));
  for (const c of chars) {
    const meta = [c.rarity ? `${c.rarity}★` : null, c.element, c.weapon].filter(Boolean).join(" · ");
    items.push({
      key: `character:${c.key}`,
      group: "character",
      title: c.name,
      subtitle: meta ? `${meta} · open in the calculator` : "Open in the calculator",
      keywords: [c.key, c.element ?? "", c.weapon ?? ""].filter(Boolean),
      image: c.portrait,
      badge: c.setUp ? (c.sequence != null ? `S${c.sequence}` : "Set up") : undefined,
      run: { kind: "character", key: c.key },
    });
  }
  for (const t of s.teams) {
    items.push({ key: `team:${t.id}`, group: "team", title: t.name || "(unnamed team)", subtitle: t.members.join(" · ") || "No members yet", keywords: t.members, icon: ICON.team, run: { kind: "team", id: t.id } });
  }
  return items;
}

// ── matching ────────────────────────────────────────────────────────────────────────────────

/** 0 (no match) … 1 (exact). Word-prefix and initials beat substrings; a scattered subsequence scores lowest. */
export function fuzzyScore(query: string, text: string): number {
  const q = normalize(query);
  const t = normalize(text);
  if (!q) return 0.01;
  if (!t) return 0;
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.92 - Math.min(0.1, (t.length - q.length) / 200);
  const words = t.split(" ");
  if (words.some((w) => w.startsWith(q))) return 0.82;
  const qWords = q.split(" ").filter(Boolean);
  if (qWords.length > 1 && qWords.every((qw) => words.some((w) => w.startsWith(qw)))) return 0.78;
  const initials = words.map((w) => w[0]).join("");
  if (q.length >= 2 && !q.includes(" ") && initials.startsWith(q)) return 0.7;
  if (t.includes(q)) return 0.6;
  // subsequence: every query character in order; denser = better
  const compactQ = q.replace(/ /g, "");
  let at = -1;
  let first = -1;
  for (const ch of compactQ) {
    at = t.indexOf(ch, at + 1);
    if (at < 0) return 0;
    if (first < 0) first = at;
  }
  const span = at - first + 1;
  return compactQ.length >= 2 ? Math.max(0.05, 0.45 * (compactQ.length / span)) : 0;
}

const GROUP_WEIGHT: Record<PaletteGroup, number> = { page: 0.06, action: 0.05, character: 0.03, team: 0.02, ask: 0 };
const QUESTION = /\?\s*$|^(what|why|how|who|which|should|is|are|can|does|do|when|where|explain|compare)\b/i;

export const looksLikeQuestion = (text: string): boolean => QUESTION.test(text.trim());

export interface RankOptions {
  /** max items per group when there is a query (characters can be many) */
  perGroup?: number;
  /** offer "Ask Claude: <query>" */
  ask?: boolean;
}

/** The items to show for a query, best first. No query: pages, then actions, then set-up characters and teams. */
export function rankPalette(query: string, items: readonly PaletteItem[], options: RankOptions = {}): PaletteItem[] {
  const q = query.trim();
  const perGroup = options.perGroup ?? 6;
  if (!q) {
    const pages = items.filter((i) => i.group === "page");
    const actions = items.filter((i) => i.group === "action");
    const chars = items.filter((i) => i.group === "character" && i.badge).slice(0, 8);
    const teams = items.filter((i) => i.group === "team").slice(0, 5);
    return [...pages, ...actions, ...chars, ...teams];
  }
  const scored = items
    .map((item) => {
      const title = fuzzyScore(q, item.title);
      const sub = item.subtitle ? fuzzyScore(q, item.subtitle) * 0.6 : 0;
      const kw = Math.max(0, ...(item.keywords ?? []).map((k) => fuzzyScore(q, k) * 0.85));
      const best = Math.max(title, sub, kw);
      return { item, best, score: best > 0.04 ? best + GROUP_WEIGHT[item.group] + (item.group === "character" && item.badge ? 0.02 : 0) : 0 };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  // a scattered-letters match is noise next to a real one ("aem" → Aemeath, not "Rover AEro (Male)")
  const strong = scored.length ? scored[0].best : 0;
  const kept = strong >= 0.6 ? scored.filter((s) => s.best >= 0.3) : scored;
  // grouped: groups in the order of their best item, items by score inside a group, `perGroup` at most each
  const order: PaletteGroup[] = [];
  const byGroup = new Map<PaletteGroup, PaletteItem[]>();
  for (const { item } of kept) {
    if (!byGroup.has(item.group)) {
      byGroup.set(item.group, []);
      order.push(item.group);
    }
    const list = byGroup.get(item.group)!;
    if (list.length < perGroup) list.push(item);
  }
  const out: PaletteItem[] = order.flatMap((g) => byGroup.get(g)!);
  if (options.ask !== false) {
    const ask: PaletteItem = { key: "ask", group: "ask", title: `Ask Claude: ${q}`, subtitle: "Answered from your account with the app's engine", icon: ICON.sparkle, run: { kind: "ask", question: q } };
    // a question goes first; otherwise the ask row waits below the strong matches
    if (looksLikeQuestion(q) || strong < 0.6) out.unshift(ask);
    else out.push(ask);
  }
  return out;
}

// ── sources ─────────────────────────────────────────────────────────────────────────────────

/** The highest enabled sequence node of a stored character (rankRoster.ts `sequenceOf`, kept here so the palette
 *  stays out of the engine's import graph). */
export function storedSequence(data: Record<string, any> | null | undefined): number {
  let best = 0;
  for (const [key, value] of Object.entries((data?.resonanceChains ?? {}) as Record<string, any>)) {
    const m = /^(?:SequenceNode|Sequence|S)([1-6])(?![0-9])/.exec(key);
    if (m && value?.isEnabled) best = Math.max(best, Number(m[1]));
  }
  return best;
}

/** Roster entries + the character store → the palette's character rows (set up = a weapon equipped). */
export function characterRowsOf(
  roster: ReadonlyArray<{ key: string; name: string }>,
  meta: ReadonlyArray<{ key: string; rarity?: number; element?: string; weapon?: string }>,
  stored: Record<string, any> | null | undefined,
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  portrait?: (key: string) => string,
): PaletteSources["characters"] {
  const seen = new Set<string>();
  const rows: PaletteSources["characters"] = [];
  for (const r of roster) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    const m = meta.find((x) => x.key === r.key);
    const data = stored?.[r.key];
    const setUp = Boolean(data?.weapon);
    rows.push({
      key: r.key,
      name: r.name,
      rarity: m?.rarity ?? null,
      element: m?.element ?? null,
      weapon: m?.weapon ?? null,
      setUp,
      sequence: setUp ? storedSequence(data) : null,
      portrait: portrait?.(r.key),
    });
  }
  return rows;
}
