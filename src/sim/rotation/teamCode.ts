// Wuthering Tools+ — a /rankings team code (`#team=<code>`, Riley31415/wuwa_calc `page/teamcode.ts`) read far enough
// to name its team: the first 12 base64url digits are the three members' resonators and loadouts (plus their
// sequences, weapons and ranks, which this page replaces with the player's own). Reading it with his
// `readTeamCode` / `tagTeam()` would pull his engine core onto the main thread (teamcode.ts → mainstats → gear →
// context); the team part is ~20 lines of arithmetic, so it is mirrored here and pinned against his `tagTeam()` on
// every team of his list (rotation.test.ts, "on the real engine"). Pure.
//
// The page never reads `hashParams().get("team")` as a team key: a `team=` value is a team key ("t404"), a row key
// (hash.ts `picksOfRowKey`), or a code read here.

/** base64url, his `TAG_DIGITS` */
const DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** his widths: a resonator id is 1ESS (element 1-6, serial to 21), a loadout its place 1-4; sequences 0-6; a weapon
 *  slot of 5 types × 16 serials × 4 rarity digits; ranks 1-5. The team part is 72 bits: 12 digits. */
const ELEMENTS = 6n, SERIALS = 21n, LOADOUTS = 4n, SEQUENCES = 7n;
const WEAPON_SPAN = 5n * 16n * 4n, REFINES = 5n;
const MEMBER_SPAN = ELEMENTS * SERIALS * LOADOUTS * SEQUENCES * WEAPON_SPAN * REFINES;
const TEAM_SPAN = MEMBER_SPAN ** 3n * 16n;
export const TEAM_PART_DIGITS = 12;

export interface CodeMember {
  /** the loadout's id as his `LoadoutDef.id`: resonator id × 10 + its place among that kit's loadouts */
  loadout: number;
  sequence: number;
}

/** The members a code names (slot order), null where its first 12 digits are not a team part. */
export function membersOfCode(code: string): CodeMember[] | null {
  const text = code.trim();
  if (text.length < TEAM_PART_DIGITS || !/^[A-Za-z0-9_-]+$/.test(text)) return null;
  let team = 0n;
  for (const c of text.slice(0, TEAM_PART_DIGITS)) team = (team << 6n) | BigInt(DIGITS.indexOf(c));
  if (team >= TEAM_SPAN) return null;
  team /= 16n; // the matrix bit and each member's high-substats bit
  const members: CodeMember[] = [];
  for (let i = 0; i < 3; i++) {
    let m = team % MEMBER_SPAN;
    team /= MEMBER_SPAN;
    m /= REFINES;
    m /= WEAPON_SPAN;
    const sequence = Number(m % SEQUENCES);
    const slot = m / SEQUENCES;
    const place = Number(slot % LOADOUTS) + 1;
    const r = slot / LOADOUTS;
    const resonator = 1000 + Number(r / SERIALS + 1n) * 100 + Number((r % SERIALS) + 1n);
    members.unshift({ loadout: resonator * 10 + place, sequence });
  }
  return members;
}

/** The team key of his list a code names (his `tagTeam()`), off the team list's loadout ids; null where none. */
export function teamOfCode(code: string, teams: ReadonlyArray<{ key: string; members: ReadonlyArray<{ loadout?: number }> }>): string | null {
  const members = membersOfCode(code);
  if (!members) return null;
  const want = members.map((m) => m.loadout).join(".");
  return teams.find((t) => t.members.map((m) => m.loadout ?? 0).join(".") === want)?.key ?? null;
}
