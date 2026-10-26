// Wuthering Tools+ — one reader for the names wuwa_calc writes into this app.
//
// The generators (wuwa-tools/rotation-port emitters, the /rankings import, Sync my teams) name rotations and
// teams with everything a run carries, e.g.
//   "Sigrika S6R2 Solsworn Ciphers R2 · Mornye + Lucilla · S6R2 DPS · S1R1/S0R1 team (wuwa_calc)"   (an import)
//   "Aemeath S6 Everbright Polestar R5 · Mornye + Lynae · S6R5 (wuwa_calc)"                           (a stock preset)
//   "wuwa_calc Aemeath S6R5 DPS · S1R1/S6R1 team · Mornye + Lynae"                                    (an imported team)
//   "Chisa + Denia + Aemeath · S6R5 (wuwa_calc t307)"                                                 (an old stock team)
// That is one unreadable line wherever it lands. `parsePresetName` splits it into a short title ("Sigrika ·
// Mornye + Lucilla"), chips (own state, DPS / team tier, mode, extras) and the teammates' character keys for mini
// portraits; the full name stays for a tooltip. A name the player typed comes back untouched (`generated: false`).
// Pure: no Vue, no stores. Names are Riley's (castMapper `appKeyOf` maps them onto app keys).
import { appKeyOf } from "../rankings/castMapper";

export type PresetChipKind = "own" | "dps" | "team" | "tier" | "mode" | "extra" | "preset";

export interface PresetChip {
  kind: PresetChipKind;
  label: string;
  /** a sentence for a tooltip */
  title: string;
}

export interface PresetNameParts {
  /** the name as stored */
  full: string;
  /** written by wuwa_calc / this app's importer (vs. typed by the player) */
  generated: boolean;
  kind: "rotation" | "team" | "other";
  /** the character the rotation belongs to / the team's main DPS, as written ("Aero Rover") */
  main: string | null;
  mainKey: string | null;
  /** the other members, as written (all three for an old stock team, whose name does not mark the main DPS) */
  teammates: string[];
  teammateKeys: string[];
  /** "Mornye + Lucilla" ("" when none) */
  teamLabel: string;
  /** short display title: "Sigrika · Mornye + Lucilla", or the full name when not generated */
  title: string;
  /** the rotation's own weapon as written, with its rank ("Solsworn Ciphers R2"), when named */
  weapon: string | null;
  chips: PresetChip[];
}

export interface PresetNameOptions {
  /** character keys the account has: a Rover form resolves to the gender the account holds */
  owned?: Iterable<string>;
}

const SOURCE_RE = /\s*\(wuwa_calc(?:\s+(t\d+))?\)\s*$/;
const TEAM_PREFIX_RE = /^wuwa_calc\s+/;
/** "@ my account" and an optional "(…)" note behind it, anywhere in the name */
const ACCOUNT_RE = /\s*@\s*my account\b(?:\s*\(([^)]*)\))?/i;
const STATE = "S\\d(?:R\\d)?";
const TIER_RE = new RegExp(`^(${STATE})(?:\\s+(DPS))?$`);
const TEAM_TIER_RE = new RegExp(`^((?:${STATE})(?:\\/${STATE})*)\\s+team$`);
/** "<Name> S6[R5][ <Weapon> R5][ DPS]" — the name is the shortest prefix before the first " S<digit>" */
const HEAD_RE = /^(.+?)\s+S(\d)(?:R(\d))?(?:\s+(.+?)\s+R(\d))?(?:\s+(DPS))?$/;
const NAME_RE = /^[A-Z][\w'’.:-]*(?: [A-Z][\w'’.:-]*)*$/;

const isTeamSegment = (s: string): boolean => {
  const parts = s.split(/\s+\+\s+/);
  return parts.length >= 2 && parts.length <= 3 && parts.every((p) => NAME_RE.test(p.trim()));
};

/** A Rover form in the gender the account holds (Riley has one form per element; the app has two keys). */
function resolveKey(name: string, owned: Set<string> | null): string {
  const key = appKeyOf(name.trim());
  if (!owned || owned.has(key) || !/^rover/i.test(key)) return key;
  // appKeyOf names the female key; the account may hold the male one
  const other = key.replace(/([Ff])emale$/, (_, f: string) => (f === "F" ? "Male" : "male"));
  return owned.has(other) ? other : key;
}

const plain = (full: string): PresetNameParts => ({
  full,
  generated: false,
  kind: "other",
  main: null,
  mainKey: null,
  teammates: [],
  teammateKeys: [],
  teamLabel: "",
  title: full.trim(),
  weapon: null,
  chips: [],
});

/** Split a generated rotation / team name into title, chips and teammates; any other name comes back as its own title. */
export function parsePresetName(name: string | null | undefined, options: PresetNameOptions = {}): PresetNameParts {
  const full = String(name ?? "");
  let rest = full.trim();
  if (!rest) return plain(full);
  const owned = options.owned ? new Set(options.owned) : null;

  let generated = false;
  let teamImport = false;
  let presetId: string | null = null;
  const source = SOURCE_RE.exec(rest);
  if (source) {
    generated = true;
    presetId = source[1] ?? null;
    rest = rest.slice(0, source.index).trim();
  }
  if (TEAM_PREFIX_RE.test(rest)) {
    generated = true;
    teamImport = true;
    rest = rest.replace(TEAM_PREFIX_RE, "");
  }
  let accountNote: string | null = null;
  let account = false;
  const acc = ACCOUNT_RE.exec(rest);
  if (acc) {
    account = true;
    accountNote = acc[1]?.trim() || null;
    rest = (rest.slice(0, acc.index) + rest.slice(acc.index + acc[0].length)).replace(/\s+·\s*$/, "").trim();
  }
  if (!generated && !account) return plain(full);

  const segments = rest.split(/\s+·\s+/).map((s) => s.trim()).filter(Boolean);
  let main: string | null = null;
  let teammates: string[] = [];
  /** the head's own state: "S6R2", or "S6R5" from "S6 Everbright Polestar R5" */
  let ownLabel: string | null = null;
  let weapon: string | null = null;
  let dps: string | null = null;
  let teamTier: string | null = null;
  let tier: string | null = null;
  const extras: string[] = [];
  let teamFromComposition = false;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const t = TIER_RE.exec(seg);
    if (t) {
      if (t[2]) dps = t[1];
      else tier = t[1];
      continue;
    }
    const tt = TEAM_TIER_RE.exec(seg);
    if (tt) {
      teamTier = tt[1];
      continue;
    }
    if (isTeamSegment(seg)) {
      const names = seg.split(/\s+\+\s+/).map((s) => s.trim());
      if (main) teammates = names;
      else {
        // an old stock team lists the composition in Riley's slot order ("Hiyuki + Carlotta + Lucilla"), which
        // does not say who the main DPS is: all three are members, none is the main
        teammates = names;
        teamFromComposition = true;
      }
      continue;
    }
    if (i === 0) {
      const h = HEAD_RE.exec(seg);
      if (h && NAME_RE.test(h[1])) {
        main = h[1];
        ownLabel = `S${h[2]}${h[3] != null ? `R${h[3]}` : h[5] != null ? `R${h[5]}` : ""}`;
        if (h[4]) weapon = `${h[4]} R${h[5]}`;
        continue;
      }
      if (NAME_RE.test(seg)) {
        main = seg;
        continue;
      }
    }
    extras.push(seg);
  }

  if (!main && !teamFromComposition) return { ...plain(full), generated, chips: account ? [accountChip(accountNote)] : [] };

  const kind: PresetNameParts["kind"] = teamImport || teamFromComposition ? "team" : "rotation";
  const chips: PresetChip[] = [];
  const mainName: string = main ?? "the team";
  if (kind === "team") {
    // a team's head carries the main DPS's state ("Aemeath S6R5 DPS"); an old stock team names one tier for all
    const dpsLabel = dps ?? ownLabel;
    if (dpsLabel && teamTier && teamTier !== dpsLabel) {
      chips.push({ kind: "dps", label: `DPS ${dpsLabel}`, title: `${mainName} solved at ${describeState(dpsLabel)}` });
      chips.push({ kind: "team", label: `team ${teamTier}`, title: `the other members at ${teamTier.split("/").map(describeState).join(" / ")}` });
    } else if (dpsLabel || tier) {
      const label = dpsLabel ?? tier ?? "";
      chips.push({ kind: "tier", label, title: `every member at ${describeState(label)}` });
    }
  } else {
    if (ownLabel) chips.push({ kind: "own", label: ownLabel, title: `${mainName} at ${describeState(ownLabel)}${weapon ? `, ${weapon}` : ""}` });
    if (dps && teamTier) {
      if (dps !== ownLabel) chips.push({ kind: "dps", label: `DPS ${dps}`, title: `the team's main DPS at ${describeState(dps)}` });
      chips.push({ kind: "team", label: `team ${teamTier}`, title: `the team's other members at ${teamTier.split("/").map(describeState).join(" / ")}` });
    } else if (tier && tier !== ownLabel) {
      chips.push({ kind: "tier", label: tier, title: `solved with every member at ${describeState(tier)}` });
    } else if (dps && dps !== ownLabel) {
      chips.push({ kind: "dps", label: `DPS ${dps}`, title: `the team's main DPS at ${describeState(dps)}` });
    }
  }
  if (account) chips.push(accountChip(accountNote));
  for (const e of extras) chips.push({ kind: "extra", label: e, title: e });
  if (presetId) chips.push({ kind: "preset", label: presetId, title: `wuwa_calc team ${presetId}` });

  const teamLabel = teammates.join(" + ");
  return {
    full,
    generated: true,
    kind,
    main,
    mainKey: main ? resolveKey(main, owned) : null,
    teammates,
    teammateKeys: teammates.map((n) => resolveKey(n, owned)),
    teamLabel,
    title: main ? (teamLabel ? `${main} · ${teamLabel}` : main) : teamLabel,
    weapon,
    chips,
  };
}

function accountChip(note: string | null): PresetChip {
  return { kind: "mode", label: "My account", title: note ? `solved at your account's own state (${note})` : "solved at your account's own sequences and weapons" };
}

/** "S6R5" → "S6, R5 weapon"; "S0" → "S0" */
export function describeState(label: string): string {
  const m = /^S(\d)(?:R(\d))?$/.exec(label);
  if (!m) return label;
  return m[2] ? `S${m[1]} with an R${m[2]} weapon` : `S${m[1]}`;
}
