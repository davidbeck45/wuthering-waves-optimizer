// Wuthering Tools+: /rankings opens on the last tier picked, else My account once something is set up (tierMemory.ts).
import { describe, expect, it } from "vitest";
import { initialTierHash, rememberTier, TIER_KEY } from "./tierMemory";

const memory = () => {
  const m = new Map<string, string>();
  return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } };
};

describe("/rankings opening tier", () => {
  it("leaves a link with a hash as it is", () => {
    const { store } = memory();
    expect(initialTierHash("#team=t12", 5, store)).toBeNull();
    expect(initialTierHash("#r=Aemeath", 0, store)).toBeNull();
  });
  it("opens on My account once something is set up, on Riley's default otherwise", () => {
    const { store } = memory();
    expect(initialTierHash("", 24, store)).toBe("#tc=mine");
    expect(initialTierHash("#", 0, store)).toBeNull();
  });
  it("opens on the tier last picked, Riley's default included", () => {
    const { m, store } = memory();
    rememberTier("s6r5", store);
    expect(m.get(TIER_KEY)).toBe("s6r5");
    expect(initialTierHash("", 24, store)).toBe("#tc=s6r5");
    rememberTier("", store);
    expect(initialTierHash("", 24, store)).toBeNull();
    rememberTier("mine", store);
    expect(initialTierHash(null, 0, store)).toBe("#tc=mine");
  });
});
