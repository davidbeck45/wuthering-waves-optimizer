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
    expect(container.textContent).toContain("would add 4 echoes you already own as second copies");
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

  it("folds the full import away while it would add second copies, and opens it again on request", async () => {
    const store = seedInventory();
    const mapped = mapWavescanEchoes(fixture.scan.echoes, store.echoes.map((echo: { echoId: string }) => echo.echoId));
    const { container } = render(WavescanNewEchoes, { props: { mapped } });
    const card = container.querySelector("[data-test-wavescan-new-only]")!;
    // the fixture: 4 echoes counted here as owned that Ryan's exact-name import would add again
    expect(card.hasAttribute("data-wt-fold-upstream")).toBe(true);
    expect(container.querySelector("[data-test-wavescan-new-only-other-why]")?.textContent).toContain("would add 4 echoes you already own as second copies");
    const toggle = container.querySelector<HTMLButtonElement>("[data-test-wavescan-new-only-other-toggle]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Other import options: equip the scanned loadouts, replace my inventory");
    await fireEvent.click(toggle);
    expect(card.hasAttribute("data-wt-fold-upstream")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("Hide the other import options");
    expect(container.querySelector("[data-test-wavescan-new-only-other-why]")?.textContent).toBe("The full import below matches echo names exactly, so it would add 4 echoes you already own as second copies: Phantom skins stored the other way round, and close matches.");
    // said once: the note above used to say the same thing, and "below" while the import was folded away
    expect(container.querySelector("[data-test-wavescan-new-only-note]")?.textContent).not.toContain("second");
  });

  it("keeps the full import open when it would add only what this card adds, and folds it once this card has added", async () => {
    // an inventory without the echoes the loose passes matched: nothing counted twice
    const store = useInventoryStore();
    store.hardSetState({ echoes: [], equipped: {} });
    const mapped = mapWavescanEchoes(fixture.scan.echoes, []);
    const { container, findByText } = render(WavescanNewEchoes, { props: { mapped } });
    const card = container.querySelector("[data-test-wavescan-new-only]")!;
    expect(card.hasAttribute("data-wt-fold-upstream")).toBe(false);
    expect(container.querySelector("[data-test-wavescan-new-only-other]")).toBeNull();
    await fireEvent.click(container.querySelector("[data-test-wavescan-new-only-add]")!);
    await answerConfirm(true);
    await findByText(/^Added \d+ echoes\.$/);
    expect(card.hasAttribute("data-wt-fold-upstream")).toBe(true);
  });

  // after the add the card says once why the full import has nothing for you, and names it by where it is now
  async function addAll(rows: unknown[]) {
    useInventoryStore().hardSetState({ echoes: [], equipped: {} });
    const mapped = mapWavescanEchoes(rows as typeof fixture.scan.echoes, []);
    const { container, findByText } = render(WavescanNewEchoes, { props: { mapped } });
    await fireEvent.click(container.querySelector("[data-test-wavescan-new-only-add]")!);
    await answerConfirm(true);
    await findByText(`Added ${mapped.echoes.length} echoes.`);
    await waitFor(() => expect(count(container, "new")).toBe("0 New · will be added"));
    return {
      container,
      mapped,
      why: () => container.querySelector("[data-test-wavescan-new-only-other-why]")?.textContent,
      toggle: container.querySelector<HTMLButtonElement>("[data-test-wavescan-new-only-other-toggle]")!,
    };
  }

  it("says once after the add that the full import has nothing new, folded or open", async () => {
    const { container, why, toggle } = await addAll(clone(fixture.scan.echoes));
    expect(why()).toBe("Every echo in this scan is in your inventory now, so the full import is folded away: it has nothing new to add.");
    expect(container.textContent?.match(/nothing new to add/gi)?.length).toBe(2); // this line and the disabled button
    await fireEvent.click(toggle);
    expect(why()).toBe("Every echo in this scan is in your inventory now: the full import below has nothing new to add.");
  });

  it("doesn't claim every echo in the scan when part of the file couldn't be read", async () => {
    const rows = [...clone(fixture.scan.echoes), { ...clone(fixture.scan.echoes[0]), scanId: "unreadable", echo: "NoSuchEcho" }];
    const { container, mapped, why, toggle } = await addAll(rows);
    const note = () => container.querySelector("[data-test-wavescan-new-only-note]")?.textContent ?? "";
    expect(mapped.skipped).toHaveLength(1);
    expect(why()).toBe("Every echo that could be read is in your inventory now, so the full import is folded away: it has nothing new to add.");
    // and says where to find them: "under Echoes below" pointed at a card folded out of sight
    expect(note()).toContain("under Other import options");
    await fireEvent.click(toggle);
    expect(why()).toBe("Every echo that could be read is in your inventory now: the full import below has nothing new to add.");
    expect(note()).toContain("under Echoes below");
  });

  it("says second copies, not 'nothing new', when the import below would still add them after the add", async () => {
    const store = seedInventory();
    const mapped = mapWavescanEchoes(fixture.scan.echoes, store.echoes.map((echo: { echoId: string }) => echo.echoId));
    const { container, findByText } = render(WavescanNewEchoes, { props: { mapped } });
    await fireEvent.click(container.querySelector("[data-test-wavescan-new-only-add]")!);
    await answerConfirm(true);
    await findByText("Added 3 echoes.");
    await waitFor(() => expect(count(container, "new")).toBe("0 New · will be added"));
    expect(container.querySelector("[data-test-wavescan-new-only-other-why]")?.textContent).toBe("The full import is folded away: it matches echo names exactly, so it would add 4 echoes you already own as second copies: Phantom skins stored the other way round, and close matches.");
  });

  // Ryan's paste clears and sets `mapped` in one tick, so this card stays mounted (a file read remounts it): what it
  // remembers about the last scan must go with that scan, or it says "nothing new to add" over a scan with new echoes.
  it("forgets the last add when a second scan is pasted, so the full import is not folded with a reason that is no longer true", async () => {
    useInventoryStore().hardSetState({ echoes: [], equipped: {} } as never);
    const { container, findByText } = render(SettingsWavescan);
    const paste = async (echoes: unknown[]) => {
      await fireEvent.update(container.querySelector("[data-test-wavescan-paste]")!, JSON.stringify({ ...fixture.scan, echoes }));
      await fireEvent.click(container.querySelector("[data-test-wavescan-paste-button]")!);
    };
    const half = Math.floor(fixture.scan.echoes.length / 2);
    await paste(fixture.scan.echoes.slice(0, half));
    await findByText(/^Add \d+ echoes to my inventory$/);
    await fireEvent.click(container.querySelector("[data-test-wavescan-new-only-add]")!);
    await answerConfirm(true);
    await findByText(/^Added \d+ echoes\.$/);
    const card = () => container.querySelector("[data-test-wavescan-new-only]")!;
    expect(card().hasAttribute("data-wt-fold-upstream")).toBe(true);

    await paste(fixture.scan.echoes.slice(half));
    await findByText(/^Add \d+ echoes to my inventory$/);
    expect(container.querySelector("[data-test-wavescan-new-only-done]")).toBeNull();
    expect(card().hasAttribute("data-wt-fold-upstream")).toBe(false);
    expect(container.querySelector("[data-test-wavescan-new-only-other-why]")).toBeNull();
  }, 60_000);

  it("folds the full import again when a second scan is pasted, so a fold opened for the last scan does not stay open over the next", async () => {
    seedInventory(); // the fixture's owned echoes: this scan would add second copies, so the import is folded with no add at all
    const { container, findByText } = render(SettingsWavescan);
    const paste = async () => {
      await fireEvent.update(container.querySelector("[data-test-wavescan-paste]")!, JSON.stringify(fixture.scan));
      await fireEvent.click(container.querySelector("[data-test-wavescan-paste-button]")!);
    };
    await paste();
    await findByText(/^Add \d+ echoes to my inventory$/);
    const card = container.querySelector("[data-test-wavescan-new-only]")!;
    const toggle = () => container.querySelector("[data-test-wavescan-new-only-other-toggle]")!;
    expect(card.hasAttribute("data-wt-fold-upstream")).toBe(true);
    await fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(card.hasAttribute("data-wt-fold-upstream")).toBe(false);

    await paste();
    await waitFor(() => expect(toggle().getAttribute("aria-expanded")).toBe("false"));
    // the same card, not a remount: only the watch can have closed it
    expect(container.querySelector("[data-test-wavescan-new-only]")).toBe(card);
    expect(card.hasAttribute("data-wt-fold-upstream")).toBe(true);
  }, 60_000);

  it("is offered inside Ryan's Wavescan panel once a file is read", async () => {
    seedInventory();
    const { container, findByText } = render(SettingsWavescan);
    const input = container.querySelector("[data-test-wavescan-file-input]")!;
    const file = new File([JSON.stringify(fixture.scan)], "scan.json", { type: "application/json" });
    await fireEvent.change(input, { target: { files: [file] } });
    await findByText(/Add 3 echoes to my inventory/);
    expect(container.querySelector("[data-test-wavescan-echoes]")).not.toBeNull();
    // the fold (a sibling selector in WavescanNewEchoes.vue) needs Ryan's Echoes card right after this card
    expect(container.querySelector("[data-test-wavescan-new-only]")!.nextElementSibling?.matches("[data-test-wavescan-echoes]")).toBe(true);
  });
});
