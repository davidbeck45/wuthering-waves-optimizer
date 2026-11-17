// Wuthering Tools+ — the pull advisor's answer for a featured resonator the account does not own (2026-11-16, the day
// Lily's banner was the first thing a player asked the advisor about and it had nothing to say).
//
// The advisor scores a copy on the player's own build with this app's engine, and a resonator they lack has no build.
// Riley's engine does play whole teams for one: the weapon page's selector already asks it "what would this pick add"
// (src/sim/weaponValue/selector.ts, `rankResonatorPool`): the candidate is registered as owned at S0 on his loadout's
// best weapon that is not a signature, every team of theirs the rest of the account can field is solved, and each main
// DPS's best team with them is set against that main DPS's best team today. This module only puts that row into words.
// No figure is made here: a row without one gets the engine's own reason.
//
// DPS is damage per second in wuwa_calc. It is never mixed with the calculator's damage, and the sentences say so by
// naming the unit on every figure.
import { characterShortName, teamLabel } from "../display/names";
import type { ResonatorPickRow, TeamRef } from "../weaponValue/selector";

export interface NewResonatorVerdict {
  /** `gain`: a main DPS's best team rises; `none`: none does; `unknown`: nothing was measured */
  tone: "gain" | "none" | "unknown";
  headline: string;
  lines: string[];
}

const int = (n: number): string => Math.round(n).toLocaleString("en-US");
const pct = (fraction: number): string => `${(fraction * 100).toFixed(1)}%`;
const teamOf = (ref: TeamRef, mainDps: string): string => teamLabel(ref.team, mainDps);
/** a gain under a twentieth of a percent prints as 0.0 %: said as no rise */
const RISES = 0.0005;

export function newResonatorVerdict(row: ResonatorPickRow, name: string): NewResonatorVerdict {
  const unknown = (headline: string): NewResonatorVerdict => ({ tone: "unknown", headline, lines: [] });
  if (row.status === "not-in-app") return unknown(`${name} is not in this app yet, so wuwa_calc's teams with ${name} can't be run here.`);
  if (row.status === "no-teams") return unknown(`wuwa_calc has no team with ${name}, so there is nothing to run.`);
  if (row.status === "error") return unknown(`wuwa_calc could not run ${name}'s teams${row.note ? `: ${row.note}` : ""}.`);
  if (row.status !== "new") return unknown(`${name} is on your account now: run the advisor again to score the next copy.`);
  if (!row.uplift && !row.newTeams?.best) return unknown(`wuwa_calc has no team with ${name} that the rest of your account can field.`);

  const lines: string[] = [];
  let tone: NewResonatorVerdict["tone"] = "none";
  let headline = `${name} would not raise the best team of any main DPS you own.`;
  const up = row.uplift;
  if (up) {
    const main = characterShortName(up.mainDps);
    if (up.gain >= RISES) {
      tone = "gain";
      headline = `${name} would raise your best ${main} team by ${pct(up.gain)}.`;
      lines.push(`${teamOf(up.with, up.mainDps)} does ${int(up.with.dps)} DPS with ${name}. Your best ${main} team today, ${teamOf(up.base, up.mainDps)}, does ${int(up.base.dps)} DPS.`);
    } else {
      const ahead = up.with.dps > 0 ? up.base.dps / up.with.dps - 1 : 0;
      lines.push(
        `Closest: ${teamOf(up.with, up.mainDps)} does ${int(up.with.dps)} DPS with ${name}. Your best ${main} team today, ${teamOf(up.base, up.mainDps)}, does ${int(up.base.dps)} DPS${ahead >= RISES ? `: ${pct(ahead)} more` : ""}.`,
      );
    }
  }
  const count = row.newTeams?.count ?? 0;
  if (count > 0) lines.push(`${name} makes ${count} more team${count === 1 ? "" : "s"} fieldable on your account.`);
  if (row.ran) {
    lines.push(
      `Run as one copy: S${row.ran.sequence} with ${row.ran.weapon} R${row.ran.refinement}${row.ran.approximated ? `, wuwa_calc's best weapon for ${name} that is not a signature` : ""}.`,
    );
  }
  return { tone, headline, lines };
}
