// Wuthering Tools+ AI: the "Your question is ready" card above the key setup. An Explain made before a key is stored
// parks its question and numbers in the composer, which only shows once a key is in; the card says what is waiting and
// lets the player drop it. No request is ever made (the runtime loader throws if anything tries).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import AssistantParkedQuestion from "./AssistantParkedQuestion.vue";
import ExplainButton from "../explain/ExplainButton.vue";
import { resetAiSettingsState } from "../aiSettings";
import { resetAssistantState, setAssistantRuntimeLoader, useAssistant } from "../useAssistant";

const request = () => ({
  title: "Energy Regen needs · Aemeath + Mornye + Lynae",
  question: "Explain the Energy Regen needs of my team Aemeath + Mornye + Lynae.",
  data: { "Energy Regen the loop needs (%)": 125 },
});

describe("AssistantParkedQuestion", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetAiSettingsState();
    resetAssistantState();
    setAssistantRuntimeLoader(() => Promise.reject(new Error("the runtime must not load")));
  });
  afterEach(() => setAssistantRuntimeLoader(null));

  it("shows nothing while nothing is parked", () => {
    expect(mount(AssistantParkedQuestion).find("[data-test-ai-parked]").exists()).toBe(false);
  });

  it("after an Explain with no key: the question, the attached numbers' title and that nothing is sent yet", async () => {
    const button = mount(ExplainButton, { props: { request, what: "these needs", testId: "x", label: "Explain these needs" } });
    await button.find("button").trigger("click");
    const w = mount(AssistantParkedQuestion);
    const card = w.find("[data-test-ai-parked]");
    expect(card.exists()).toBe(true);
    expect(card.attributes("role")).toBe("status");
    expect(w.find("[data-test-ai-parked-question]").text()).toMatch(/^Explain the Energy Regen needs of my team/);
    expect(w.find("[data-test-ai-parked-attachment]").text()).toBe("Energy Regen needs · Aemeath + Mornye + Lynae");
    expect(card.text()).toContain("Add your key below and it waits in the message box, with these numbers attached.");
    expect(card.text()).toContain("Nothing is sent until you tap Send.");
    expect(useAssistant().state.busy).toBe(false);
  });

  it("Forget clears the question and its numbers, and the card goes", async () => {
    await mount(ExplainButton, { props: { request, testId: "x" } }).find("button").trigger("click");
    const w = mount(AssistantParkedQuestion);
    const forget = w.find("[data-test-ai-parked-forget]");
    expect(forget.attributes("aria-label")).toBe("Forget this question");
    await forget.trigger("click");
    await nextTick();
    const { state } = useAssistant();
    expect(state.draft).toBe("");
    expect(state.draftAttachment).toBeNull();
    expect(w.find("[data-test-ai-parked]").exists()).toBe(false);
  });
});
