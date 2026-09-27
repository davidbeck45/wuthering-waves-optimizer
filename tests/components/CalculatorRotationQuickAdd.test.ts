import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { render, fireEvent } from "@testing-library/vue";
import CalculatorRotationQuickAdd from "../../src/components/CalculatorRotationQuickAdd.vue";
import type { MatchableAction } from "../../src/utils/actionTextMatch";

// Realistic labels: the intro doesn't say "intro", and two attacks share a label.
const ACTIONS: MatchableAction[] = [
  { key: "IntroDMG", label: "Feint Shot DMG", group: "intro" },
  { key: "OutroSkillDMG", label: "Outro Skill", group: "outro" },
  { key: "OutroWildfireDMG", label: "Outro: Wildfire Mark", group: "outro" },
  { key: "HeavyAttackDMG", label: "Heavy Attack", group: "basic" },
  { key: "Stage1DMG", label: "Stage 1 DMG", group: "basic" },
  { key: "SkillMistDMG", label: "Mist Bullet DMG", group: "skill" },
  { key: "ForteMistDMG", label: "Mist Bullet DMG", group: "forteCircuit" },
];

function renderQuickAdd() {
  const utils = render(CalculatorRotationQuickAdd, { props: { actions: ACTIONS } });
  const input = utils.getByPlaceholderText(/type an action name/i) as HTMLInputElement;
  const q = (selector: string) => utils.container.querySelector(selector);
  const qa = (selector: string) => [...utils.container.querySelectorAll(selector)];
  return { ...utils, input, q, qa };
}

async function openPaste(utils: ReturnType<typeof renderQuickAdd>) {
  await fireEvent.click(utils.getByText("Paste a whole rotation"));
  return utils.q("[data-test-rotation-quick-add-textarea]") as HTMLTextAreaElement;
}

describe("CalculatorRotationQuickAdd — add one action", () => {
  it("finds an attack by its type and adds it on Enter", async () => {
    const { input, q, emitted } = renderQuickAdd();

    await fireEvent.update(input, "int");
    expect(q('[data-test-rotation-quick-add-group="intro"]')).not.toBeNull();
    expect(q('[data-test-rotation-quick-add-option="IntroDMG"]')).not.toBeNull();

    await fireEvent.keyDown(input, { key: "Enter" });

    expect(emitted("add-actions")).toEqual([[[{ key: "IntroDMG", type: "intro", count: 1 }]]]);
    expect(input.value).toBe("");
  });

  it("buckets suggestions under a header per type", async () => {
    const { input, qa } = renderQuickAdd();
    await fireEvent.update(input, "mist");
    const groups = qa("[data-test-rotation-quick-add-group]").map((el) => el.getAttribute("data-test-rotation-quick-add-group"));
    expect(groups).toEqual(["skill", "forteCircuit"]);
  });

  it("moves the highlight with the arrow keys and adds the highlighted action", async () => {
    const { input, emitted } = renderQuickAdd();
    await fireEvent.update(input, "mist");
    await fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toMatch(/-opt-1$/);
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(emitted("add-actions")).toEqual([[[{ key: "ForteMistDMG", type: "forteCircuit", count: 1 }]]]);
  });

  it("wraps from the top of the list to the bottom with ArrowUp", async () => {
    const { input } = renderQuickAdd();
    await fireEvent.update(input, "mist");
    await fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toMatch(/-opt-1$/);
  });

  it("lists every attack when focused with an empty query, with nothing highlighted", async () => {
    const { input, qa, emitted } = renderQuickAdd();
    await fireEvent.focus(input);
    expect(qa("[data-test-rotation-quick-add-option]")).toHaveLength(ACTIONS.length);
    expect(qa("[data-test-rotation-quick-add-group]").map((el) => el.getAttribute("data-test-rotation-quick-add-group"))).toEqual([
      "intro",
      "basic",
      "skill",
      "forteCircuit",
      "outro",
    ]);

    await fireEvent.keyDown(input, { key: "Enter" });
    expect(emitted("add-actions")).toBeUndefined();
  });

  it("applies a trailing count suffix", async () => {
    const { input, emitted } = renderQuickAdd();
    await fireEvent.update(input, "heavy x2");
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(emitted("add-actions")).toEqual([[[{ key: "HeavyAttackDMG", type: "basic", count: 2 }]]]);
  });

  it("keeps focus in the input and closes the list after adding", async () => {
    const { input, q } = renderQuickAdd();
    input.focus();
    await fireEvent.update(input, "heavy");
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(document.activeElement).toBe(input);
    expect(q("[data-test-rotation-quick-add-suggestions]")).toBeNull();
  });

  it("adds a suggestion on click", async () => {
    const { input, q, emitted } = renderQuickAdd();
    await fireEvent.update(input, "stage");
    await fireEvent.click(q('[data-test-rotation-quick-add-option="Stage1DMG"]')!);
    expect(emitted("add-actions")).toEqual([[[{ key: "Stage1DMG", type: "basic", count: 1 }]]]);
  });

  it("does nothing on Enter when the query doesn't match anything", async () => {
    const { input, emitted } = renderQuickAdd();
    await fireEvent.update(input, "zzzzzzz");
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(emitted("add-actions")).toBeUndefined();
  });

  it("clears and closes on Escape", async () => {
    const { input, q } = renderQuickAdd();
    await fireEvent.update(input, "int");
    await fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(q("[data-test-rotation-quick-add-suggestions]")).toBeNull();
  });
});

describe("CalculatorRotationQuickAdd — paste panel", () => {
  it("parses a matched, ambiguous, and unmatched paste in one batch, respecting count suffixes", async () => {
    const utils = renderQuickAdd();
    const { getByText, q, emitted } = utils;
    const textarea = await openPaste(utils);
    await fireEvent.update(textarea, "Heavy Attack x2\nOutr\nnothing like this exists");

    // Matched line contributes to the count immediately, but Add stays
    // disabled while the ambiguous line has no pick yet — unmatched never
    // counts and never blocks.
    const addBtn = getByText(/^Add \d+ actions?$/) as HTMLButtonElement;
    expect(addBtn.textContent?.trim()).toBe("Add 1 action");
    expect(addBtn.disabled).toBe(true);

    const picker = q('[data-test-rotation-quick-add-paste-pick="1"]') as HTMLSelectElement;
    expect(picker).not.toBeNull();
    expect(picker.querySelector('optgroup[label="Outro"]')).not.toBeNull();
    await fireEvent.update(picker, "OutroWildfireDMG");

    expect(getByText(/^Add \d+ actions?$/).textContent?.trim()).toBe("Add 2 actions");
    expect((getByText(/^Add \d+ actions?$/) as HTMLButtonElement).disabled).toBe(false);

    await fireEvent.click(getByText(/^Add \d+ actions?$/));

    expect(emitted("add-actions")).toEqual([
      [
        [
          { key: "HeavyAttackDMG", type: "basic", count: 2 },
          { key: "OutroWildfireDMG", type: "outro", count: 1 },
        ],
      ],
    ]);
    // Submitting resets the paste panel.
    expect(q("[data-test-rotation-quick-add-paste]")).toBeNull();
  });

  it("keeps the Add button disabled while any ambiguous line is unresolved", async () => {
    const utils = renderQuickAdd();
    const textarea = await openPaste(utils);
    await fireEvent.update(textarea, "Outr");

    const addBtn = utils.q("[data-test-rotation-quick-add-submit]") as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it("lets an unmatched line be resolved by picking from every attack", async () => {
    const utils = renderQuickAdd();
    const textarea = await openPaste(utils);
    await fireEvent.update(textarea, "Heavy Attack\nnothing like this exists");

    const picker = utils.q('[data-test-rotation-quick-add-paste-unmatched-pick="1"]') as HTMLSelectElement;
    expect(picker.querySelectorAll("option[value]:not([value=''])").length).toBeGreaterThan(0);
    expect(utils.getByText(/^Add \d+ actions?$/).textContent?.trim()).toBe("Add 1 action");

    await fireEvent.update(picker, "Stage1DMG");
    await fireEvent.click(utils.getByText("Add 2 actions"));
    expect(utils.emitted("add-actions")).toEqual([
      [
        [
          { key: "HeavyAttackDMG", type: "basic", count: 1 },
          { key: "Stage1DMG", type: "basic", count: 1 },
        ],
      ],
    ]);
  });

  it("suggests for the current line and fills it on Enter, moving to a new line", async () => {
    const utils = renderQuickAdd();
    const textarea = await openPaste(utils);
    await fireEvent.update(textarea, "int");
    expect(utils.q("[data-test-rotation-quick-add-paste-suggestions]")).not.toBeNull();

    await fireEvent.keyDown(textarea, { key: "Enter" });
    await nextTick();

    expect(textarea.value).toBe("Feint Shot DMG\n");
    expect(textarea.selectionStart).toBe(textarea.value.length);
    expect(utils.q("[data-test-rotation-quick-add-paste-suggestions]")).toBeNull();
    expect(utils.q('[data-test-rotation-quick-add-paste-line="0"]')?.textContent).toContain("→ Feint Shot DMG");
  });

  it("keeps the line's count suffix and accepts with Tab", async () => {
    const utils = renderQuickAdd();
    const textarea = await openPaste(utils);
    await fireEvent.update(textarea, "heavy x2");
    await fireEvent.keyDown(textarea, { key: "Tab" });
    await nextTick();
    expect(textarea.value).toBe("Heavy Attack x2\n");
  });

  it("prefixes a label shared by two types so the line resolves to the chosen one", async () => {
    const utils = renderQuickAdd();
    const textarea = await openPaste(utils);
    await fireEvent.update(textarea, "forte mist");
    await fireEvent.keyDown(textarea, { key: "Enter" });
    await nextTick();

    expect(textarea.value).toBe("Forte Circuit: Mist Bullet DMG\n");
    const addBtn = utils.getByText("Add 1 action") as HTMLButtonElement;
    await fireEvent.click(addBtn);
    expect(utils.emitted("add-actions")).toEqual([[[{ key: "ForteMistDMG", type: "forteCircuit", count: 1 }]]]);
  });

  it("only fills the caret's line when editing in the middle of the text", async () => {
    const utils = renderQuickAdd();
    const textarea = await openPaste(utils);
    await fireEvent.update(textarea, "Heavy Attack\nstag\nOutro Skill");
    textarea.setSelectionRange(17, 17); // end of "stag"
    await fireEvent.click(textarea);
    await fireEvent.keyDown(textarea, { key: "Enter" });
    await nextTick();

    expect(textarea.value).toBe("Heavy Attack\nStage 1 DMG\nOutro Skill");
    expect(textarea.selectionStart).toBe("Heavy Attack\nStage 1 DMG\n".length);
  });

  it("doesn't suggest (so Enter inserts a newline) once the line is an exact match", async () => {
    const utils = renderQuickAdd();
    const textarea = await openPaste(utils);
    await fireEvent.update(textarea, "Heavy Attack");
    expect(utils.q("[data-test-rotation-quick-add-paste-suggestions]")).toBeNull();
  });

  it("dismisses suggestions on Escape", async () => {
    const utils = renderQuickAdd();
    const textarea = await openPaste(utils);
    await fireEvent.update(textarea, "int");
    await fireEvent.keyDown(textarea, { key: "Escape" });
    expect(utils.q("[data-test-rotation-quick-add-paste-suggestions]")).toBeNull();
    expect(textarea.value).toBe("int");
  });
});
