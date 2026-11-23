// Wuthering Tools+ — the Team Buffs card under hard use (batch 5, lane check-panel): a fill still deriving when the
// player switches character must land on the character it was tapped for, never on the one now on screen.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { useInventoryStore } from "../../stores/inventory";
import type { RealPanel } from "./realPanel";

const pending: Array<{ args: unknown[]; resolve: (p: RealPanel) => void }> = [];
vi.mock("./realPanel", async (orig) => {
  const actual = await orig<typeof import("./realPanel")>();
  return {
    ...actual,
    deriveRealPanel: (...args: unknown[]) => new Promise<RealPanel>((resolve) => pending.push({ args, resolve })),
  };
});
vi.mock("../buildHistory/history", () => ({ snapshotCharacters: vi.fn() }));

const realFor = (characterId: string, mates: [string, string], key: string): RealPanel => ({
  characterId,
  teammates: mates,
  buffs: { [key]: { isEnabled: true } },
  on: [],
  off: [],
  notes: [],
});

describe("RealTeamBuffsCard", () => {
  beforeEach(() => {
    pending.length = 0;
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  it("a fill still deriving when the character changes writes to the character it was tapped for, not the next one", async () => {
    const { default: Card } = await import("./RealTeamBuffsCard.vue");
    const store = useCharacterStore() as any;
    store.characters = {
      Carlotta: { teamBuffs: { selectedCharacter1: "Iuno", selectedCharacter2: "Shorekeeper", buffs: {} } },
      Augusta: { teamBuffs: { selectedCharacter1: "Verina", selectedCharacter2: "Sanhua", buffs: { HandTyped: { isEnabled: true } } } },
      Iuno: {},
      Shorekeeper: {},
    };
    useTeamRotationsStore().teams = [] as never;
    const w = mount(Card, { props: { character: "Carlotta" } });
    vi.advanceTimersByTime(300);
    await flushPromises();
    // the card's own reading: Carlotta's builds give one buff her panel lacks, so "Use their real buffs" shows
    pending.shift()!.resolve(realFor("Carlotta", ["Iuno", "Shorekeeper"], "IunoOutro"));
    await flushPromises();
    await w.find("[data-test-real-panel-use]").trigger("click");
    const tap = pending.shift()!;
    expect(tap.args[0]).toBe("Carlotta");

    // the player picks Augusta before the derivation answers
    await w.setProps({ character: "Augusta" });
    tap.resolve(realFor("Carlotta", ["Iuno", "Shorekeeper"], "IunoOutro"));
    await flushPromises();

    const augusta = store.characters.Augusta.teamBuffs;
    expect(augusta.selectedCharacter1).toBe("Verina");
    expect(augusta.selectedCharacter2).toBe("Sanhua");
    expect(augusta.buffs.HandTyped.isEnabled).toBe(true);
    expect(augusta.buffs.IunoOutro).toBeUndefined();
    expect(augusta.plusTypical).toBeUndefined();
    // Carlotta's panel got the fill that was tapped for her
    expect(store.characters.Carlotta.teamBuffs.buffs.IunoOutro?.isEnabled).toBe(true);
    expect(store.characters.Carlotta.teamBuffs.plusTypicalSource).toBe("builds");
    vi.useRealTimers();
  });

  it("the card's own reading of one character never shows on the next one", async () => {
    const { default: Card } = await import("./RealTeamBuffsCard.vue");
    const store = useCharacterStore() as any;
    store.characters = {
      Carlotta: { teamBuffs: { selectedCharacter1: "Iuno", selectedCharacter2: "Shorekeeper", buffs: {} } },
      Augusta: { teamBuffs: { selectedCharacter1: "Verina", selectedCharacter2: "Sanhua", buffs: {} } },
    };
    useTeamRotationsStore().teams = [] as never;
    const w = mount(Card, { props: { character: "Carlotta" } });
    vi.advanceTimersByTime(300);
    await flushPromises();
    const carlottas = pending.shift()!;
    await w.setProps({ character: "Augusta" });
    carlottas.resolve(realFor("Carlotta", ["Iuno", "Shorekeeper"], "IunoOutro"));
    await flushPromises();
    // Augusta's reading has not answered yet: the card says it is reading, not Carlotta's answer
    expect(w.find("[data-test-real-panel-status]").attributes("data-test-real-panel-status")).toBe("reading");
    expect(w.text()).not.toContain("Iuno");
    vi.useRealTimers();
  });

  it("reads again when an echo a teammate wears is edited in the inventory (her Energy Regen moves a buff), not only when her record changes", async () => {
    const { default: Card } = await import("./RealTeamBuffsCard.vue");
    const store = useCharacterStore() as any;
    const inventory = useInventoryStore() as any;
    inventory.echoes = [{ echoId: "sk-0", echo: "Hurriclaw", echoSubStatsType1: "EnergyRegen", echoSubStatsValue1: 6.8 }];
    store.characters = {
      Carlotta: { teamBuffs: { selectedCharacter1: "Iuno", selectedCharacter2: "Shorekeeper", buffs: {} } },
      Iuno: {},
      Shorekeeper: { echoes: { 0: { echoId: "sk-0" } } },
    };
    useTeamRotationsStore().teams = [] as never;
    mount(Card, { props: { character: "Carlotta" } });
    vi.advanceTimersByTime(300);
    await flushPromises();
    pending.shift()!.resolve(realFor("Carlotta", ["Iuno", "Shorekeeper"], "IunoOutro"));
    await flushPromises();
    expect(pending).toHaveLength(0);

    inventory.echoes[0].echoSubStatsValue1 = 12.4;
    await flushPromises();
    vi.advanceTimersByTime(300);
    await flushPromises();
    expect(pending).toHaveLength(1);
    vi.useRealTimers();
  });
});
