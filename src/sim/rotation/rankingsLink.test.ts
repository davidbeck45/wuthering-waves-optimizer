// The /rankings Rotation button writes a link that survives Riley's next update: his team key is a place in his team
// list, so the row's three members ride beside it (hash.ts `&chars=`), and /rotation reads the three when the key names
// another team by then (batch 5, check-upgrade: a bare key opened Aemeath · Verina + Lupa for Aemeath · Lupa + Lynae).
import { describe, expect, it } from "vitest";
import { parseRotationHash } from "./hash";
import { mountRotationLink } from "./rankingsLink";

const ROW = "t279-0.0.0.s6.r4-0.1.2.s3.r0-0.0.1.s6.r0";

describe("mountRotationLink", () => {
  it("names the row's three members beside its key", () => {
    const box = document.createElement("div");
    mountRotationLink(box, ROW, () => {}, ["Aemeath", "Lupa", "Lynae"]);
    const href = box.querySelector("a[data-test-rankings-rotation]")!.getAttribute("href")!;
    expect(href.startsWith("/rotation#")).toBe(true);
    const { target } = parseRotationHash(href.slice(href.indexOf("#")));
    expect(target).toMatchObject({ kind: "team", teamKey: "t279", rowKey: ROW, members: ["Aemeath", "Lupa", "Lynae"] });
  });

  it("re-points the one button at the next row, members and all, and writes a bare key only when it is given no members", () => {
    const box = document.createElement("div");
    mountRotationLink(box, ROW, () => {}, ["Aemeath", "Lupa", "Lynae"]);
    mountRotationLink(box, "t5", () => {}, ["Lily", "Sanhua", "Suoming"]);
    expect(box.querySelectorAll("a[data-test-rankings-rotation]")).toHaveLength(1);
    const href = box.querySelector("a")!.getAttribute("href")!;
    expect(parseRotationHash(href.slice(href.indexOf("#"))).target).toMatchObject({ kind: "team", teamKey: "t5", rowKey: null, members: ["Lily", "Sanhua", "Suoming"] });
    mountRotationLink(box, "t5", () => {});
    expect(box.querySelector("a")!.getAttribute("href")).not.toContain("chars=");
  });
});
