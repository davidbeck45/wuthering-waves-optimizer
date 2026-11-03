import { describe, expect, it } from "vitest";
import { render } from "@testing-library/vue";
import { RouterLinkStub } from "@vue/test-utils";
import BackupKeptNote from "./BackupKeptNote.vue";

describe("BackupKeptNote", () => {
  it("says what an overwrite keeps (builds, in Build history) and what it doesn't (other echoes, teams)", () => {
    const { container } = render(BackupKeptNote, { global: { stubs: { RouterLink: RouterLinkStub } } });
    const text = container.textContent!.replace(/\s+/g, " ");
    expect(text).toContain("Kept: each character build the overwrite changes is saved first in Build history");
    expect(text).toContain('("Before a Settings import"), with its five echoes');
    expect(text).toContain("Not kept: your other echoes and your teams.");
    expect(text).toContain("Download a .json backup above first.");
    expect(container.querySelector("[data-test-backup-kept-note]")?.getAttribute("role")).toBe("note");
  });
});
