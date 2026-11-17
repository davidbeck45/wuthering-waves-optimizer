// Wuthering Tools+ — the "On your account" block of a resonator brief (/kit/<name>): the brief read against the
// player's own account. Pure: the page hands in what the Account State says about the character, who the account
// owns, and the roster ranking when this browser has one cached (it is never scored here).
//
// Two engines, never mixed in one figure (display/numberBasis.ts): the team named from Riley's table carries his
// figure on his standard builds; the team from the roster ranking carries this app's figure on the account's builds.
import { accountKeyOf, appKeyOf } from "../rankings/rileyNames";
import { changeScope, costLabel, fieldableTeams, loopChanges, mainOf, nearestCost, type InApp, type Kit, type KitIndexEntry, type KitMember, type KitsFile, type KitTeam, type LoopChange } from "./kits";

/** What the Account State holds for one character (account/accountState.ts `AccountCharacter`). */
export interface AccountSide {
  owned: boolean;
  sequence: number;
  weapon: string | null;
  refinement: number;
}

/** A team row of the roster ranking (myRankings/rankRoster.ts `TeamRank`), as far as this block reads it. */
export interface RankedTeam {
  id: string;
  name: string;
  source: string;
  characterIds: string[];
  avgDamage: number;
  dps: number | null;
}

export interface KitLink {
  id: "build" | "cost" | "weapons" | "echo-plan" | "rotation" | "rank";
  label: string;
  /** one line on what the page does */
  why: string;
  to: string;
}

export interface OnAccount {
  /** the app key the account plays them under (the male Rover where that is the form it holds) */
  key: string;
  owned: boolean;
  /** Riley fields them at S6 whatever the account says (a 4★ or a Rover form) */
  free: boolean;
  sequence: number;
  weapon: string | null;
  refinement: number;
  /** the best of Riley's teams for them that the account can field, at `cost` (his Team Cost nearest to the account's
   *  sequence where it has such a team); his figure on his standard builds */
  team: null | { cost: string; costLabel: string; team: KitTeam; keys: string[]; main: string | null };
  /** his best team at his default view when the account cannot field one of the listed teams: who is missing */
  wanted: null | { cost: string; costLabel: string; team: KitTeam; keys: string[]; main: string | null; missing: KitMember[] };
  /** their best team in the cached roster ranking: this app's figure on the account's builds; null without a cache or a team */
  ranked: RankedTeam | null;
  /** whether a roster ranking was handed in at all */
  hasRanking: boolean;
  /** the next sequence above the account's that changes how they are played */
  next: LoopChange | null;
  /** changes at or below the account's sequence: already in play */
  passed: LoopChange[];
  links: KitLink[];
}

export interface OnAccountInput {
  file: KitsFile;
  kit: Kit;
  /** who has a brief, with their rarity tier (a 4★ or Rover teammate counts as owned, as on /rankings' "Teams I can field") */
  index: readonly KitIndexEntry[];
  inApp: InApp;
  /** the character store's records by app key */
  characters: Record<string, any>;
  /** the Account State's reading of one key */
  // eslint-disable-next-line no-unused-vars -- the parameter of a function type
  side: (appKey: string) => AccountSide | null;
  /** the cached roster ranking's teams, or null when none is cached */
  rankedTeams: readonly RankedTeam[] | null;
}

const COST_ORDER_FIRST = "s0r1";

export function onAccountOf(input: OnAccountInput): OnAccount {
  const { file, kit, index, inApp, characters, side, rankedTeams } = input;
  const key = accountKeyOf(kit.appKey, characters);
  const mine = side(key);
  const owned = Boolean(mine?.owned);
  const free = kit.tier === "Free";
  const sequence = owned ? mine!.sequence : 0;

  // a teammate the account can field: set up, or one Riley's `mine` tier counts as owned (4★ and Rover forms)
  const tierOf = new Map(index.map((k) => [k.name, k.tier]));
  const accountKey = (m: KitMember): string => accountKeyOf(appKeyOf(m.name), characters);
  const has = (m: KitMember): boolean => Boolean(side(accountKey(m))?.owned) || tierOf.get(m.name) === "Free";
  // his Team Cost nearest to the account's own sequence first, then his default view, then the rest of his menu
  const near = owned ? nearestCost(kit, sequence, mine!.refinement) : COST_ORDER_FIRST;
  const costs = [...new Set([near, COST_ORDER_FIRST, ...file._meta.costs.map((c) => c.key)])].filter((c) => kit.best[c]);
  const shape = (cost: string, team: KitTeam) => ({ cost, costLabel: costLabel(cost), team, keys: team.members.map(accountKey), main: mainOf(team, kit.name) ? accountKey(mainOf(team, kit.name)!) : null });

  let team: OnAccount["team"] = null;
  if (owned || free) {
    for (const cost of costs) {
      const hit = fieldableTeams(file, kit.best[cost], inApp).find((t) => t.members.every((m) => m.name === kit.name || has(m)));
      if (hit) {
        team = shape(cost, hit);
        break;
      }
    }
  }
  let wanted: OnAccount["wanted"] = null;
  if (!team) {
    const cost = costs[0];
    const best = cost ? fieldableTeams(file, kit.best[cost], inApp)[0] : undefined;
    if (cost && best) wanted = { ...shape(cost, best), missing: best.members.filter((m) => (m.name === kit.name ? !(owned || free) : !has(m))) };
  }

  const twin = key !== kit.appKey ? kit.appKey : null;
  const ranked =
    [...(rankedTeams ?? [])]
      .filter((t) => t.characterIds.includes(key) || (twin !== null && t.characterIds.includes(twin)))
      .sort((a, b) => b.avgDamage - a.avgDamage)[0] ?? null;

  const changes = loopChanges(kit);
  const next = changes.find((c) => c.level > sequence) ?? null;
  const passed = owned ? changes.filter((c) => c.level <= sequence) : [];

  const enc = encodeURIComponent;
  const links: KitLink[] = [];
  const fielded = team ?? null;
  if (fielded && owned) {
    links.push({ id: "build", label: "Build from your echoes", why: "new echoes for them from your inventory, teammates keeping theirs", to: `/build-team?members=${fielded.keys.map(enc).join(",")}&only=${enc(key)}` });
    links.push({ id: "rotation", label: "Rotation cue card", why: "this team's rotation one swap per line, at your account", to: `/rotation#chars=${fielded.keys.map(enc).join(",")}` });
  }
  if (owned) {
    links.push({ id: "cost", label: "Cost to max", why: "every material left for the character, the weapon and the skills", to: `/account?focus=${enc(key)}&section=cost` });
    links.push({ id: "weapons", label: "Weapon value", why: "what the signature and each refinement add on your build", to: `/weapons?focus=${enc(key)}` });
  }
  links.push({ id: "echo-plan", label: "Echo plan", why: "which echoes to lock and discard for your roster", to: "/echo-plan" });
  if (!ranked) links.push({ id: "rank", label: "Rank my teams", why: "scores every team you can field on your own builds", to: "/my-rankings" });

  return { key, owned, free, sequence, weapon: owned ? mine!.weapon : null, refinement: owned ? mine!.refinement : 1, team, wanted, ranked, hasRanking: rankedTeams !== null, next, passed, links };
}

/** "You have Aemeath at S2 with Everbright Polestar at R1." */
export function ownedText(a: Pick<OnAccount, "owned" | "free" | "sequence" | "refinement">, name: string, weaponName: string): string {
  if (a.owned) return `You have ${name} at S${a.sequence}${weaponName ? ` with ${weaponName} at R${a.refinement}` : ""}.`;
  if (a.free) return `${name} is not set up in this app. Riley's table counts a 4★ or a Rover form as owned at S6, so their teams still show under "Teams I can field".`;
  return `${name} is not on your account in this app: no weapon is equipped on them.`;
}

/** The line on the next sequence that changes how they are played. */
export function nextText(a: Pick<OnAccount, "owned" | "sequence" | "next" | "passed">, name: string): string {
  const at = a.owned ? `You are at S${a.sequence}. ` : "";
  if (a.next) return `${at}The next sequence that changes how ${name} is played: ${a.next.text}${changeScope(a.next) ? ` (${changeScope(a.next)})` : ""}.`;
  if (a.passed.length) return `${at}No later sequence changes how ${name} is played: you already have ${[...new Set(a.passed.map((c) => `S${c.level}`))].join(" and ")}, the last that does.`;
  return `${at}No sequence changes how ${name} is played: one loop at every level.`;
}
