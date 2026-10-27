// Wuthering Tools+ AI — the questions the empty assistant offers on each page, and the page context sent with a
// question. Pure.
import type { PageContext } from "../prompt";
import { pageTitleOf } from "../../shell/paletteItems";

export interface SuggestionContext {
  /** display name of the calculator's active character */
  activeCharacter?: string | null;
  /** the team open in the Teams editor */
  openTeam?: string | null;
}

const base = (path: string): string => (path.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";

/** Three or four questions that fit the page the player is on. */
export function suggestionsFor(path: string, ctx: SuggestionContext = {}): string[] {
  const name = ctx.activeCharacter?.trim() || null;
  switch (base(path)) {
    case "/":
      return name
        ? [`How can I raise ${name}'s damage?`, `Which substat should ${name} roll for next?`, `Is ${name}'s next sequence worth it?`, `Which of ${name}'s echoes should I replace first?`]
        : ["What's my strongest character right now?", "What should I invest in next?", "Which echoes can I feed?"];
    case "/my-rankings":
      return ["What should I invest in next?", "Which of my teams is strongest, and why?", "Who is underperforming for their investment?"];
    case "/rankings":
      return ["Which of these teams can I field best?", "Which team should I build next?", "How do my saved teams compare to Riley's numbers?"];
    case "/teams":
      return [
        ...(ctx.openTeam ? [`Where does "${ctx.openTeam}" get its damage from?`] : []),
        "Why is my team lower than Riley's?",
        "Which of my saved teams is strongest?",
        "Which buffs are my teams missing?",
      ].slice(0, 4);
    case "/inventory":
      return ["Which echoes can I feed?", "What are my best Crit DMG echoes?", "Which equipped echo should I replace first?"];
    case "/convene":
      return ["Who should I pull for?", "Which missing character would complete a team I almost have?", "Is a weapon or a sequence the better pull for my main DPS?"];
    case "/account":
      return ["Give me a quick review of my account", "What should I invest in next?", "Which teams can I field right now?"];
    default:
      return ["What's my strongest team?", "What should I invest in next?", "Which echoes can I feed?"];
  }
}

/** The page context line the assistant sends with a question (prompt.ts `pageContextText`). */
export function pageContextFor(path: string, ctx: { activeCharacterKey?: string | null; openTeam?: string | null }): PageContext {
  const b = base(path);
  return {
    route: path.split("?")[0] || "/",
    title: pageTitleOf(b),
    activeCharacter: ctx.activeCharacterKey ?? null,
    openTeam: b === "/teams" ? (ctx.openTeam ?? null) : null,
  };
}
