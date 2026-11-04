import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/vue";
import AutoTeamBuffsToggle from "./AutoTeamBuffsToggle.vue";
import { autoTeamBuffs } from "./autoTeamBuffs";

describe("AutoTeamBuffsToggle", () => {
  const initial = autoTeamBuffs.value;
  afterEach(() => {
    autoTeamBuffs.value = initial;
  });

  it("says what the switch does in a line a phone shows, not only in a hover tooltip", async () => {
    autoTeamBuffs.value = true;
    const { container } = render(AutoTeamBuffsToggle);
    const input = container.querySelector<HTMLInputElement>("[data-test-auto-team-buffs]")!;
    const caption = container.querySelector("[data-test-auto-team-buffs-caption]")!;
    expect(caption.textContent).toContain("Uses your teammates' real builds");
    expect(caption.textContent).toContain("Off: each character's Team Buffs panel");
    // the caption is the switch's description for a screen reader
    expect(input.getAttribute("aria-describedby")).toBe(caption.id);
    await fireEvent.click(input);
    expect(autoTeamBuffs.value).toBe(false);
    expect(caption.textContent).toContain("Each character's Team Buffs panel. On: your teammates' real builds.");
  });

  it("keeps the caption out of the switch's label: tapping the words to read them changes nothing, and a screen reader says them once", async () => {
    autoTeamBuffs.value = true;
    const { container, getByRole } = render(AutoTeamBuffsToggle);
    await fireEvent.click(container.querySelector("[data-test-auto-team-buffs-caption]")!);
    expect(autoTeamBuffs.value).toBe(true);
    expect(getByRole("checkbox", { name: "Team buffs from the team's members" })).toBeTruthy();
  });
});
