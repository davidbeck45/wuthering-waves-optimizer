// Wuthering Tools+ — the one registry of plus pages. The nav's Plus menu and the command palette both read it;
// a new plus page adds one entry here (and its route in main.ts).

export interface PlusPage {
  /** Router path. */
  path: string;
  /** Short label for menus and the palette. */
  title: string;
  /** One line for the palette and tooltips. */
  description: string;
  /** Extra words the palette matches on. */
  keywords: string[];
  /** SVG path data (24×24, stroke) for a menu icon. */
  icon: string;
  /** The Tools+ menu's section this page is listed under (PLUS_GROUPS). */
  group: PlusGroupId;
}

export type PlusGroupId = "account" | "rankings" | "teams" | "gear" | "more";

export interface PlusGroup {
  id: PlusGroupId;
  /** The section's heading in the Tools+ menu. */
  title: string;
  /** SVG path data (24×24, stroke) for the heading's small mark. */
  icon: string;
}

/** The Tools+ menu's sections, in the order it shows them (PlusNavMenu.vue). 18 pages in one column were 837 px tall
 *  and the newest sat at the bottom; five sections of three or four fit beside the rail and on a phone's screen. */
export const PLUS_GROUPS: PlusGroup[] = [
  { id: "account", title: "My account", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0" },
  { id: "rankings", title: "Rankings", icon: "M4 20h16M6 20V10M12 20V4M18 20v-7" },
  { id: "teams", title: "Teams", icon: "M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M16 5.2a3 3 0 010 5.6M18 14.5a6 6 0 013 5.5" },
  { id: "gear", title: "Echoes and weapons", icon: "M12 3l7 4v10l-7 4-7-4V7z" },
  { id: "more", title: "More", icon: "M5 12h.01M12 12h.01M19 12h.01" },
];

/** The pages of one section, in registry order. */
export function plusPagesIn(group: PlusGroupId, pages: PlusPage[] = PLUS_PAGES): PlusPage[] {
  return pages.filter((p) => p.group === group);
}

// In menu order: section by section (PLUS_GROUPS), What's new last.
export const PLUS_PAGES: PlusPage[] = [
  {
    path: "/account",
    title: "My account",
    description: "Your roster at a glance: builds, sequences, teams you can field and what to invest in next",
    keywords: ["dashboard", "roster", "profile", "overview", "invest"],
    icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0",
    group: "account",
  },
  {
    path: "/my-rankings",
    title: "My roster rankings",
    description: "Every character and team you have set up, scored on your real builds",
    keywords: ["rank", "dps", "damage", "roster", "what if", "substats", "weights"],
    icon: "M4 20h16M6 20V10M12 20V4M18 20v-7",
    group: "account",
  },
  {
    path: "/build-history",
    title: "Build history",
    description: "Earlier versions of each character's build: what changed in stats, echoes and damage, and a way back",
    keywords: ["history", "versions", "undo", "restore", "compare", "diff", "before", "snapshot", "backup", "changes"],
    icon: "M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2",
    group: "account",
  },
  {
    path: "/backups",
    title: "Backups",
    description: "Automatic copies of your whole account, kept in this browser: restore one, download it, or share a copy to your own storage",
    keywords: ["backup", "backups", "restore", "export", "save", "copy", "drive", "share", "download", "lost", "recover", "wipe"],
    icon: "M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v5c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5",
    group: "account",
  },
  {
    path: "/rankings",
    title: "Team rankings",
    description: "Riley31415's wuwa_calc team table, at any investment tier or at your account",
    keywords: ["wuwa_calc", "riley", "teams", "tier", "s6r5", "compare"],
    icon: "M3 6h18M3 12h18M3 18h18",
    group: "rankings",
  },
  {
    path: "/tier-list",
    title: "Tier list",
    description: "Riley31415's tier list: every resonator at the best team damage they reach, T0 to T4, at any Team Cost or your account",
    keywords: ["tier list", "tiers", "t0", "best characters", "meta", "who is best", "riley", "wuwa_calc", "main dps", "support", "matrix"],
    icon: "M4 5h4v4H4zM4 15h4v4H4zM11 7h9M11 17h6",
    group: "rankings",
  },
  {
    path: "/roster-value",
    title: "Roster value",
    description: "Riley31415's value page on your roster: what each resonator you lack would add, and what each you own adds, in Neutral Matrix Score",
    keywords: ["roster value", "who to pull", "pull", "value", "matrix", "endstate matrix", "account dpr", "owned", "worth", "riley", "wuwa_calc"],
    icon: "M12 3v18M7 8h7.5a2.5 2.5 0 010 5H9.5a2.5 2.5 0 000 5H17",
    group: "rankings",
  },
  {
    path: "/build-team",
    title: "Build my team",
    description: "Re-gear a team, or several at once (Whole account), from your echo inventory: no echo used twice",
    keywords: ["build", "team", "echoes", "inventory", "optimizer", "regear", "allocate", "er", "energy", "wuwa_calc", "whole account", "account plan", "all teams", "roster"],
    icon: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
    group: "teams",
  },
  {
    path: "/rotation",
    title: "Rotation cue cards",
    description: "Any wuwa_calc team's frame-timed rotation at your account: one line per swap, a play-along timer, and a fight timeline of field time, buff uptime and kill times",
    keywords: ["rotation", "cue", "combo", "play along", "practice", "timeline", "uptime", "buffs", "kill time", "wuwa_calc", "riley", "discord"],
    icon: "M12 22a10 10 0 100-20 10 10 0 000 20zm0-15v5l3 2",
    group: "teams",
  },
  {
    path: "/energy",
    title: "Energy check",
    description: "How much Energy Regen each member of your teams needs, measured in wuwa_calc at your account, against your builds",
    keywords: ["energy", "er", "energy regen", "recharge", "liberation", "requirement", "crit cap", "overcap", "breakpoint"],
    icon: "M13 2 4.5 13.5H11L10 22l8.5-11.5H12z",
    group: "teams",
  },
  {
    path: "/endgame",
    title: "Tower of Adversity",
    description: "ToA clear check: every Hazard Zone floor's HP and effects against your teams, with kill time, crests and a Vigor-legal plan for all 12 stages",
    keywords: ["tower of adversity", "toa", "endgame", "hazard zone", "crests", "stars", "vigor", "floors", "clear time", "abyss"],
    icon: "M6 21V8l6-5 6 5v13M10 21v-5h4v5M9 11h6",
    group: "teams",
  },
  {
    path: "/echo-lab",
    title: "Echo Lab",
    description: "Keep, tune, re-roll or feed: every echo judged by the damage engine on your builds",
    keywords: ["echo", "feed", "tune", "reroll", "transducer", "benchmark", "keep", "upgrade", "substats", "tuner", "tuners", "tuner plan", "budget", "echo exp", "roll", "percentile", "farm", "farm next", "main stat", "set lab", "best set", "which set", "sonata", "5-piece", "set bonus"],
    icon: "M9 3h6M10 3v6.5L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 9.5V3M7.5 15h9",
    group: "gear",
  },
  {
    path: "/echo-plan",
    title: "Echo plan",
    description: "The in-game Echo Management lock / discard grid built from your roster, with what changed since the last patch",
    keywords: ["echo management", "discard", "lock", "plan code", "sonata", "main stat", "auto discard", "keep"],
    icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14.5 17l2 2 3.5-4",
    group: "gear",
  },
  {
    path: "/weapons",
    title: "Weapon value",
    description: "Is that signature worth it? Every signature, refinement and selector pick scored on your roster and teams",
    keywords: ["weapon", "signature", "refinement", "r5", "selector", "standard", "moonlit path", "4 star", "worth it"],
    icon: "M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2",
    group: "gear",
  },
  {
    path: "/kit",
    title: "Resonator briefs",
    description: "How each resonator is played, their builds, which sequences change the rotation, best teams and what each step of investment is worth",
    // none of the bare words another page answers to ("build", "rotation", "weapon"): the palette lists few pages per word
    keywords: ["kit", "brief", "guide", "how to play", "playstyle", "resonator", "best teams", "loadout", "investment ladder", "what sequences change"],
    icon: "M5 4h10l4 4v12H5zM15 4v4h4M8 12h8M8 16h5",
    group: "more",
  },
  {
    path: "/today",
    title: "Today",
    description: "Resets on your server's clock, when your Waveplates are full, events ending soon and your weekly caps",
    keywords: ["daily", "weekly", "reset", "waveplates", "stamina", "events", "timer", "countdown", "double drop", "tower of adversity", "whimpering wastes", "checklist"],
    icon: "M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l2.5 2.5M9 2h6",
    group: "more",
  },
  {
    path: "/share",
    title: "Share & import builds",
    description: "Share a build or team as a card that carries the build inside the PNG, or as a link, and load one back exactly",
    keywords: ["share", "card", "import", "link", "png", "showcase", "export", "transfer", "phone", "tacet lab"],
    icon: "M12 3v12m0-12L8 7m4-4l4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7",
    group: "more",
  },
  {
    path: "/whats-new",
    title: "What's new",
    description: "What was added to Tools+ and where to find it, and which of your damage figures moved since last time and why",
    keywords: ["new", "news", "changelog", "changes", "features", "release", "update", "what changed", "moved", "numbers", "why did my damage change", "since last time"],
    icon: "M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z",
    group: "more",
  },
];
