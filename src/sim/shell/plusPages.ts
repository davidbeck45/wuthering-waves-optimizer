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
    path: "/echo-plan",
    title: "Echo plan",
    description: "The in-game Echo Management lock / discard grid built from your roster, with what changed since the last patch",
    keywords: ["echo management", "discard", "lock", "plan code", "sonata", "main stat", "auto discard", "keep"],
    icon: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14.5 17l2 2 3.5-4",
  },
];
