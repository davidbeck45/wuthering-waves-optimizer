// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildScannerData } from "../../src/scanner/scannerData";
import { buildScannerAssets, buildScannerAssetsFile, scannerIcons } from "../../src/scanner/scannerAssets";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const RUN = "run `npm run scanner:icons` and commit src/scanner/scanner-icons.json";

describe("scanner-assets.json", () => {
  const data = buildScannerData();
  const icons = scannerIcons();

  it(`has a set-icon reference for every sonata set (else ${RUN})`, () => {
    // Wavescan recognises an echo's set from these, so a missing or outdated one means
    // echoes of that set come out with no set.
    const missing = Object.entries(data.echoSets)
      .filter(([key, set]) => icons.setIcons.sources[key]?.url !== set.icon || !icons.setIcons.icons[key])
      .map(([key]) => key);
    expect(missing).toEqual([]);
    expect(Object.keys(icons.setIcons.icons).sort()).toEqual(Object.keys(data.echoSets).sort());
  });

  it(`has a picture (or a recorded reason) for every echo (else ${RUN})`, () => {
    const outdated = Object.entries(data.echoes)
      .filter(([key, echo]) => {
        const made = icons.echoIcons.sources[key]?.url === echo.icon && icons.echoIcons.icons[key];
        const skipped = icons.echoIcons.skipped[key] && (icons.echoIcons.skipped[key].url || null) === echo.icon;
        return !made && !skipped;
      })
      .map(([key]) => key);
    expect(outdated).toEqual([]);
    const stale = Object.keys(icons.echoIcons.icons).filter((key) => !(key in data.echoes));
    expect(stale).toEqual([]);
  });

  it("stores pictures in the size and format Wavescan expects", () => {
    const { setIcons, echoIcons } = buildScannerAssets();
    expect(setIcons.size).toBe(32);
    expect(setIcons.background).toEqual([40, 40, 40]);
    for (const encoded of Object.values(setIcons.icons)) {
      expect(Buffer.from(encoded, "base64")).toHaveLength(32 * 32 * 3);
    }
    expect(echoIcons.size).toBe(80);
    expect(Object.values(echoIcons.icons).every((url) => url.startsWith("data:image/webp;base64,"))).toBe(true);
  });

  it("publishes only the pictures, not their source bookkeeping", () => {
    const { setIcons, echoIcons } = buildScannerAssets();
    expect(Object.keys(setIcons).sort()).toEqual(["background", "icons", "size"]);
    expect(Object.keys(echoIcons).sort()).toEqual(["icons", "size"]);
  });

  it("is deterministic and its hash matches its content", () => {
    const a = buildScannerAssetsFile(sha256);
    expect(JSON.stringify(a)).toBe(JSON.stringify(buildScannerAssetsFile(sha256)));
    expect(a.format).toBe("WutheringToolsScannerAssets");
    expect(a.hash).toBe(sha256(JSON.stringify(a.data)));
  });
});
