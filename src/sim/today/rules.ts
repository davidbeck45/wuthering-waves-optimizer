// Wuthering Tools+ — the static rules behind /today (data/rules.json): Waveplate constants, the reset hour, the
// endgame cycle anchors, the Endstate Matrix cycle, version ends, the double-drop rules, hand-entered rows for
// Kuro's image-only posts, and the weekly-caps checklist. Every row carries its source (a Kuro article id or a wiki
// page); rows only the community states (the ToA / Whimpering Wastes calendars) say so and the UI labels them
// "check in game". Re-check at every game version: caps and cycles change by patch.
import raw from "./data/rules.json";

export interface RuleSource {
  label: string;
  /** a Kuro news article (wutheringwaves.kurogames.com/en/main/news/detail/<id>) */
  articleId?: number;
  url?: string;
}

export interface WaveplateRules {
  max: number;
  regenMinutes: number;
  crystalMax: number;
  crystalRegenMinutes: number;
  solvent: number;
  source: RuleSource;
}

export interface CycleRule {
  id: string;
  name: string;
  detail: string;
  /** "YYYY-MM-DD HH:mm" server time: the start of one cycle */
  anchor: string;
  /** the community's season number for the anchor cycle (null: none) */
  anchorSeason?: number;
  periodDays: number;
  /** an app route for the mode, shown only when the route exists */
  link: string | null;
  /** "official": Kuro states the dates; "community": a tracker / the wiki does — "check in game" */
  confidence: "official" | "community";
  source: RuleSource;
}

export interface MatrixRule {
  name: string;
  cycle: string;
  cycleNumber: number;
  fromVersion: string;
  toVersion: string;
  source: RuleSource;
}

export interface VersionEndRule {
  /** "YYYY-MM-DD" (UTC+8): the day of the next version's update maintenance */
  date: string;
  note: string;
  articleId: number;
}

export interface ManualEventRule {
  name: string;
  type: string;
  start: string;
  end: string;
  tz: "server" | "utc+8";
  articleId: number;
  /** the post's publish time, CST */
  published: string;
  note: string;
}

export interface DoubleDropRule {
  id: string;
  /** lower-case words an event name contains */
  match: string;
  label: string;
  activity: string;
  /** one more line of the rule ("they share the claims") */
  note?: string;
  claimsPerDay: number;
  costPerClaim: number;
  articleId: number;
}

export type ResetKind = "daily" | "weekly" | "matrix" | `cycle:${string}`;

export interface ChecklistRule {
  id: string;
  label: string;
  detail: string;
  max: number;
  reset: ResetKind;
  /** listed only while a double-drop event runs */
  doubleDropOnly?: boolean;
  source?: RuleSource;
}

export interface TodayRules {
  v: number;
  checked: string;
  waveplates: WaveplateRules;
  resets: { hour: number; weekday: number; source: RuleSource };
  cycles: CycleRule[];
  matrix: MatrixRule;
  versionEnds: Record<string, VersionEndRule>;
  manualEvents: ManualEventRule[];
  doubleDrops: DoubleDropRule[];
  checklist: ChecklistRule[];
}

export const RULES = raw as TodayRules;

export const KURO_NOTICE_URL = (id: number): string => `https://wutheringwaves.kurogames.com/en/main/news/detail/${id}`;

/** where a rule's source lives (a Kuro notice or a wiki / tracker page) */
export function sourceUrl(s: RuleSource | undefined): string | null {
  if (!s) return null;
  if (s.articleId) return KURO_NOTICE_URL(s.articleId);
  return s.url ?? null;
}

/** the double-drop rule an event name belongs to (Chord Cleansing, Bountiful Crescendo), or null */
export function doubleDropRuleFor(name: string, rules: TodayRules = RULES): DoubleDropRule | null {
  const n = name.toLowerCase();
  return rules.doubleDrops.find((d) => n.includes(d.match)) ?? null;
}
