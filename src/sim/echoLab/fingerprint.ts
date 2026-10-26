// Wuthering Tools+ Echo Lab — a fast account fingerprint (cache key) and a seeded PRNG. Pure.

/** cyrb53: a fast 53-bit string hash (public domain, bryc). Not cryptographic — a cache key. */
export function cyrb53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export const hashText = (text: string, seed = 0): string => cyrb53(text, seed).toString(36);

/**
 * The account's fingerprint: one hash over the characters, the inventory echoes, the equipped map and the
 * teams, as JSON. A changed build, echo or team gives a new key, so a cached Echo Lab result is never read
 * against a different account.
 */
export function accountFingerprint(account: { characters?: unknown; echoes?: unknown; equipped?: unknown; teams?: unknown }): string {
  const text = JSON.stringify([account.characters ?? {}, account.echoes ?? [], account.equipped ?? {}, account.teams ?? []]);
  return `${hashText(text)}-${text.length.toString(36)}`;
}

/** A stable key for a job's options (sorted keys, so property order does not matter). */
export function stableKey(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

/** mulberry32: a small seeded PRNG — the same seed gives the same Monte Carlo samples on every run. */
export function seededRandom(seed: number | string): () => number {
  let a = typeof seed === "number" ? seed >>> 0 : cyrb53(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
