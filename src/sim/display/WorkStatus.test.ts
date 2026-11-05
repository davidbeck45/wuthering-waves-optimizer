import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import WorkStatus from "./WorkStatus.vue";

const line = (w: ReturnType<typeof mount>): string => w.get("[role=status]").text();
const props = { busyText: "Scoring your roster", doneText: "Finished scoring your roster" };

describe("WorkStatus", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is on the page, empty, before there is anything to say", () => {
    const w = mount(WorkStatus, { props: { ...props, busy: false } });
    expect(line(w)).toBe("");
    vi.advanceTimersByTime(5000);
    expect(line(w)).toBe("");
  });

  it("says the start and the end, and the line does not change in between", async () => {
    const w = mount(WorkStatus, { props: { ...props, busy: false } });
    await w.setProps({ busy: true });
    expect(line(w)).toBe(props.busyText);
    await w.setProps({ busyText: "Scoring your roster, 37 of 104" });
    expect(line(w)).toBe(props.busyText);
    await w.setProps({ busy: false });
    expect(line(w)).toBe(props.busyText);
    vi.advanceTimersByTime(400);
    await nextTick();
    expect(line(w)).toBe(props.doneText);
  });

  it("a job already running when the page opens is said too", async () => {
    const w = mount(WorkStatus, { props: { ...props, busy: true } });
    await nextTick();
    expect(line(w)).toBe(props.busyText);
  });

  it("does not call a job finished for a moment between its two phases", async () => {
    const w = mount(WorkStatus, { props: { ...props, busy: true } });
    await w.setProps({ busy: false });
    vi.advanceTimersByTime(200);
    await w.setProps({ busy: true });
    vi.advanceTimersByTime(5000);
    await nextTick();
    expect(line(w)).toBe(props.busyText);
  });

  it("reads the end's words when the work settles, so they can name how it went", async () => {
    const w = mount(WorkStatus, { props: { ...props, busy: true } });
    await w.setProps({ busy: false });
    await w.setProps({ doneText: "Stopped before the end" });
    vi.advanceTimersByTime(400);
    await nextTick();
    expect(line(w)).toBe("Stopped before the end");
  });

  it("stays quiet when the page's own alert speaks for the end", async () => {
    const w = mount(WorkStatus, { props: { ...props, busy: true, doneText: "" } });
    await w.setProps({ busy: false });
    vi.advanceTimersByTime(400);
    await nextTick();
    expect(line(w)).toBe("");
  });

  it("leaves no timer behind when the page closes mid-settle", async () => {
    const w = mount(WorkStatus, { props: { ...props, busy: true } });
    await w.setProps({ busy: false });
    w.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
