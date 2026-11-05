import { describe, expect, it } from "vitest";
import { dropUnkept, keepInLine } from "./solveQueue";

const job = (bk: string, keep = false) => ({ bk, keep });

describe("who stays in line when a new pass starts", () => {
  it("drops the table's teams and hands them back; a sync's stay, in order", () => {
    const queue = [job("a"), job("b", true), job("c"), job("d", true)];
    expect(dropUnkept(queue).map((j) => j.bk)).toEqual(["a", "c"]);
    expect(queue.map((j) => j.bk)).toEqual(["b", "d"]);
  });

  it("a sync waiting on a team the table has in line keeps it there, so it is solved and not read as no build", () => {
    const queue = [job("a"), job("b"), job("c")];
    keepInLine(queue, "b");
    expect(dropUnkept(queue).map((j) => j.bk)).toEqual(["a", "c"]);
    expect(queue.map((j) => j.bk)).toEqual(["b"]);
  });

  it("a team already out with a worker is not in line: nothing to keep, nothing else touched", () => {
    const queue = [job("a")];
    keepInLine(queue, "out-with-a-worker");
    expect(queue).toEqual([job("a")]);
  });
});
