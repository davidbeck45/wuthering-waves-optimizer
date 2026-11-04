import { describe, expect, it } from "vitest";
import { render } from "@testing-library/vue";
import { RouterLinkStub } from "@vue/test-utils";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import BackupKeptNote from "./BackupKeptNote.vue";
import { memoryStorage, readHistory, snapshotCharacters } from "./history";
import { pendingFrom } from "./importGuard";
import { restoredRecord } from "./restore";

/* eslint-disable @typescript-eslint/no-explicit-any */

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe("BackupKeptNote", () => {
  it("says what an overwrite keeps (the worn build, in Build history) and what it doesn't (other builds, levels, other echoes, teams)", () => {
    const { container } = render(BackupKeptNote, { global: { stubs: { RouterLink: RouterLinkStub } } });
    const text = container.textContent!.replace(/\s+/g, " ");
    expect(text).toContain("Kept: the build each character wears now is saved first in Build history");
    expect(text).toContain('("Before a Settings import"), with its five echoes');
    expect(text).toContain("Not kept: their other saved builds, levels and talents, your other echoes and your teams.");
    expect(text).toContain("Download a .json backup above first.");
    expect(container.querySelector("[data-test-backup-kept-note]")?.getAttribute("role")).toBe("note");
  });

  // The note sits right above a destructive overwrite, and once promised more than this code keeps: hold its words to the
  // real guard, history and restore, on a character with a second saved build wearing an echo nothing else wears.
  it("is true of the real import guard and restore: the worn build comes back, the second build, level and talents do not", () => {
    const echoes = clone(account.echoes) as any[];
    const worn = clone(account.characters.Cartethyia) as any;
    const wornIds = Object.values(worn.echoes).map((slot: any) => slot.echoId as string);
    const spare = echoes.find((echo) => !wornIds.includes(echo.echoId))!;
    const before = {
      ...worn,
      characterLevel: "90",
      talents: { basic: "10", skill: "10", forte: "10", liberation: "10", intro: "10" },
      weapons: { [worn.weapon]: { refinement: "1" } },
      activeBuildId: "worn",
      builds: [
        { id: "worn", name: "Worn build", weapon: worn.weapon },
        { id: "second", name: "Second build", weapon: worn.weapon, echoes: { 0: { echoId: spare.echoId } } },
      ],
    };
    const after = {
      ...clone(before),
      characterLevel: "1",
      talents: { basic: "1", skill: "1", forte: "1", liberation: "1", intro: "1" },
      weapons: { [worn.weapon]: { refinement: "5" } },
      activeBuildId: "imported",
      builds: [{ id: "imported", name: "Imported build", weapon: worn.weapon }],
    };

    const pending = pendingFrom({ Cartethyia: before }, { Cartethyia: after }, echoes)!;
    expect(pending.echoes.map((echo) => echo.echoId).sort(), "only the worn build's echoes are stashed").toEqual([...wornIds].sort());

    const storage = memoryStorage();
    snapshotCharacters(Object.keys(pending.characters), "before-import", pending, { storage });
    const versions = readHistory("Cartethyia", storage);
    expect(versions, "one version, not one per saved build").toHaveLength(1);
    expect(versions[0].label).toBe("before-import");
    expect(versions[0].payload.members[0].echoes.filter(Boolean), "with its five echoes").toHaveLength(5);
    expect(JSON.stringify(versions[0].payload), "the second build isn't in it").not.toContain("Second build");

    const restored = restoredRecord(after, versions[0], wornIds);
    expect(restored.weapons[worn.weapon].refinement, "the worn build's weapon comes back").toBe("1");
    expect(Object.values(restored.echoes).map((slot: any) => slot.echoId), "and its echoes").toEqual(wornIds);
    expect(restored.characterLevel, "level stays the imported one").toBe("1");
    expect(restored.talents, "talents stay the imported ones").toEqual(after.talents);
    expect(restored.builds.map((build: any) => build.name), "the second build stays gone").toEqual(["Imported build"]);
  });
});
