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
}

export const PLUS_PAGES: PlusPage[] = [
  {
    path: "/account",
    title: "My account",
    description: "Your roster at a glance: builds, sequences, teams you can field and what to invest in next",
    keywords: ["dashboard", "roster", "profile", "overview", "invest"],
    icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8a7 7 0 0114 0",
  },
  {
    path: "/my-rankings",
    title: "My roster rankings",
    description: "Every character and team you have set up, scored on your real builds",
    keywords: ["rank", "dps", "damage", "roster", "what if", "substats", "weights"],
    icon: "M4 20h16M6 20V10M12 20V4M18 20v-7",
  },
  {
    path: "/rankings",
    title: "Team rankings",
    description: "Riley31415's wuwa_calc team table, at any investment tier or at your account",
    keywords: ["wuwa_calc", "riley", "teams", "tier", "s6r5", "compare"],
    icon: "M3 6h18M3 12h18M3 18h18",
  },
  {
    path: "/echo-lab",
    title: "Echo Lab",
    description: "Keep, tune, re-roll or feed: every echo judged by the damage engine on your builds",
    keywords: ["echo", "feed", "tune", "reroll", "transducer", "benchmark", "keep", "upgrade", "substats"],
    icon: "M9 3h6M10 3v6.5L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 9.5V3M7.5 15h9",
  },
  {
    path: "/energy",
    title: "Energy check",
    description: "How much Energy Regen each member of your teams needs, measured in wuwa_calc at your account, against your builds",
    keywords: ["energy", "er", "energy regen", "recharge", "liberation", "requirement", "crit cap", "overcap", "breakpoint"],
    icon: "M13 2 4.5 13.5H11L10 22l8.5-11.5H12z",
  },
  {
    path: "/echo-plan",
    title: "Echo plan",
    description: "The in-game Echo Management lock / discard grid built from your roster, with what changed since the last patch",
    keywords: ["echo management", "discard", "lock", "plan code", "sonata", "main stat", "auto discard", "keep"],
    icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14.5 17l2 2 3.5-4",
  },
  {
    path: "/share",
    title: "Share & import builds",
    description: "Share a build or team as a card that carries the build inside the PNG, or as a link, and load one back exactly",
    keywords: ["share", "card", "import", "link", "png", "showcase", "export", "transfer", "phone", "tacet lab"],
    icon: "M12 3v12m0-12L8 7m4-4l4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7",
  },
  {
    path: "/endgame",
    title: "Tower of Adversity",
    description: "ToA clear check: every Hazard Zone floor's HP and effects against your teams, with kill time, crests and a Vigor-legal plan for all 12 stages",
    keywords: ["tower of adversity", "toa", "endgame", "hazard zone", "crests", "stars", "vigor", "floors", "clear time", "abyss"],
    icon: "M6 21V8l6-5 6 5v13M10 21v-5h4v5M9 11h6",
  },
  {
    path: "/rotation",
    title: "Rotation cue cards",
    description: "Any wuwa_calc team's frame-timed rotation at your account: one line per swap, a play-along timer, and a fight timeline of field time, buff uptime and kill times",
    keywords: ["rotation", "cue", "combo", "play along", "practice", "timeline", "uptime", "buffs", "kill time", "wuwa_calc", "riley", "discord"],
    icon: "M12 22a10 10 0 100-20 10 10 0 000 20zm0-15v5l3 2",
  },
  {
    path: "/today",
    title: "Today",
    description: "Resets on your server's clock, when your Waveplates are full, events ending soon and your weekly caps",
    keywords: ["daily", "weekly", "reset", "waveplates", "stamina", "events", "timer", "countdown", "double drop", "tower of adversity", "whimpering wastes", "checklist"],
    icon: "M12 21a8 8 0 100-16 8 8 0 000 16zM12 9v4l2.5 2.5M9 2h6",
  },
];
