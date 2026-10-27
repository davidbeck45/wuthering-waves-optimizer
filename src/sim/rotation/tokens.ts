// Wuthering Tools+ — the rotation view's token dictionary: one of Riley31415/wuwa_calc's report lines (a RunLite
// row) as the button a player presses — BA / HA / E / R / Intro / Outro / Echo / Plunge / Jump / Wait — with the
// stage digits of a folded chain ("Basic - Moonbow 123" → BA×3), the cancel the press ends on (dodge / jump /
// swap / hold) and the enhanced (Forte) state. Pure; reads only the row's `action`, `label`, `cast` and `tag`.
//
// The press is read off the action's own name first ("Heavy - …" is a heavy-attack input even where his cast kind
// files the damage as Basic), then his cast kind, then the display name itself — an action this table does not
// know still gets a chip, never a blank.
import type { RunRow } from "../engine/rileyRun";

export type TokenKind = "basic" | "heavy" | "skill" | "liberation" | "intro" | "outro" | "echo" | "plunge" | "air" | "jump" | "wait" | "tune" | "other";

/** The cancel a press ends on, as an input the player makes (his `ActionTag`s, grouped). */
export type CancelKind = "dodge" | "jump" | "swap" | "hold";

export interface CueToken {
  kind: TokenKind;
  /** the chip's text: "BA", "HA", "E", "R", "Intro", "Outro", "Echo", "Plunge", "Air", "Jump", "Wait" or a
   *  short display name for an action the table does not know */
  text: string;
  /** what follows the text: "×3" (a full chain or a repeat), "2–3" (chain stages), "+1" (a group of named
   *  presses), "0.9s" (a wait) */
  suffix?: string;
  /** cast in an enhanced / Forte state ("Forte Basic - …") */
  forte?: boolean;
  cancel?: CancelKind;
  /** the full name(s) for a tooltip: the line's label, else the action */
  name: string;
  /** his cancel tag verbatim ("dodge cancel"), for the tooltip */
  tag?: string;
  /** presses this chip stands for (a folded chain counts its stages) */
  count: number;
}

const CANCEL_OF: Record<string, CancelKind> = {
  "dodge cancel": "dodge",
  "instant dodge": "dodge",
  "dodge on hit": "dodge",
  "jump cancel": "jump",
  "instant jump": "jump",
  "swap cancel": "swap",
  "instant swap": "swap",
  "hold cancel": "hold",
};

const BY_PREFIX: Record<string, { kind: TokenKind; text: string; forte?: boolean }> = {
  Basic: { kind: "basic", text: "BA" },
  "Forte Basic": { kind: "basic", text: "BA", forte: true },
  Heavy: { kind: "heavy", text: "HA" },
  "Forte Heavy": { kind: "heavy", text: "HA", forte: true },
  Skill: { kind: "skill", text: "E" },
  "Forte Skill": { kind: "skill", text: "E", forte: true },
  Liberation: { kind: "liberation", text: "R" },
  Intro: { kind: "intro", text: "Intro" },
  Outro: { kind: "outro", text: "Outro" },
  Echo: { kind: "echo", text: "Echo" },
  "Mid-air": { kind: "air", text: "Air" },
  "Forte Mid-air": { kind: "air", text: "Air", forte: true },
};

const BY_CAST: Record<string, { kind: TokenKind; text: string }> = {
  Basic: { kind: "basic", text: "BA" },
  Heavy: { kind: "heavy", text: "HA" },
  Skill: { kind: "skill", text: "E" },
  Liberation: { kind: "liberation", text: "R" },
  Intro: { kind: "intro", text: "Intro" },
  Outro: { kind: "outro", text: "Outro" },
  Echo: { kind: "echo", text: "Echo" },
  Jump: { kind: "jump", text: "Jump" },
  "Tune Break": { kind: "tune", text: "Tune Break" },
};

/** "Basic - Moonbow 3" → ["Basic", "Moonbow 3"]; a name with no " - " has no prefix. */
export function splitAction(name: string): [prefix: string | null, rest: string] {
  const at = name.indexOf(" - ");
  return at < 0 ? [null, name] : [name.slice(0, at), name.slice(at + 3)];
}

const WAIT_RE = /^Wait (\d+(?:\.\d+)?)s\b/;

/** Stage digits of a folded chain: "123" → ×3, "23" → 2–3, "124" → 1·2·4; null where `tail` is not digits. */
export function stagesOf(tail: string): { suffix: string; count: number } | null {
  if (!/^\d{2,}$/.test(tail)) return null;
  const d = [...tail].map(Number);
  const consecutive = d.every((x, i) => i === 0 || x === d[i - 1]! + 1);
  if (consecutive && d[0] === 1) return { suffix: `×${d.length}`, count: d.length };
  if (consecutive) return { suffix: `${d[0]}–${d[d.length - 1]}`, count: d.length };
  return { suffix: d.join("·"), count: d.length };
}

/** A short display name for an action nothing above knows: the part after " - ", cut at 18 characters. */
export function shortName(name: string): string {
  const rest = splitAction(name)[1].trim();
  return rest.length > 18 ? `${rest.slice(0, 17).trimEnd()}…` : rest;
}

/** One row as the press a player makes. */
export function tokenOf(row: Pick<RunRow, "action" | "label" | "cast" | "tag">): CueToken {
  const name = row.label ?? row.action;
  const tag = row.tag;
  const cancel = tag ? CANCEL_OF[tag] : undefined;
  const base = { name, ...(tag ? { tag } : {}), ...(cancel ? { cancel } : {}) };

  const wait = WAIT_RE.exec(row.action);
  if (wait && row.cast == null) return { ...base, kind: "wait", text: "Wait", suffix: `${Number(wait[1]).toFixed(1)}s`, count: 1 };

  // the press: its label's prefix where the line is a folded group ("Forte - Polychrome Leap 123" reads off the
  // action "Forte Basic - …"), the action's own prefix, then his cast kind
  const [actionPrefix] = splitAction(row.action);
  const [labelPrefix, labelRest] = splitAction(name);
  const known = (actionPrefix ? BY_PREFIX[actionPrefix] : undefined) ?? (labelPrefix ? BY_PREFIX[labelPrefix] : undefined);
  let kind: TokenKind, text: string, forte: boolean | undefined;
  if (known) ({ kind, text, forte } = known);
  else if (row.cast && BY_CAST[row.cast]) ({ kind, text } = BY_CAST[row.cast]!);
  else {
    kind = "other";
    text = shortName(row.action);
  }
  // "Forte - X" names the state, the action names the press
  if (!forte && labelPrefix === "Forte") forte = true;
  if (kind === "air" && /plunge/i.test(row.action)) {
    kind = "plunge";
    text = "Plunge";
  }

  // what the line folds: chain stages ("… 123"), a group of named presses ("A + B + C"), a repeat ("… x3")
  let suffix: string | undefined;
  let count = 1;
  if (row.label) {
    const repeat = / x(\d+)$/.exec(row.label);
    const parts = labelRest.split(" + ");
    const stages = stagesOf(labelRest.split(" ").pop() ?? "");
    if (repeat) {
      count = Number(repeat[1]);
      suffix = `×${count}`;
    } else if (stages) {
      ({ suffix, count } = stages);
    } else if (parts.length > 1) {
      count = parts.length;
      suffix = `+${parts.length - 1}`;
    } else {
      // a chain whose stages are not plain digits ("Vining Waltz 123H4"): keep its tail as written
      const tail = labelRest.split(" ").pop() ?? "";
      if (/^[0-9A-Z]{2,}$/.test(tail) && /\d/.test(tail)) suffix = tail;
    }
  }
  return { ...base, kind, text, ...(suffix ? { suffix } : {}), ...(forte ? { forte } : {}), count };
}

/** The chip as plain text ("BA×3", "E", "Wait 0.9s") — the Discord export and the play mode's next line. */
export function tokenText(t: Pick<CueToken, "text" | "suffix" | "kind">): string {
  if (!t.suffix) return t.text;
  return t.kind === "wait" || t.suffix.startsWith("+") ? `${t.text} ${t.suffix}` : `${t.text}${t.suffix}`;
}

/** Two chips that read the same (merged into one "×N" chip when back to back). */
export const sameToken = (a: CueToken, b: CueToken): boolean =>
  a.kind === b.kind && a.text === b.text && !a.suffix && !b.suffix && !!a.forte === !!b.forte && a.cancel === b.cancel && a.kind !== "wait" && a.kind !== "intro" && a.kind !== "outro";
