// Wuthering Tools+ — the command palette's commands: what you can do with a character or a team — share it, its weapon
// value, its substats, its rotation cue card, build it from your echoes, its energy check — for every set-up character
// and saved team (listed once you type) and, first under "On this page", for the one the page shows (the calculator's
// character, the team open in the Teams editor, the `?focus=` / `?team=` / `#chars=` a plus page was opened with).
// Pure. Only CommandPalette.vue (a lazy chunk) imports it, through `paletteWithCommands`: paletteItems.ts sits in the
// entry chunk (PlusShell reads its page titles), and these strings and the /rotation hash code would add ~9 kB there.
import { parseRotationHash, rotationPath } from "../rotation/hash";
import { paletteItems, type PaletteItem, type PaletteSources } from "./paletteItems";
import { isGeneratedName, teamTierLine, teamTitle } from "../display/teamName";

/** Where the player is (CommandPalette reads the route, the calculator's character and the Teams editor's team). */
export interface PaletteContext {
  path: string;
  query: Record<string, string | undefined>;
  hash: string;
  /** the calculator's active character */
  activeCharacter: string | null;
  /** the team open in the Teams editor (only read on /teams) */
  openTeamId: string | null;
}

export interface TeamTarget {
  /** a saved team's id; null for a composition no saved team has */
  id: string | null;
  name: string;
  members: string[];
}

export interface ContextTarget {
  character: string | null;
  team: TeamTarget | null;
}

const ICON = {
  share: "M12 3v12m0-12L8 7m4-4l4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7",
  weapon: "M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2",
  substats: "M4 20h16M6 20V10M12 20V4M18 20v-7",
  rotation: "M12 22a10 10 0 100-20 10 10 0 000 20zm0-15v5l3 2",
  build: "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
  energy: "M13 2 4.5 13.5H11L10 22l8.5-11.5H12z",
  team: "M3 6h18M3 12h18M3 18h18",
  toa: "M6 21V8l6-5 6 5v13M10 21v-5h4v5M9 11h6",
  selector: "M20 12V8H4v4m16 0v8H4v-8m16 0H4m8-4v12M12 8c-1.5-3-5-3-5-1s3 1 5 1zm0 0c1.5-3 5-3 5-1s-3 1-5 1z",
  buffs: "M12 3v18M3 12h18M7 7l10 10M17 7L7 17",
  farm: "M12 21c-4-3-7-6.5-7-10.5A7 7 0 0112 3a7 7 0 017 7.5c0 4-3 7.5-7 10.5zM12 13a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z",
  palette: "M12 21a9 9 0 110-18c4.97 0 9 3.6 9 8a4 4 0 01-4 4h-1.8a1.7 1.7 0 00-1.2 2.9A1.8 1.8 0 0112 21zM7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01M17 11h.01",
};

const sameMembers = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().join("+") === [...b].sort().join("+");

/** The character / team the page is about, from the route and the stores (nothing when the page names none). */
export function contextTargetOf(ctx: PaletteContext | undefined, s: Pick<PaletteSources, "characters" | "teams">): ContextTarget {
  const none: ContextTarget = { character: null, team: null };
  if (!ctx) return none;
  const setUp = (key: string | null | undefined): string | null => (key && s.characters.some((c) => c.key === key && c.setUp) ? key : null);
  const savedTeam = (id: string | null | undefined): TeamTarget | null => {
    const t = id ? s.teams.find((x) => x.id === id) : null;
    return t ? { id: t.id, name: t.name, members: t.memberKeys ?? [] } : null;
  };
  const composition = (members: string[]): TeamTarget | null => {
    if (members.length !== 3) return null;
    const t = s.teams.find((x) => x.memberKeys && sameMembers(x.memberKeys, members));
    return t ? { id: t.id, name: t.name, members: t.memberKeys ?? members } : { id: null, name: "", members };
  };
  const q = (k: string): string | null => (typeof ctx.query[k] === "string" && ctx.query[k] ? (ctx.query[k] as string) : null);
  switch (ctx.path) {
    case "/":
      return { character: setUp(ctx.activeCharacter), team: null };
    case "/weapons":
    case "/my-rankings":
      return { character: setUp(q("focus")), team: null };
    case "/build-history":
      // the page writes its pick to ?char= (BuildHistoryView); before that it opens on the calculator's character
      return { character: setUp(q("char") ?? ctx.activeCharacter), team: null };
    case "/teams":
      return { character: null, team: savedTeam(ctx.openTeamId) };
    case "/energy":
      return { character: null, team: savedTeam(q("team")) };
    case "/build-team":
      return { character: null, team: savedTeam(q("team")) ?? composition((q("members") ?? "").split(",").filter(Boolean)) };
    case "/rotation": {
      // a `#chars=` composition only: a `#team=` key or code names one of Riley's teams, read by his list in the worker
      const target = parseRotationHash(ctx.hash).target;
      return { character: null, team: target?.kind === "chars" ? composition(target.chars) : null };
    }
    default:
      return none;
  }
}

type Group = "context" | "command";
/** a character key → its display name */
// eslint-disable-next-line no-unused-vars -- the parameter of a function type
type NameOf = (key: string) => string;
interface Built extends PaletteItem {
  /** the path this command opens (left out on the page it would reopen) */
  opens?: string;
}

function characterCommands(key: string, name: string, group: Group): Built[] {
  const k = `${group}:character:${key}`;
  const weapons = `/weapons?focus=${encodeURIComponent(key)}`;
  const substats = `/my-rankings?focus=${encodeURIComponent(key)}&tab=substats`;
  return [
    { key: `${k}:share`, group, order: 0, title: `Share ${name}'s build`, subtitle: "A card or a link that carries the whole build", keywords: ["share", "card", "link", "export", "png", name, key], icon: ICON.share, run: { kind: "share", source: { kind: "build", charId: key } } },
    { key: `${k}:weapons`, group, order: 0, title: `Weapon value: ${name}`, subtitle: "Is the signature worth it? Every refinement and alternative, own and team damage", keywords: ["weapon", "signature", "refinement", "r5", "worth", name, key], icon: ICON.weapon, opens: weapons, run: { kind: "route", path: weapons } },
    { key: `${k}:substats`, group, order: 0, title: `Substats & what-if: ${name}`, subtitle: "What one more roll of each substat is worth; another sequence or weapon", keywords: ["substats", "rolls", "weights", "what if", "sequence", name, key], icon: ICON.substats, opens: substats, run: { kind: "route", path: substats } },
  ];
}

function teamCommands(t: TeamTarget, displayName: NameOf, group: Group): Built[] {
  if (t.members.length !== 3) return [];
  // a wuwa_calc name reads as the team's one name ("Aemeath · Mornye + Lynae", teamTitle); else the members
  const generated = isGeneratedName(t.name);
  const label = generated ? teamTitle(t.name) : t.members.map(displayName).join(" + ");
  // on the team's own page: "… for this team", the members first in the line below (a phone cuts the end off);
  // in the full list: the members in the title, then below it a name the player typed or a wuwa_calc name's tier before
  // what it does (two tiers of the same three read the same title, and that same phone cut the tier off a long line)
  const here = group === "context";
  const title = (verb: string): string => (here ? `${verb} for this team` : `${verb}: ${label}`);
  const tail = generated ? teamTierLine(t.name) : t.name;
  const sub = (what: string): string => (here ? `${label} · ${what}` : tail ? `${tail} · ${what}` : what);
  const k = `${group}:team:${t.id ?? t.members.join("+")}`;
  const words = [t.name, label, ...t.members, ...t.members.map(displayName)].filter(Boolean);
  const rotation = rotationPath({ kind: "chars", chars: t.members });
  const build = t.id ? `/build-team?team=${encodeURIComponent(t.id)}` : `/build-team?members=${t.members.map(encodeURIComponent).join(",")}`;
  const out: Built[] = [
    { key: `${k}:rotation`, group, order: 1, title: title("Rotation cue card"), subtitle: sub("wuwa_calc's frame-timed rotation at your account"), keywords: ["rotation", "cue", "combo", "play along", "timeline", ...words], icon: ICON.rotation, opens: "/rotation", run: { kind: "route", path: rotation } },
    { key: `${k}:build`, group, order: 1, title: title("Build from my echoes"), subtitle: sub("new builds from your inventory, no echo used twice"), keywords: ["build", "regear", "echoes", "optimizer", "allocate", ...words], icon: ICON.build, opens: "/build-team", run: { kind: "route", path: build } },
  ];
  if (t.id) {
    const energy = `/energy?team=${encodeURIComponent(t.id)}`;
    out.push(
      { key: `${k}:energy`, group, order: 1, title: title("Energy check"), subtitle: sub("each member's Energy Regen against what the loop needs"), keywords: ["energy", "er", "energy regen", "recharge", "liberation", ...words], icon: ICON.energy, opens: "/energy", run: { kind: "route", path: energy } },
      { key: `${k}:share`, group, order: 1, title: here ? "Share this team" : `Share team: ${label}`, subtitle: sub("a card or a link with all three builds"), keywords: ["share", "card", "link", "export", ...words], icon: ICON.share, run: { kind: "share", source: { kind: "team", teamId: t.id } } },
    );
    if (here) out.push({ key: `${k}:open`, group, order: 1, title: "Open this team in Team rotations", subtitle: sub("its actions, damage and summary"), keywords: ["teams", "editor", "open", ...words], icon: ICON.team, opens: "/teams", run: { kind: "team", id: t.id } });
  }
  return out;
}

/** "On this page" commands, then every character's and team's (query-only), then the plus actions without a page row. */
export function commandItems(s: PaletteSources, displayName: NameOf): PaletteItem[] {
  const target = contextTargetOf(s.context, s);
  const here = s.context?.path ?? "";
  const notHere = (b: Built): boolean => !b.opens || b.opens.split(/[?#]/)[0] !== here;
  const context: Built[] = [];
  if (target.character) {
    const c = s.characters.find((x) => x.key === target.character)!;
    context.push(...characterCommands(c.key, c.name, "context").filter(notHere));
    context.push({ key: `context:character:${c.key}:ask`, group: "context", order: 0, title: `Ask Claude how to raise ${c.name}'s damage`, subtitle: "Answered from your account with the app's engine", keywords: ["claude", "ai", "ask", "improve", "help"], icon: ICON.sparkle, run: { kind: "ask", question: `How can I raise ${c.name}'s damage on my account? What should I change first?` } });
  }
  if (target.team) context.push(...teamCommands(target.team, displayName, "context").filter(notHere));

  const seen = new Set(context.map((c) => JSON.stringify(c.run)));
  const fresh = (b: Built): boolean => !seen.has(JSON.stringify(b.run));
  const commands: Built[] = [];
  for (const c of s.characters) if (c.setUp) commands.push(...characterCommands(c.key, c.name, "command").filter(fresh));
  for (const t of s.teams) if (t.memberKeys?.length === 3) commands.push(...teamCommands({ id: t.id, name: t.name, members: t.memberKeys }, displayName, "command").filter(fresh));
  commands.push(
    { key: "command:toa", group: "command", order: 2, title: "ToA clear check for my teams", subtitle: "This Tower of Adversity season's floors against the teams you can field: kill time and crests", keywords: ["toa", "tower of adversity", "clear check", "crests", "hazard zone", "endgame", "abyss"], icon: ICON.toa, run: { kind: "route", path: "/endgame" } },
    { key: "command:farm", group: "command", order: 2, title: "Which echo should I farm next?", subtitle: "Every slot of your builds: the set, cost and main stat to farm, what a new +25 echo adds and its odds", keywords: ["farm", "farm next", "what to farm", "grind", "tacet field", "main stat", "echo", "sonata", "upgrade"], icon: ICON.farm, run: { kind: "route", path: "/echo-lab?tab=farm" } },
    { key: "command:selector", group: "command", order: 2, title: "Which selector pick is best for me?", subtitle: "Rank a standard 5★ or Moonlit Path selector's options on your account", keywords: ["selector", "standard", "moonlit path", "pick", "choose", "box", "resonator", "weapon"], icon: ICON.selector, run: { kind: "route", path: "/weapons?tab=selector" } },
  );
  if (s.autoTeamBuffs !== undefined) {
    commands.push({
      key: "command:team-buffs",
      group: "command",
      order: 2,
      title: s.autoTeamBuffs ? "Turn team-aware buffs off" : "Turn team-aware buffs on",
      subtitle: s.autoTeamBuffs ? "Use each character's own Team Buffs panel, as upstream does" : "Team buffs from the team's real members and their gear (the default)",
      keywords: ["team buffs", "auto", "teammates", "buffs", "panel", "switch"],
      icon: ICON.buffs,
      run: { kind: "action", action: "toggle-team-buffs" },
    });
  }
  // the context rows show with an empty query; the rest wait for a query (a character or team each adds several)
  const strip = (b: Built): PaletteItem => {
    const item: Built = { ...b };
    delete item.opens;
    return item;
  };
  return [...context, ...commands.map((c) => ({ ...c, queryOnly: true }))].map(strip);
}

/** "Gruvbox" from "gruvbox": a theme's name as a title (the list itself holds DaisyUI's lowercase ids). */
export const themeTitle = (name: string): string => (name ? name[0]!.toUpperCase() + name.slice(1) : name);

/** One "Themes" row per theme, in the list's own order (useTheme's `THEME_OPTIONS`, handed in), the one in use marked
 *  "Now". Found by typing ("gruvbox", "nord", "theme", "light"); the empty palette keeps its one light / dark toggle. */
export function themeItems(s: Pick<PaletteSources, "themes" | "theme">): PaletteItem[] {
  return (s.themes ?? []).map((t, i) => {
    const current = t.name === s.theme;
    const look = t.style === "light" ? "light background, dark text" : "dark background, light text";
    return {
      key: `theme:${t.name}`,
      group: "theme",
      order: i,
      title: `${themeTitle(t.name)} theme`,
      subtitle: current ? `In use now · ${look}` : `Switch the app's colours · ${look}`,
      keywords: [t.name, "theme", "colours", "colors", "appearance", t.style],
      icon: ICON.palette,
      badge: current ? "Now" : undefined,
      queryOnly: true,
      run: { kind: "theme", theme: t.name },
    };
  });
}

/** The palette's items with the commands: pages, actions, characters, teams (paletteItems.ts), then "On this page",
 *  the per-character / per-team commands and one row per theme. Display names come from the character rows. */
export function paletteWithCommands(s: PaletteSources): PaletteItem[] {
  const displayName = (key: string): string => s.characters.find((c) => c.key === key)?.name ?? key;
  return [...paletteItems(s).map((item) => savedTeamRow(item, s)), ...commandItems(s, displayName), ...themeItems(s)];
}

/** A Saved teams row titled with the team's one name (`teamTitle`: "Aemeath · Mornye + Lynae") and, for a wuwa_calc
 *  name, its investment tier below; a typed name stays over its members. Here, not in paletteItems.ts: that module is
 *  in the entry chunk, and the name parser would add ~20 kB to first paint. */
function savedTeamRow(item: PaletteItem, s: PaletteSources): PaletteItem {
  if (item.group !== "team" || item.run?.kind !== "team") return item;
  const id = item.run.id;
  const t = s.teams.find((x) => x.id === id);
  if (!t) return item;
  const tier = teamTierLine(t.name, true);
  return { ...item, title: teamTitle(t.name) || item.title, subtitle: tier ?? item.subtitle };
}
