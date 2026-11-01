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
      return ["Who should I pull for?", "What's the best value pull on the current banners?", "Which missing character would complete a team I almost have?", "Is a weapon or a sequence the better pull for my main DPS?"];
    case "/energy":
      return [name ? `How much Energy Regen does ${name} need in my teams?` : "Is anyone short on Energy Regen?", "Which of my teams is hardest on Energy Regen?", "How many ER rolls is my main team missing?"];
    case "/endgame":
      return ["Can my teams clear Hazard 4 this season?", "How should I split my teams across the Tower?", "Which floor is my weakest, and why?"];
    case "/rotation":
      return ["What's the rotation for my strongest team?", "Walk me through my main team's loop", "When should each Liberation go out in my main team?"];
    case "/build-team":
      return ["What should my strongest team wear?", "Do I have the echoes for my main team's plan?", "Which member of my main team is short on Energy Regen?"];
    case "/weapons":
      return [name ? `Is ${name}'s signature weapon worth it?` : "Which signature weapon adds the most for me?", "Which standard 5★ weapon helps my roster most?", "Is a refinement or a new weapon the better pull?"];
    case "/echo-lab":
      return ["Which echoes should I feed?", name ? `Which of ${name}'s echoes should I re-roll first?` : "Which echo should I re-roll first?", "Which echoes are upgrades I haven't equipped?"];
    case "/today":
      return ["When's the reset, and what ends soon?", "When are my Waveplates full?", "What's on the banners right now?"];
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
    openTeam: b === "/teams" || b === "/build-team" ? (ctx.openTeam ?? null) : null,
  };
}
