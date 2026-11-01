import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { fireEvent, render, waitFor } from "@testing-library/vue";
import fixture from "./__fixtures__/newEchoes.json";
import WavescanNewEchoes from "./WavescanNewEchoes.vue";
import SettingsWavescan from "../../components/SettingsWavescan.vue";
import { useInventoryStore } from "../../stores/inventory";
import { useConfirm } from "../../composables/useConfirm";
import { mapWavescanEchoes } from "../../wavescan/echoes";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function seedInventory() {
  const store = useInventoryStore();
  store.hardSetState(clone(fixture.inventory));
  return store;
}

/** Answers the confirm the add asks (ConfirmDialog isn't mounted here) and returns what it asked. */
async function answerConfirm(answer: boolean) {
  const { confirmRequest, settle } = useConfirm();
  await waitFor(() => expect(confirmRequest.value).not.toBeNull());
  const asked = { ...confirmRequest.value! };
  settle(answer);
  return asked;
}

const count = (container: Element, id: string) =>
  container.querySelector(`[data-test-wavescan-new-only-count="${id}"]`)?.textContent?.replace(/\s+/g, " ").trim();

describe("WavescanNewEchoes", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("shows 3 new, 6 owned and 2 only in the inventory, each with its label", () => {
    const store = seedInventory();
    const mapped = mapWavescanEchoes(fixture.scan.echoes, store.echoes.map((echo: { echoId: string }) => echo.echoId));
    const { container } = render(WavescanNewEchoes, { props: { mapped } });
    expect(count(container, "new")).toBe("3 New · will be added");
    expect(count(container, "owned")).toBe("6 Already in your inventory · skipped");
    expect(count(container, "missing")).toBe("2 Only in your inventory · kept, never deleted");
    // the new list is open; the Phantom Gulpuff sits under Gulpuff with a skin badge
    const gulpuff = container.querySelector('[data-test-wavescan-new-only-list="new"] [data-base="Gulpuff"]')!;
    expect(gulpuff.textContent).toContain("Gulpuff");
    expect(gulpuff.querySelector("[data-test-wavescan-new-only-skin]")).not.toBeNull();
    expect(gulpuff.textContent).toContain("Worn by Jiyan in game. Added unequipped.");
    expect(container.textContent).toContain("would add 4 echoes counted here as owned a second time");
  });

  it("adds only the new echoes, unequipped, and leaves the rest of the inventory alone", async () => {
    const store = seedInventory();
    const before = clone({ echoes: store.echoes, equipped: store.equipped });
    const mapped = mapWavescanEchoes(fixture.scan.echoes, store.echoes.map((echo: { echoId: string }) => echo.echoId));
    const { container, findByText } = render(WavescanNewEchoes, { props: { mapped } });

    await fireEvent.click(container.querySelector("[data-test-wavescan-new-only-add]")!);
    const asked = await answerConfirm(true);
    expect(asked.title).toBe("Add 3 echoes to your inventory?");
    expect(asked.items).toEqual([
      "Add 3 echoes, unequipped",
      "Skip 6 echoes already in your inventory",
      "Keep the 2 echoes only in your inventory",
    ]);
    await findByText("Added 3 echoes.");

    expect(store.echoes).toHaveLength(before.echoes.length + 3);
    expect(store.echoes.slice(0, before.echoes.length)).toEqual(before.echoes);
    expect(store.echoes.slice(before.echoes.length).map((echo: { echo: string }) => echo.echo)).toEqual([
      "Tambourinist",
      "FogLionarch",
      "PhantomGulpuff",
    ]);
    expect(store.equipped).toEqual(before.equipped);
    // the plan follows the inventory: nothing is new any more
    await waitFor(() => expect(count(container, "new")).toBe("0 New · will be added"));
    expect(count(container, "owned")).toBe("9 Already in your inventory · skipped");
    expect(container.querySelector<HTMLButtonElement>("[data-test-wavescan-new-only-add]")!.disabled).toBe(true);
  });

  it("asks first, and adds nothing when the confirm is cancelled", async () => {
    const store = seedInventory();
    const before = clone({ echoes: store.echoes, equipped: store.equipped });
    const mapped = mapWavescanEchoes(fixture.scan.echoes, store.echoes.map((echo: { echoId: string }) => echo.echoId));
    const { container } = render(WavescanNewEchoes, { props: { mapped } });
    await fireEvent.click(container.querySelector("[data-test-wavescan-new-only-add]")!);
    await answerConfirm(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(clone({ echoes: store.echoes, equipped: store.equipped })).toEqual(before);
    expect(container.querySelector("[data-test-wavescan-new-only-done]")).toBeNull();
    expect(count(container, "new")).toBe("3 New · will be added");
  });

  it("never overwrites an inventory echo whose id the scan row happens to carry", async () => {
    const store = seedInventory();
    const mapped = mapWavescanEchoes(fixture.scan.echoes, []);
    // force a collision: the first new row gets an existing inventory id
    const firstNew = mapped.echoes[4]!;
    firstNew.echoId = "inv-hoochief";
    const { container, findByText } = render(WavescanNewEchoes, { props: { mapped } });
    await fireEvent.click(container.querySelector("[data-test-wavescan-new-only-add]")!);
    await answerConfirm(true);
    await findByText("Added 3 echoes.");
    const ids = store.echoes.map((echo: { echoId: string }) => echo.echoId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(store.echoes.find((echo: { echoId: string }) => echo.echoId === "inv-hoochief").echo).toBe("Hoochief");
  });

  it("is offered inside Ryan's Wavescan panel once a file is read", async () => {
    seedInventory();
    const { container, findByText } = render(SettingsWavescan);
    const input = container.querySelector("[data-test-wavescan-file-input]")!;
    const file = new File([JSON.stringify(fixture.scan)], "scan.json", { type: "application/json" });
    await fireEvent.change(input, { target: { files: [file] } });
    await findByText(/Add 3 echoes to my inventory/);
    expect(container.querySelector("[data-test-wavescan-echoes]")).not.toBeNull();
  });
});
