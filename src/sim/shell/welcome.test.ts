import { describe, expect, it } from "vitest";
import { WELCOME_DISMISSED_KEY, WELCOME_E2E_KEY, dismissWelcome, isNewVisitor, welcomeAllowed, welcomeDismissed } from "./welcome";

describe("isNewVisitor", () => {
  it("is new with only the default character (no weapon) and no echoes", () => {
    expect(isNewVisitor({ Aemeath: { weapon: null } }, [])).toBe(true);
    expect(isNewVisitor({}, undefined)).toBe(true);
    expect(isNewVisitor(null, null)).toBe(true);
  });

  it("is not new once a character has a weapon or an echo is in the inventory", () => {
    expect(isNewVisitor({ Aemeath: { weapon: "EverbrightPolestar" } }, [])).toBe(false);
    expect(isNewVisitor({ Aemeath: {} }, [{ id: "e1" }])).toBe(false);
  });
});

describe("dismissal", () => {
  it("remembers a dismissal in storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(welcomeDismissed(storage)).toBe(false);
    dismissWelcome(storage);
    expect(store.get(WELCOME_DISMISSED_KEY)).toBe("1");
    expect(welcomeDismissed(storage)).toBe(true);
  });

  it("survives a storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(welcomeDismissed(broken)).toBe(false);
    expect(() => dismissWelcome(broken)).not.toThrow();
  });
});

describe("welcomeAllowed", () => {
  it("shows for people, and under Cypress only when a spec asks", () => {
    expect(welcomeAllowed({})).toBe(true);
    expect(welcomeAllowed({ Cypress: {}, localStorage: { getItem: () => null } })).toBe(false);
    expect(welcomeAllowed({ Cypress: {}, localStorage: { getItem: (k: string) => (k === WELCOME_E2E_KEY ? "1" : null) } })).toBe(true);
  });
});
