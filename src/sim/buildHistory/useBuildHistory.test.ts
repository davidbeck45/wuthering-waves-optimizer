// Wuthering Tools+ build history: a restore writes onto the character the confirm was about, whoever the page shows by
// then. A version of Cartethyia written onto the character picked after the dialog opened put her gear on someone else
// (2026-11-05 hunt, H2).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { versionOf } from "./history";
import { useBuildHistory } from "./useBuildHistory";

vi.mock("./diff", async (original) => ({ ...(await original<typeof import("./diff")>()), bestRotationOf: vi.fn(async () => null) }));

/* eslint-disable @typescript-eslint/no-explicit-any */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("restore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    useCharacterStore().characters = { ...clone(account.characters as Record<string, any>), Aemeath: { weapon: "EverbrightPolestar", echoes: {} } };
    useInventoryStore().echoes = clone(account.echoes as any[]);
  });

  it("goes to the character the confirm named, not the one the page moved on to", () => {
    const store = useCharacterStore();
    const version = versionOf("Cartethyia", store.characters.Cartethyia, useInventoryStore().echoes, "manual");
    const selected = ref<string | null>("Cartethyia");
    const h = useBuildHistory(selected);
    store.characters.Cartethyia.weapon = "ChangedAfterTheVersion";

    selected.value = "Aemeath"; // Back while the dialog is open
    h.restore(version, "Cartethyia");

    expect(store.characters.Aemeath).toEqual({ weapon: "EverbrightPolestar", echoes: {} });
    expect(store.characters.Cartethyia.weapon).toBe(version.payload.members[0]!.weapon!.id);
  });
});
