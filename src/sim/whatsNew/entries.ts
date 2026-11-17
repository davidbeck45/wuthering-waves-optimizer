// Wuthering Tools+ — "What's new on Tools+" (/whats-new): the plus features, hand-kept, newest first.
//
// One entry per thing a player can use. Written the way you would tell a friend, not as a commit message:
//   id     stable and unique, never reused or renamed: the unseen marker stores it (whatsNew.ts)
//   date   the day it reached the site (YYYY-MM-DD). Entries of one day form one group on the page
//   title  what it is, in plain words
//   text   one or two sentences: what it does for the player
//   where  the taps that reach it on a phone, as he would tap them, joined with " › "
//   link   an in-app address the Open button goes to. It must be a route of this app (whatsNew.test.ts reads main.ts
//          and fails on one that is not). `{character}` stands for a character of the account (the one the calculator
//          shows, else the first set up); with no account the link falls back to its path alone
//   tag    optional: page (a new page), tool (a new tool on a page), better, faster, fix, data (game data)
//
// The calculator's own changes are Ryan's and live on his /updates page (src/content/updates.ts): they are linked from
// the page in one line, never copied here.

export type WhatsNewTag = "page" | "tool" | "better" | "faster" | "fix" | "data";

export interface WhatsNewEntry {
  id: string;
  date: string;
  title: string;
  text: string;
  where: string;
  link: string;
  tag?: WhatsNewTag;
}

export const TAG_LABELS: Record<WhatsNewTag, string> = {
  page: "New page",
  tool: "New tool",
  better: "Improved",
  faster: "Faster",
  fix: "Fix",
  data: "Game data",
};

export const WHATS_NEW: readonly WhatsNewEntry[] = [
  // ==== ADD NEW ENTRIES HERE, newest first (one block per release day, format in the header above) ====

  // ---- on the site since 2026-11-10
  {
    id: "whole-account",
    date: "2026-11-10",
    title: "Whole account: gear several teams at once",
    text: "Gears several teams from one echo inventory, so no echo is worn twice. You put the teams in order and say how much each matters; it saves the builds, pins them in your teams and keeps an Undo.",
    where: "Tools+ menu › Build my team › Whole account",
    link: "/build-team?mode=account",
    tag: "tool",
  },
  {
    id: "inventory-verdicts",
    date: "2026-11-10",
    title: "Keep, Spare or Feed on every echo",
    text: "Each echo in your inventory shows a Keep, Spare or Feed chip and how lucky its roll is. Sort by best rolls or by feed first, or show only the feed candidates.",
    where: "Inventory › Echoes › Tools+ Echo Lab verdicts, under Search",
    link: "/inventory",
    tag: "tool",
  },
  {
    id: "cost-to-max",
    date: "2026-11-10",
    title: "Cost to max",
    text: "What it takes to raise a character to level 90, every Forte skill to 10 and the weapon to its top level: Shell Credits, EXP items and each material, counted from the levels you saved.",
    where: "Tools+ menu › My account › tap a character › Cost to max",
    link: "/account?focus={character}&section=cost",
    tag: "tool",
  },
  {
    id: "with-what-you-own",
    date: "2026-11-10",
    title: "With what you own",
    text: "What each character can gain today without farming: better echoes already in your inventory, Tuner rolls on unfinished echoes, and Energy Regen they are short of.",
    where: "Tools+ menu › My account › What to invest in next › Check my echoes",
    link: "/account",
    tag: "tool",
  },
  {
    id: "farm-next",
    date: "2026-11-10",
    title: "Farm next",
    text: "For every echo slot of a five-echo build: the set, cost and main stat to farm, what a fresh +25 echo should add, and the odds it beats the one you wear.",
    where: "Tools+ menu › Echo Lab › Farm next",
    link: "/echo-lab?tab=farm",
    tag: "tool",
  },
  {
    id: "set-lab",
    date: "2026-11-10",
    title: "Set lab",
    text: "Tries every Sonata set layout the game allows on the five echoes a character wears, and shows their own and their team's damage against today's layout.",
    where: "Tools+ menu › Echo Lab › Set lab",
    link: "/echo-lab?tab=sets",
    tag: "tool",
  },
  {
    id: "why-this-number",
    date: "2026-11-10",
    title: "Why this number",
    text: "Opens up one character's damage: the rotation by attack and skill type, one hit as the factors of the damage formula, and what moves the number most.",
    where: "Tools+ menu › My roster rankings › open a character's row › Why this number",
    link: "/my-rankings",
    tag: "tool",
  },
  {
    id: "crit-luck",
    date: "2026-11-10",
    title: "Crit luck",
    text: "A damage figure is an average, and a real run lands above or below it. Tower of Adversity now shows each team's chance to clear a floor and earn each crest, and a character's drawer shows the range a run is likely to land in.",
    where: "Tools+ menu › Tower of Adversity, once the check has run",
    link: "/endgame",
    tag: "tool",
  },
  {
    id: "saved-results",
    date: "2026-11-10",
    title: "Heavy pages open at once",
    text: "My account, My roster rankings, Echo Lab and Weapon value keep their last result in this browser. A new tab shows it in about a second, with a note saying when it was saved, instead of scoring for many seconds.",
    where: "Nothing to press. More › Settings › Preferences › Saved results clears them",
    link: "/settings?section=preferences",
    tag: "faster",
  },
  {
    id: "faster-optimizer-rankings",
    date: "2026-11-10",
    title: "Faster optimizer and Team rankings",
    text: "The echo optimizer finishes about 2.8 times sooner with the same top five results. Team rankings shows its first teams in about 4 seconds, where it took 11 to 14.",
    where: "Calculator › Optimizer, and Tools+ menu › Team rankings",
    link: "/rankings",
    tag: "faster",
  },
  {
    id: "toa-season-42",
    date: "2026-11-10",
    title: "Tower of Adversity Season 42",
    text: "The season that runs from 9 November to 7 December is in: its floors, enemies, resistances, floor effects and crest goals.",
    where: "Tools+ menu › Tower of Adversity",
    link: "/endgame",
    tag: "data",
  },
  {
    id: "pinned-builds-everywhere",
    date: "2026-11-10",
    title: "One team, one number on every page",
    text: "Energy check, Tower of Adversity and Rotation cue cards now score a saved team on the builds that team pins, as the Teams page does. They used to read each member's active build, so the same team could show a different figure.",
    where: "Tools+ menu › Energy check, Tower of Adversity or Rotation cue cards",
    link: "/energy",
    tag: "fix",
  },
  {
    id: "rover-male-rotations",
    date: "2026-11-10",
    title: "A male Rover gets his rotations",
    text: "A male Rover now gets the same stock rotations and teams as the female form. He was scored on fewer rotations before, so his best figure read too low.",
    where: "Tools+ menu › My roster rankings",
    link: "/my-rankings",
    tag: "fix",
  },
  {
    id: "delete-takes-everything",
    date: "2026-11-10",
    title: "Delete your data takes all of it",
    text: "Delete your data now also removes your teams, Build history, every Undo and the saved checks, so nothing of a deleted account is left behind. Your settings, Today's checklist and your Convene pull history stay.",
    where: "More › Settings › Your Data › Danger Zone › Delete your data",
    link: "/settings?section=danger-zone",
    tag: "fix",
  },

  // ---- on the site since 2026-11-02
  {
    id: "wavescan-new-echoes",
    date: "2026-11-02",
    title: "Add only the new echoes from a WaveScan file",
    text: "Compares a scan with your inventory and shows what is new, what you already have and what only the inventory has. It then adds only the new echoes, unequipped. Nothing is removed.",
    where: "More › Settings › Your Data › Wavescan, then upload or paste the file",
    link: "/settings?section=wavescan",
    tag: "tool",
  },
  {
    id: "tuner-plan",
    date: "2026-11-02",
    title: "Tuner plan",
    text: "Type in how many Tuners and how much Echo EXP you have. It lists the unfinished echoes worth tuning, most damage per Tuner first, and which slots to farm after that.",
    where: "Tools+ menu › Echo Lab › Tuner plan",
    link: "/echo-lab?tab=plan",
    tag: "tool",
  },
  {
    id: "roll-quality",
    date: "2026-11-02",
    title: "How good is this roll",
    text: "Rates an echo's rolls against every echo of its kind it could have been, from Excellent to Poor. For an unfinished echo it shows the lines to hope for.",
    where: "Tools+ menu › Echo Lab › Verdicts › tap an echo",
    link: "/echo-lab",
    tag: "tool",
  },
  {
    id: "screenshots-without-filter",
    date: "2026-11-02",
    title: "Echo screenshots without the Sonata filter",
    text: "The screenshot importer reads an echo's set from the small icon next to +25, so you no longer have to filter by Sonata before each batch. A card turns amber when the icon is unsure.",
    where: "Inventory › Import echoes › Phone screenshots (batch)",
    link: "/inventory",
    tag: "better",
  },
  {
    id: "build-history",
    date: "2026-11-02",
    title: "Build history",
    text: "Keeps earlier versions of each character's build: saved by hand, and on its own before Build my team, a restore or a Settings import changes one. Compare any two in plain words and bring one back.",
    where: "Tools+ menu › Build history",
    link: "/build-history",
    tag: "page",
  },
  {
    id: "teams-editor-on-a-phone",
    date: "2026-11-02",
    title: "The Teams editor fits a phone",
    text: "The header that stays on screen while you edit a team went from 270 to 87 pixels tall, and each member's stats have captions. A synced team links to its cue card, timeline, energy check and Tower check.",
    where: "Teams › open a team",
    link: "/teams",
    tag: "better",
  },
  {
    id: "sync-my-teams-undo",
    date: "2026-11-02",
    title: "Sync my teams asks first and can be undone",
    text: "Sync my teams says what it is about to change before it changes it, reports the result in one line and keeps an Undo.",
    where: "Tools+ menu › Team rankings › My account › Sync my teams",
    link: "/rankings",
    tag: "better",
  },

  // ---- on the site since 2026-10-27
  {
    id: "my-account",
    date: "2026-10-27",
    title: "My account",
    text: "Your roster at a glance: builds, sequences, the teams you can field and what to invest in next, all scored on your real builds.",
    where: "Tools+ menu › My account",
    link: "/account",
    tag: "page",
  },
  {
    id: "echo-lab",
    date: "2026-10-27",
    title: "Echo Lab",
    text: "Keep, tune, re-roll or feed: every echo in your inventory judged by the damage engine on your own builds.",
    where: "Tools+ menu › Echo Lab",
    link: "/echo-lab",
    tag: "page",
  },
  {
    id: "build-my-team",
    date: "2026-10-27",
    title: "Build my team",
    text: "Re-gears a team from the echoes in your inventory, with no echo used twice, and shows the damage before and after.",
    where: "Tools+ menu › Build my team",
    link: "/build-team",
    tag: "page",
  },
  {
    id: "toa-clear-check",
    date: "2026-10-27",
    title: "Tower of Adversity clear check",
    text: "Every Hazard Zone floor's HP and effects against your teams: the kill time, the crests you would earn, and a plan for all 12 stages that respects Vigor.",
    where: "Tools+ menu › Tower of Adversity",
    link: "/endgame",
    tag: "page",
  },
  {
    id: "energy-check",
    date: "2026-10-27",
    title: "Energy check",
    text: "How much Energy Regen each member of your teams needs to have their Liberation ready on time, against what their build has.",
    where: "Tools+ menu › Energy check",
    link: "/energy",
    tag: "page",
  },
  {
    id: "rotation-cue-cards",
    date: "2026-10-27",
    title: "Rotation cue cards",
    text: "A team's rotation as one line per swap, with a play-along timer and a timeline of who is on field and which buffs are up.",
    where: "Tools+ menu › Rotation cue cards",
    link: "/rotation",
    tag: "page",
  },
  {
    id: "weapon-value",
    date: "2026-10-27",
    title: "Weapon value",
    text: "Is that signature weapon worth it? Every signature, refinement and selector pick scored on your roster and your teams.",
    where: "Tools+ menu › Weapon value",
    link: "/weapons",
    tag: "page",
  },
  {
    id: "today",
    date: "2026-10-27",
    title: "Today",
    text: "Resets on your server's clock, when your Waveplates are full, the events that end soon and your weekly caps.",
    where: "Tools+ menu › Today",
    link: "/today",
    tag: "page",
  },
  {
    id: "echo-plan",
    date: "2026-10-27",
    title: "Echo plan",
    text: "The game's Echo Management lock and discard grid, filled in from your roster, so you know which echoes to lock and which to let go.",
    where: "Tools+ menu › Echo plan",
    link: "/echo-plan",
    tag: "page",
  },
  {
    id: "share-cards",
    date: "2026-10-27",
    title: "Share a build as a picture or a link",
    text: "A build or a team as a card that carries the build inside the picture, or as a short link, and a way to load one back exactly as it was.",
    where: "Tools+ menu › Share & import builds",
    link: "/share",
    tag: "page",
  },
  {
    id: "convene-tracker",
    date: "2026-10-27",
    title: "Convene history, pity and banners",
    text: "Your pull history with pity counters, the banner calendar, and a pull advisor that says what a character or weapon would add to your teams.",
    where: "Convene, in the bottom bar",
    link: "/convene",
    tag: "tool",
  },
  {
    id: "team-rankings-on-a-phone",
    date: "2026-10-27",
    title: "Team rankings as cards on a phone",
    text: "On a phone the team table reads as cards, one team each, instead of a wide table you scroll sideways.",
    where: "Tools+ menu › Team rankings",
    link: "/rankings",
    tag: "better",
  },
];
