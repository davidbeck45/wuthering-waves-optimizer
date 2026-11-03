// Wuthering Tools+ — a link to one calculator section: `/?screen=optimizer` opens the calculator on its Optimizer.
// Ryan's Calculator.vue keeps the open section in `curScreen` (it starts on "character", no deep link) and /optimizer
// redirects to `/` (main.ts), so the palette's "optimizer" landed on Character (2026-11-02 core audit L8). Calculator.vue
// calls `useCalculatorScreenLink(changeScreen)` (one hook line); the palette's section rows (paletteItems.ts
// SECTION_PAGES) link here. The query is dropped once applied, so switching sections afterwards leaves a clean `/`.
import { onMounted, watch } from "vue";
import { useRoute, useRouter, type LocationQuery } from "vue-router";

/** Calculator.vue's section keys (Ryan's CALCULATOR_SECTIONS) a link may open, in both UIs. Not "results" (Stats &
 *  Damages is a phone-only section in v3; on a desktop the stats sit beside every section) nor classic's
 *  "constellations" (v3 hides it). */
export const CALCULATOR_SCREENS = ["character", "weapon", "echoes", "party", "enemy", "optimizer", "rotations", "custom-buffs", "build-card"] as const;
export type CalculatorScreen = (typeof CALCULATOR_SCREENS)[number];

const ALIASES: Record<string, CalculatorScreen> = {
  team: "party",
  "team-buffs": "party",
  buildcard: "build-card",
  card: "build-card",
  "custom-buff": "custom-buffs",
  rotation: "rotations",
};

/** The section a `?screen=` value names, or null for anything else (an unknown value opens nothing). */
export function calculatorScreenOf(value: unknown): CalculatorScreen | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if ((CALCULATOR_SCREENS as readonly string[]).includes(key)) return key as CalculatorScreen;
  return ALIASES[key] ?? null;
}

/** What a calculator route asks for: its `?screen=`, else the optimizer when the address was the old /optimizer. */
export function requestedScreen(query: LocationQuery, redirectedFromPath?: string | null): CalculatorScreen | null {
  return calculatorScreenOf(query.screen) ?? (redirectedFromPath === "/optimizer" ? "optimizer" : null);
}

// eslint-disable-next-line no-unused-vars -- the parameter of a function type
export function useCalculatorScreenLink(changeScreen: (screen: string) => void): void {
  const route = useRoute();
  const router = useRouter();
  if (!route || !router) return; // mounted without a router (a unit test of Ryan's component): nothing to read
  const apply = (): void => {
    const screen = requestedScreen(route.query, route.redirectedFrom?.path);
    if (screen) changeScreen(screen);
    if (route.query.screen === undefined) return;
    const query = { ...route.query };
    delete query.screen;
    void router.replace({ path: route.path, query, hash: route.hash });
  };
  onMounted(apply);
  // the palette on the calculator itself: the same page, a new query
  watch(
    () => route.query.screen,
    (value) => {
      if (value !== undefined) apply();
    },
  );
}
