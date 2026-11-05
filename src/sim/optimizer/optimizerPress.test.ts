import { describe, expect, it, vi } from "vitest";
import { optimizerPress } from "./optimizerPress";

function setup(start: Partial<{ character: boolean; weapon: boolean; canLoad: boolean }> = {}) {
  const state = { character: true, weapon: true, canLoad: true, ...start };
  const run = vi.fn();
  const gate = optimizerPress<[string]>({
    characterIn: () => state.character,
    weaponIn: () => state.weapon,
    weaponCanLoad: () => Promise.resolve(state.canLoad),
    run,
  });
  return { state, run, gate };
}
/** lets `weaponCanLoad`'s answer land */
const answered = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("optimizerPress", () => {
  it("runs at once, in the same call, when the character and its weapon are in", () => {
    const { gate, run } = setup();
    gate.press("Rotation:a");
    expect(run.mock.calls).toEqual([["Rotation:a"]]);
  });

  it("holds a press made before the character's module is in, and runs it once everything is", async () => {
    const { gate, run, state } = setup({ character: false, weapon: false });
    gate.press("Rotation:a");
    gate.settle();
    await answered();
    expect(run).not.toHaveBeenCalled();
    state.character = true;
    gate.settle();
    await answered();
    expect(run, "the weapon is still on its way").not.toHaveBeenCalled();
    state.weapon = true;
    gate.settle();
    expect(run.mock.calls).toEqual([["Rotation:a"]]);
  });

  it("never asks about the weapon while the character is loading: only the module says which kind it is", async () => {
    const canLoad = vi.fn(() => Promise.resolve(false));
    const run = vi.fn();
    const gate = optimizerPress({ characterIn: () => false, weaponIn: () => false, weaponCanLoad: canLoad, run });
    gate.press();
    gate.settle();
    await answered();
    expect(canLoad).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("makes one run of two presses while loading, on the later press's settings", () => {
    const { gate, run, state } = setup({ character: false });
    gate.press("Rotation:a");
    gate.press("Rotation:b");
    state.character = true;
    gate.settle();
    gate.settle();
    expect(run.mock.calls).toEqual([["Rotation:b"]]);
  });

  it("does nothing when something arrives with no press held", () => {
    const { gate, run } = setup();
    gate.settle();
    expect(run).not.toHaveBeenCalled();
  });

  it("forgets a held press when dropped", async () => {
    const { gate, run, state } = setup({ character: false });
    gate.press("Rotation:a");
    gate.drop();
    state.character = true;
    gate.settle();
    await answered();
    expect(run).not.toHaveBeenCalled();
  });

  it("does not wait for a weapon that can never come", async () => {
    const { gate, run } = setup({ weapon: false, canLoad: false });
    gate.press("Rotation:a");
    expect(run, "the answer is not in yet").not.toHaveBeenCalled();
    await answered();
    expect(run.mock.calls).toEqual([["Rotation:a"]]);
  });

  it("treats a weapon check that throws as a weapon that cannot come", async () => {
    const run = vi.fn();
    const gate = optimizerPress({ characterIn: () => true, weaponIn: () => false, weaponCanLoad: () => Promise.reject(new Error("offline")), run });
    gate.press();
    await answered();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting for a weapon that is on its way", async () => {
    const { gate, run } = setup({ weapon: false, canLoad: true });
    gate.press("Rotation:a");
    await answered();
    expect(run).not.toHaveBeenCalled();
  });

  it("an answer about a weapon does not start a press dropped, replaced or overtaken while it was out", async () => {
    // eslint-disable-next-line no-unused-vars -- the parameters of a function type
    let answer!: (canLoad: boolean) => void;
    const run = vi.fn();
    const state = { character: true };
    const gate = optimizerPress<[string]>({
      characterIn: () => state.character,
      weaponIn: () => false,
      weaponCanLoad: () => new Promise((resolve) => (answer = resolve)),
      run,
    });
    gate.press("dropped");
    const first = answer;
    gate.drop();
    first(false);
    await answered();
    expect(run, "dropped").not.toHaveBeenCalled();

    gate.press("old");
    const second = answer;
    gate.press("new");
    second(false);
    await answered();
    expect(run, "replaced: only the newer press's own answer starts it").not.toHaveBeenCalled();
    answer(false);
    await answered();
    expect(run.mock.calls).toEqual([["new"]]);

    run.mockClear();
    gate.press("moved on");
    const third = answer;
    state.character = false;
    third(false);
    await answered();
    expect(run, "another character started loading").not.toHaveBeenCalled();
  });
});
