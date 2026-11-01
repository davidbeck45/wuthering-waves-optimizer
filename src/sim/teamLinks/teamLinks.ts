// Wuthering Tools+ — the plus team tools a saved team on the Teams page can open: its wuwa_calc cue card and fight
// timeline (/rotation, the composition at the account), the energy check and the ToA check. Pure: the links and the
// words, so the Teams editor's one-line hook (TeamPlusLinks.vue) stays a thin view.
import { characterShortName } from "../display/names";
import { rotationPath } from "../rotation/hash";

export interface TeamPlusLink {
  id: "cue" | "timeline" | "energy" | "endgame";
  label: string;
  to: string;
  /** what the page does, for the title and screen readers */
  title: string;
}

/** The three app character keys of a full team, else null (wuwa_calc teams are always three). */
export function teamCharsOf(characterIds: ReadonlyArray<string | null | undefined>): string[] | null {
  const ids = characterIds.filter((id): id is string => Boolean(id));
  return ids.length === 3 ? ids : null;
}

export function teamPlusLinks(chars: ReadonlyArray<string>): TeamPlusLink[] {
  const target = { kind: "chars" as const, chars: [...chars] };
  return [
    { id: "cue", label: "Cue card", to: rotationPath(target), title: "wuwa_calc's rotation for this team, one line per swap, with a play-along timer" },
    { id: "timeline", label: "Fight timeline", to: rotationPath(target, { tab: "timeline" }), title: "Who is on field when, buff uptime and kill times, on wuwa_calc's frame clock" },
    { id: "energy", label: "Energy check", to: "/energy", title: "How much Energy Regen each member needs in this team's wuwa_calc loop, against their build" },
    { id: "endgame", label: "ToA check", to: "/endgame", title: "This season's Tower of Adversity floors against the teams you can field" },
  ];
}

/** The members wuwa_calc ran without the account's build (not set up in the calculator), said the way /rotation says
 *  it — "Mornye and Lynae are not set up in the calculator, so wuwa_calc runs them at S0 R1." — or "" when every
 *  member is the player's own. Without it the panel's "at your account" DPS reads as the player's. */
export function notSetUpText(members: ReadonlyArray<{ appKey: string; owned: boolean; sequence: number; refinement: number }>): string {
  const list = members.filter((m) => !m.owned);
  if (!list.length) return "";
  const and = (items: string[]): string => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] ?? "");
  const same = list.every((m) => m.sequence === list[0]!.sequence && m.refinement === list[0]!.refinement);
  const worn = same
    ? `${list.length > 1 ? "them" : characterShortName(list[0]!.appKey)} at S${list[0]!.sequence} R${list[0]!.refinement}`
    : and(list.map((m) => `${characterShortName(m.appKey)} at S${m.sequence} R${m.refinement}`));
  return `${and(list.map((m) => characterShortName(m.appKey)))} ${list.length > 1 ? "are" : "is"} not set up in the calculator, so wuwa_calc runs ${worn}.`;
}
