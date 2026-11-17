// The drawer section's own states, mounted on a pinia store with synthetic characters: it waits for the roster, shows
// costs alone for a character with no weapon, and the "Other levels" what-if writes nothing and is remembered for the
// visit. (The scored states are cypress/e2e/accountLevelsWorth.cy.ts.) jsdom has no IntersectionObserver, so this is
// also the path of a browser without one: the section scores at once.
import { beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useCharacterStore } from "../../stores/character";
import LevelsWorth from "./LevelsWorth.vue";

const characters = (): Record<string, any> => ({
  Jiyan: { characterLevel: "40", talents: { basic: 2 } },
  Roccia: {},
});

function section(characterKey: string, props: Record<string, unknown> = {}) {
  return mount(LevelsWorth, { props: { characterKey, name: characterKey, rank: null, rankingTeams: [], ...props } });
}
/** the cost table is its own chunk, then the plan runs: a few turns of the loop */
async function settled(w: ReturnType<typeof section>, selector: string): Promise<void> {
  for (let i = 0; i < 200 && !w.find(selector).exists(); i++) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(w.find(selector).exists(), selector).toBe(true);
}

beforeEach(() => {
  setActivePinia(createPinia());
  (useCharacterStore() as unknown as { characters: Record<string, any> }).characters = characters();
});

describe("What each level is worth, the section", () => {
  it("opens with one line that says what it is, and waits while the roster is being scored", async () => {
    const w = section("Jiyan", { scoring: true });
    expect(w.find("h3").text()).toBe("What each level is worth");
    expect(w.find("[data-test-levels-intro]").text()).toBe("What each level-up still open adds to damage on Jiyan's build, and what it costs.");
    await settled(w, "[data-test-levels-waiting]");
    expect(w.find("[data-test-levels-waiting]").text()).toBe("Waiting for the roster to be scored…");
    expect(w.find("[data-test-levels-rows]").exists()).toBe(false);
    // the roster is in: the steps follow
    await w.setProps({ scoring: false });
    await settled(w, "[data-test-levels-rows]");
    expect(w.find("[data-test-levels-waiting]").exists()).toBe(false);
  }, 30_000);

  it("no weapon: what is missing, the steps with their costs and no figures, and no view switch", async () => {
    const w = section("Jiyan");
    await settled(w, "[data-test-levels-rows]");
    expect(w.find('[data-test-levels-from="saved"]').attributes("aria-pressed")).toBe("true"); // level 40 is saved
    expect(w.find("[data-test-levels-nogain]").text()).toBe("No damage figures: Jiyan has no weapon equipped, so nothing can be scored yet. The steps below show what they cost.");
    expect(w.findAll("[data-test-levels-row]").map((r) => r.find(".lw-row__label").text())).toEqual(["Level 40 → 90", "Normal Attack 2 → 10"]);
    expect(w.find(".lw-gain").exists()).toBe(false);
    expect(w.find("[data-test-levels-view]").exists()).toBe(false);
    expect(w.find("[data-test-levels-no-weapon]").text()).toBe("No weapon equipped, so there is no weapon level here.");
    expect(w.find("[data-test-levels-everything]").text()).toContain("Shell Credits");
    expect(w.find("[data-test-levels-source]").text()).toContain("Not in this list: the two inherent skills and the eight stat bonuses.");
    // what the calculator has not saved is named, with the way to where levels are set
    expect(w.find("[data-test-levels-assumed]").text()).toContain("has not saved Jiyan's Resonance Skill, Forte Circuit, Resonance Liberation and Intro Skill levels, so it counts them at the top");
    await w.find("[data-test-levels-set]").trigger("click");
    expect(w.emitted("calculator")).toHaveLength(1);
  }, 30_000);

  it("nothing saved: opens from level 1, and the saved view has nothing left and says why", async () => {
    const w = section("Roccia");
    await settled(w, "[data-test-levels-rows]");
    expect(w.find('[data-test-levels-from="scratch"]').attributes("aria-pressed")).toBe("true");
    expect(w.find("[data-test-levels-intro]").text()).toContain("counted from a new Roccia at level 1, wearing this build's echoes");
    expect(w.findAll("[data-test-levels-row]")).toHaveLength(6); // the level and five Forte skills; no weapon
    await w.find('[data-test-levels-from="saved"]').trigger("click");
    await settled(w, "[data-test-levels-done]");
    expect(w.find("[data-test-levels-done]").text()).toBe("Nothing left to levelLevel 90 · all five Forte skills at 10.");
    expect(w.find("[data-test-levels-assumed]").text()).toContain("has not saved Roccia's level or Forte levels, so it counts them at the top");
    expect(w.find("[data-test-levels-rows]").exists()).toBe(false);
  }, 30_000);

  it("Other levels: pickers that open on what the calculator counts, write nothing, and are remembered for the visit", async () => {
    const store = useCharacterStore() as unknown as { characters: Record<string, any> };
    const before = JSON.stringify(store.characters);
    const w = section("Roccia");
    await settled(w, "[data-test-levels-rows]");
    await w.find('[data-test-levels-from="custom"]').trigger("click");
    await settled(w, "[data-test-levels-try]");
    const fields = w.findAll("[data-test-levels-try-field]");
    expect(fields.map((f) => f.attributes("data-test-levels-try-field"))).toEqual(["level", "basic", "skill", "forte", "liberation", "intro"]); // no weapon, no weapon picker
    expect(fields.map((f) => (f.element as HTMLSelectElement).value)).toEqual(["90", "10", "10", "10", "10", "10"]);
    await settled(w, "[data-test-levels-done]"); // at the top there is nothing left
    await w.find('[data-test-levels-try-field="liberation"]').setValue("6");
    await settled(w, '[data-test-levels-row="liberation"]');
    expect(w.findAll("[data-test-levels-row]").map((r) => r.find(".lw-row__label").text())).toEqual(["Resonance Liberation 6 → 10"]);
    expect(w.find('[data-test-levels-row="liberation"]').text()).toContain("250,000 Shell Credits");
    expect(JSON.stringify(store.characters)).toBe(before);
    w.unmount();
    // the drawer opened again on the same character, in the same visit
    const again = section("Roccia");
    await settled(again, "[data-test-levels-rows]");
    await again.find('[data-test-levels-from="custom"]').trigger("click");
    await settled(again, '[data-test-levels-row="liberation"]');
    expect((again.find('[data-test-levels-try-field="liberation"]').element as HTMLSelectElement).value).toBe("6");
    // another character starts from their own levels
    const other = section("Jiyan");
    await settled(other, "[data-test-levels-rows]");
    await other.find('[data-test-levels-from="custom"]').trigger("click");
    await settled(other, "[data-test-levels-try]");
    expect((other.find('[data-test-levels-try-field="level"]').element as HTMLSelectElement).value).toBe("40");
    expect((other.find('[data-test-levels-try-field="basic"]').element as HTMLSelectElement).value).toBe("2");
  }, 30_000);
});
