// Wuthering Tools+ — which tier /rankings opens on when the link carries no hash: the one last picked in the account
// bar (My account or one of Riley's tiers, localStorage), else My account once the player has anything set up, else
// Riley's default. A link with a hash (a shared view, a team) always opens as written.

export const TIER_KEY = "wtplus:rankings:tier:v1";

type Store = Pick<Storage, "getItem" | "setItem">;
const storage = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** Remember the tier the player picked (`mine`, a Riley code, or "" for his default S0R1). */
export function rememberTier(code: string, store: Store | null = storage()): void {
  try {
    store?.setItem(TIER_KEY, code);
  } catch {
    /* no storage */
  }
}

/** The hash to open on, or null to leave the URL alone. */
export function initialTierHash(hash: string | null | undefined, ownedCount: number, store: Store | null = storage()): string | null {
  if ((hash ?? "").replace(/^#/, "")) return null;
  let saved: string | null = null;
  try {
    saved = store?.getItem(TIER_KEY) ?? null;
  } catch {
    saved = null;
  }
  const code = saved ?? (ownedCount > 0 ? "mine" : "");
  return /^[a-z0-9]+$/i.test(code) ? `#tc=${code}` : null;
}
