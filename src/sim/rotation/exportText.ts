// Wuthering Tools+ — the cue card as text to paste into Discord: one line per swap, the opener and each loop block,
// the loop target and the run's provenance. Pure.
//
// FloatRotationBoard's DSL (`[循环轴]` then `爱a23>琳E>莫R`, checked against its README 2026-10-26) documents the
// sections, separators, `变` and `{notes}`, but its steps only by example (`a23`, `E`, `R` — no list of step kinds), and
// its character abbreviations come from a Chinese alias table the player maintains (`aliases.user.csv`): not enough to
// write it faithfully, so there is no FRB exporter (src/sim/README.md § Rotation view).
import type { CuePlan } from "./cueModel";
import { durationText } from "./cueModel";
import type { CueChip, RotationModel } from "./extract";
import { tokenText } from "./tokens";

export const DISCORD_LIMIT = 2000;

const int = (n: number): string => Math.round(n).toLocaleString("en-US");

/** A chip as text, with the cancel it ends on in brackets ("BA×3 [jump]"). */
export const chipText = (c: CueChip, cancels = true): string => `${tokenText(c)}${cancels && c.cancel ? ` [${c.cancel}]` : ""}`;

export interface ExportOptions {
  /** where the page lives (a link line at the end); omitted when empty */
  url?: string;
  /** "at my account" / "ChemX32 substats" … */
  spreadLabel?: string;
  cancels?: boolean;
}

export function discordText(model: RotationModel, plan: CuePlan, opts: ExportOptions = {}): string {
  const run = model.run;
  const names = run.members.map((m) => m.name);
  const lines: string[] = [];
  lines.push(`**${names.join(" · ")}** — ${int(run.total)} DPS · wuwa_calc ${run.engine.commit}${opts.spreadLabel ? ` · ${opts.spreadLabel}` : ""}`);
  const opener = plan.blocks.find((b) => b.key === "opener");
  const loops = plan.blocks.filter((b) => b.key !== "opener");
  const head = [opener ? `Opener ${durationText(opener.seconds)}` : null, ...loops.map((b) => `${b.title} ${durationText(b.seconds)}${b.repeat > 1 ? ` ×${b.repeat}` : ""}`), `fight ${durationText(plan.fightSeconds)}`];
  lines.push(head.filter(Boolean).join(" · "));
  for (const b of plan.blocks) {
    lines.push("");
    lines.push(`__${b.title}${b.repeat > 1 ? ` ×${b.repeat}` : ""}__ (${durationText(b.seconds)})`);
    for (const v of b.visits) {
      lines.push(`> **${names[v.member]}** ${v.chips.map((c) => chipText(c, opts.cancels ?? true)).join(" › ")} · ${v.seconds.toFixed(1)} s`);
    }
  }
  if (plan.wrap) lines.push(`…then ${names[plan.wrap.member]} again: the loop starts over.`);
  if (opts.url) lines.push("", `<${opts.url}>`);
  return lines.join("\n");
}

/** The text, trimmed of cancel marks if that is what it takes to fit one Discord message. */
export function discordMessage(model: RotationModel, plan: CuePlan, opts: ExportOptions = {}): { text: string; fits: boolean; cancels: boolean } {
  const full = discordText(model, plan, opts);
  if (full.length <= DISCORD_LIMIT || opts.cancels === false) return { text: full, fits: full.length <= DISCORD_LIMIT, cancels: opts.cancels !== false };
  const bare = discordText(model, plan, { ...opts, cancels: false });
  return { text: bare, fits: bare.length <= DISCORD_LIMIT, cancels: false };
}
