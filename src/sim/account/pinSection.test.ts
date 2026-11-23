// The drawer opened at Cost to max stays there while the sections above it load (2026-11-08 hunt, L1).
import { afterEach, describe, expect, it, vi } from "vitest";
import { PIN_MS, pinSection } from "./pinSection";

function setup() {
  const scroller = document.createElement("dialog");
  const content = document.createElement("div");
  const section = document.createElement("section");
  section.scrollIntoView = vi.fn();
  content.appendChild(section);
  scroller.appendChild(content);
  let resize: () => void = () => undefined;
  const observed: Element[] = [];
  const disconnect = vi.fn();
  const observer = (onResize: () => void) => {
    resize = onResize;
    return { observe: (el: Element) => void observed.push(el), disconnect };
  };
  return { scroller, content, section, observer, observed, disconnect, grow: () => resize(), placed: () => (section.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length };
}

afterEach(() => vi.useRealTimers());

describe("pinSection", () => {
  it("puts the section at the top at once, and again each time the drawer above it grows", () => {
    const t = setup();
    pinSection(t.scroller, t.content, () => t.section, { observer: t.observer });
    expect(t.placed()).toBe(1);
    expect(t.section.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    expect(t.observed).toEqual([t.content]);
    // Best DMG, crit luck, what to invest in next, the echo check: the drawer went from 881 to 2,835 px
    t.grow();
    t.grow();
    t.grow();
    expect(t.placed()).toBe(4);
  });

  it("lets go the moment the player touches the drawer: a swipe, the wheel, a click, a key", () => {
    for (const type of ["touchstart", "wheel", "pointerdown", "keydown"]) {
      const t = setup();
      pinSection(t.scroller, t.content, () => t.section, { observer: t.observer });
      t.grow();
      expect(t.placed()).toBe(2);
      t.scroller.dispatchEvent(new Event(type));
      t.grow();
      t.grow();
      expect(t.placed(), type).toBe(2);
    }
  });

  it("once touched, keeps the section where the player has it while more arrives above it, and leaves the drawer alone when something above it is on screen", () => {
    const t = setup();
    // the drawer's top edge is at 0; the section's top is where the fake layout puts it
    let sectionTop = 0;
    t.scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    t.section.getBoundingClientRect = () => ({ top: sectionTop }) as DOMRect;
    pinSection(t.scroller, t.content, () => t.section, { observer: t.observer });
    t.scroller.dispatchEvent(new Event("wheel"));
    // 1,900 px arrive above it and the browser did not anchor: the section went down by that much
    sectionTop = 1900;
    t.grow();
    expect(t.scroller.scrollTop, "scrolled by what arrived").toBe(1900);
    expect(t.placed(), "not put back at the top: it stays where the player has it").toBe(1);
    // the browser did anchor this time: the section did not move, nothing to correct
    sectionTop = 0;
    t.scroller.scrollTop = 0;
    t.grow();
    expect(t.scroller.scrollTop).toBe(0);
    // the player scrolls up until the section is half way down the screen: what is above it is theirs
    sectionTop = 400;
    t.scroller.dispatchEvent(new Event("scroll"));
    sectionTop = 700; // a part above it they opened
    t.grow();
    expect(t.scroller.scrollTop, "nothing moved under the player").toBe(0);
  });

  it("lets go by itself after a while, and when released (the drawer closed)", () => {
    vi.useFakeTimers();
    const t = setup();
    pinSection(t.scroller, t.content, () => t.section, { observer: t.observer });
    vi.advanceTimersByTime(PIN_MS - 1);
    t.grow();
    expect(t.placed()).toBe(2);
    vi.advanceTimersByTime(1);
    t.grow();
    expect(t.placed()).toBe(2);

    const u = setup();
    const release = pinSection(u.scroller, u.content, () => u.section, { observer: u.observer });
    u.scroller.dispatchEvent(new Event("touchstart"));
    release();
    release();
    u.grow();
    expect(u.placed()).toBe(1);
    expect(u.disconnect).toHaveBeenCalledTimes(1);
  });

  it("a section that is not there yet is found once it is, and no observer means it is placed once", () => {
    const t = setup();
    let there = false;
    pinSection(t.scroller, t.content, () => (there ? t.section : null), { observer: t.observer });
    expect(t.placed()).toBe(0);
    there = true;
    t.grow();
    expect(t.placed()).toBe(1);

    const u = setup();
    expect(() => pinSection(u.scroller, u.content, () => u.section, { observer: null })()).not.toThrow();
    expect(u.placed()).toBe(1);
  });
});
