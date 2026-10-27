// Wuthering Tools+ shell — the in-app jumps the palette and the assistant's deep links share. Plain functions over
// the router and the stores (passed in), so both callers stay thin.
import type { Router } from "vue-router";
import { getCharactersAvailable, getCharacterRosterDisplayName } from "../../characters/characters";

/** The Teams page re-opens this team on mount (TeamRotations.vue keeps its open team per session, #507). */
export const TEAMS_ACTIVE_KEY = "teamRotationsActiveTeamId";
/** Fired when a team should open while /teams is already showing (a later hook in TeamRotations.vue can listen). */
export const OPEN_TEAM_EVENT = "wtplus:open-team";

/** A router path that resolves to a page (MarkdownView only links those). */
export function isAppRoute(router: Router, path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  try {
    return router.resolve(path).matched.length > 0;
  } catch {
    return false;
  }
}

/** A character key from a display name the tools wrote ("Yangyang: Xuanling" → "YangyangXuanling"). */
export function characterKeyByName(name: string): string | null {
  const wanted = name.trim().toLowerCase();
  const roster = getCharactersAvailable();
  for (const c of [...roster.five, ...roster.four]) {
    if (c.name.toLowerCase() === wanted || c.key.toLowerCase() === wanted || getCharacterRosterDisplayName(c.key).toLowerCase() === wanted) return c.key;
  }
  return null;
}

/** What `openCharacter` needs from the character store. */
// eslint-disable-next-line no-unused-vars -- the parameter of a method type
export type CharacterStoreLike = { setActiveCharacter(key: string): void };

/** Make `key` the calculator's active character and go there. */
export async function openCharacter(router: Router, store: CharacterStoreLike, key: string): Promise<void> {
  store.setActiveCharacter(key);
  if (router.currentRoute.value.path !== "/") await router.push("/");
}

/** Open a saved team in the Teams editor. Returns false when /teams is already showing (it only reads the open team
 *  on mount), after announcing the request with OPEN_TEAM_EVENT. */
export async function openTeam(router: Router, id: string): Promise<boolean> {
  try {
    sessionStorage.setItem(TEAMS_ACTIVE_KEY, id);
  } catch {
    /* storage blocked: the page opens on its list */
  }
  if (router.currentRoute.value.path === "/teams") {
    window.dispatchEvent(new CustomEvent(OPEN_TEAM_EVENT, { detail: { id } }));
    return false;
  }
  await router.push("/teams");
  return true;
}
