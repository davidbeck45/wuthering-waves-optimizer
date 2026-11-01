// Wuthering Tools+ — the first-visit card on the calculator (WelcomeCard.vue, mounted from PlusShell). A browser with
// no character set up and no echoes is new here: it lands on a default character with a one-attack number and no hint
// of what Tools+ is. Pure: PlusShell passes plain copies of the stores.

export const WELCOME_DISMISSED_KEY = "wtplus:welcome:dismissed";

/** Nothing of the player's own yet: no character with a weapon equipped (the account's "set up" bar) and no echoes. */
export function isNewVisitor(characters: Record<string, { weapon?: unknown } | null | undefined> | null | undefined, echoes: readonly unknown[] | null | undefined): boolean {
  const anySetUp = Object.values(characters ?? {}).some((c) => Boolean(c?.weapon));
  return !anySetUp && !(echoes?.length);
}

export function welcomeDismissed(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): boolean {
  try {
    return storage?.getItem(WELCOME_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissWelcome(storage: Pick<Storage, "setItem"> | null = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(WELCOME_DISMISSED_KEY, "1");
  } catch {
    /* private mode: it shows again next visit */
  }
}

/** Under Cypress the card would sit on the click targets of every spec that starts from an empty browser (the same
 *  reason src/sim/teamContext/autoTeamBuffs.ts steps aside there): it only shows when a spec asks for it. */
export const WELCOME_E2E_KEY = "wtplus:welcome:e2e";

export function welcomeAllowed(win: { Cypress?: unknown; localStorage?: Pick<Storage, "getItem"> } | null = typeof window === "undefined" ? null : (window as never)): boolean {
  if (!win?.Cypress) return true;
  try {
    return win.localStorage?.getItem(WELCOME_E2E_KEY) === "1";
  } catch {
    return false;
  }
}
