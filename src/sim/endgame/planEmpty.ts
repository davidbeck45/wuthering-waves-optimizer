// Wuthering Tools+ — /endgame: what the Plan tab says while there is no plan, and why. Pure.
//
// An ended season comes first. It is waiting for nothing (its floor HP, published or not, no longer matters) and it
// cannot be checked again (the button is off), so neither "once its floor HP is published" nor "check your teams
// first" is true of it. The day after Season 42 ended the tab still read "The plan comes once Season 42's floor HP is
// published", under a banner that said the season was over and Season 43's data was due (2026-11-16, second check).

export interface PlanEmptyState {
  /** the season this build carries */
  season: number;
  /** it is over, and the next one's data is not in this build yet */
  ended: boolean;
  /** the season running in game when `ended`; null where the status does not say */
  next: number | null;
  /** floors of a running season still waiting for their HP */
  pending: number;
  /** a check is fighting the floors now */
  running: boolean;
  hasAccount: boolean;
}

export function planEmptyText(s: PlanEmptyState): string {
  if (s.ended) return `Season ${s.season} has ended. The plan comes with Season ${s.next ?? s.season + 1}'s floors, once they are in this page's data.`;
  if (s.pending) return `The plan comes once Season ${s.season}'s floor HP is published: until then no team can be timed on ${s.pending === 1 ? "a floor" : "the floors"} still waiting for it.`;
  if (s.running) return "The plan appears once every team has fought the floors.";
  return s.hasAccount ? "Check your teams first." : "Import your account to plan the zone.";
}
