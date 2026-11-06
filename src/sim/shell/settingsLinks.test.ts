// Wuthering Tools+: a plus page that tells you to import opens Settings on Backup & Restore. A bare /settings lands on
// Preferences, and on a phone the section list is behind the menu button, right after the card named the path (hunt
// 2026-11-05, M4). Read from the source: every one of these links sits behind an empty state of its own.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return vueFiles(path);
    return entry.name.endsWith(".vue") ? [path] : [];
  });
}

describe("links to Settings", () => {
  it("name their section: no plus page links to bare /settings", () => {
    const bare = vueFiles(SRC).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) => (/\bto(="|: ")\/settings"/.test(line) ? [`${relative(SRC, file)}:${i + 1}`] : [])),
    );
    expect(bare).toEqual([]);
  });
});
