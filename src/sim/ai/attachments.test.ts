// Wuthering Tools+ AI: data attached to a question (Explain buttons) — a fenced JSON block the transcript shows as a chip.
import { describe, expect, it } from "vitest";
import { attachmentJson, attachmentText, cleanTitle, MAX_ATTACHMENT_CHARS, parseAttachment } from "./attachments";

describe("attachments", () => {
  it("round-trips a titled JSON block and recognises nothing else", () => {
    const text = attachmentText("Team damage breakdown", '{"total":1}');
    expect(text).toBe('[Attached data: Team damage breakdown]\n```json\n{"total":1}\n```');
    expect(parseAttachment(text)).toEqual({ title: "Team damage breakdown", chars: 11 });
    expect(parseAttachment("a plain question")).toBeNull();
    expect(parseAttachment("[Attached data: x]\nno fence")).toBeNull();
  });

  it("cleans titles so they can't break the marker line", () => {
    expect(cleanTitle("Team ]\n damage")).toBe("Team damage");
    expect(cleanTitle("")).toBe("Data");
    expect(cleanTitle("x".repeat(200))).toHaveLength(120);
  });

  it("serialises anything (functions, cycles, NaN, bigint) and shortens big data to fit", () => {
    const cyclic: Record<string, unknown> = { a: 1, f: () => 1, n: Number.NaN, b: BigInt(5) };
    cyclic.self = cyclic;
    expect(JSON.parse(attachmentJson(cyclic))).toEqual({ a: 1, n: null, b: "5", self: "[circular]" });
    const big = { rows: Array.from({ length: 5000 }, (_, i) => ({ i, name: `row ${i}` })) };
    const json = attachmentJson(big);
    expect(json.length).toBeLessThanOrEqual(MAX_ATTACHMENT_CHARS);
    const parsed = JSON.parse(json);
    expect(parsed._truncated).toMatch(/rows/);
    expect(parsed.rows.length).toBeGreaterThan(10);
  });
});
