import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { render, fireEvent } from "@testing-library/vue";
import EchoScannerSavedCard from "../../src/components/EchoScannerSavedCard.vue";
import { useInventoryStore } from "../../src/stores/inventory";

function renderCard(props: Record<string, unknown> = {}) {
  return render(EchoScannerSavedCard, {
    props: {
      echoId: "e1",
      captureIndex: 3,
      panelPreviewUrl: "data:image/jpeg;base64,AAAA",
      expanded: false,
      ...props,
    },
    global: {
      stubs: { AppRichSelect: true },
      directives: { tooltip: () => {} },
    },
  });
}

describe("EchoScannerSavedCard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute("open");
    };
    const inventoryStore = useInventoryStore() as any;
    inventoryStore.saveEcho({ echoId: "e1", echo: "AeroDrake", type: 1, rank: 5, stat: "CritRate" });
  });

  it("collapsed: shows the saved echo's tile, and Edit asks to expand", async () => {
    const { container, getByText, emitted } = renderCard();
    getByText("#3");
    getByText("Saved to inventory");
    getByText("Aero Drake");
    expect(container.querySelector("[data-test-scan-inline-editor]")).toBeNull();

    await fireEvent.click(container.querySelector("[data-test-echo-action-edit]")!);
    expect(emitted()["toggle-edit"]).toHaveLength(1);
  });

  it("expanded: renders the inline editor in place with the in-game capture beside it", async () => {
    const { container, getByAltText, emitted } = renderCard({ expanded: true });
    expect(container.querySelector("[data-test-scan-inline-editor]")).not.toBeNull();
    expect(container.querySelector('[data-test-echo-edit-rank="4"]')).not.toBeNull();
    // Inventory context: no build-only Browse button.
    expect(container.querySelector("[data-test-echo-edit-browse]")).toBeNull();
    getByAltText("In-game capture #3");

    await fireEvent.click(container.querySelector("[data-test-scan-inline-done]")!);
    expect(emitted()["toggle-edit"]).toHaveLength(1);
  });

  it("edits write through to the inventory echo", async () => {
    const { container } = renderCard({ expanded: true });
    await fireEvent.click(container.querySelector('[data-test-echo-edit-rank="4"]')!);
    const inventoryStore = useInventoryStore() as any;
    expect(String(inventoryStore.getEchoById("e1").rank)).toBe("4");
  });
});
