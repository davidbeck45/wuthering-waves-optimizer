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

  it("once touched, keeps what the player sees where it is while more arrives above it, and moves nothing for a fold they open", () => {
    const t = setup();
    // a fake layout: each block's place in the drawer's content, seen through the drawer's scroll; its top edge is at 0
    const above = document.createElement("div");
    t.content.insertBefore(above, t.section);
    let aboveY = 0;
    let sectionY = 500;
    const box = (y: () => number, height: number) => () => ({ top: y() - t.scroller.scrollTop, bottom: y() - t.scroller.scrollTop + height }) as DOMRect;
    t.scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    above.getBoundingClientRect = box(() => aboveY, 500);
    t.section.getBoundingClientRect = box(() => sectionY, 800);
    t.scroller.scrollTop = 500; // where the pin put it: the section at the top
    pinSection(t.scroller, t.content, () => t.section, { observer: t.observer });
    t.scroller.dispatchEvent(new Event("wheel"));
    // 1,900 px arrive above it and the browser did not anchor: the drawer is scrolled by as much
    sectionY += 1900;
    t.grow();
    expect(t.scroller.scrollTop, "scrolled by what arrived").toBe(2400);
    expect(t.placed(), "not put back at the top by the pin").toBe(1);
    // the browser did anchor this time: the section did not move on screen, nothing to correct
    sectionY += 300;
    t.scroller.scrollTop += 300;
    t.grow();
    expect(t.scroller.scrollTop).toBe(2700);
    // the player scrolls up until the block above the section is on screen, and opens a fold in it: it grows below
    // its own top, which is where the player is reading
    aboveY = 2000;
    t.scroller.scrollTop = 2100;
    t.scroller.dispatchEvent(new Event("scroll"));
    sectionY += 400;
    t.grow();
    expect(t.scroller.scrollTop, "nothing moved under the player").toBe(2100);

    // the phone drawer is a sheet: its first visible line is 110 px below the dialog's own top edge, and the player
    // touches it before the pin has put the section back after the last arrival (it is 300 px down)
    const u = setup();
    let y = 110;
    u.scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    u.section.getBoundingClientRect = () => ({ top: y - u.scroller.scrollTop, bottom: y - u.scroller.scrollTop + 800 }) as DOMRect;
    pinSection(u.scroller, u.content, () => u.section, { observer: u.observer });
    y = 410;
    u.scroller.dispatchEvent(new Event("touchstart"));
    y = 2310;
    u.grow();
    expect(u.scroller.scrollTop, "kept where it was when touched").toBe(1900);

    // a scroll event the browser dispatches between the arrival and the resize (it runs first in a frame) must not
    // take the jump as where the player has it
    const w = setup();
    let wy = 0;
    let contentHeight = 3000;
    w.scroller.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    w.content.getBoundingClientRect = () => ({ height: contentHeight }) as DOMRect;
    w.section.getBoundingClientRect = () => ({ top: wy - w.scroller.scrollTop, bottom: wy - w.scroller.scrollTop + 800 }) as DOMRect;
    pinSection(w.scroller, w.content, () => w.section, { observer: w.observer });
    w.scroller.dispatchEvent(new Event("pointerdown"));
    wy = 1900;
    contentHeight = 4900;
    w.scroller.dispatchEvent(new Event("scroll"));
    w.grow();
    expect(w.scroller.scrollTop, "corrected after a scroll event that came first").toBe(1900);
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
