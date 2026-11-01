import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import { PLUS_BAR_VAR, pinnedHeight, usePlusBar } from "./plusBar";

const barVar = () => document.documentElement.style.getPropertyValue(PLUS_BAR_VAR);

function bar(position: string, height: number): HTMLElement {
  const el = document.createElement("div");
  el.style.position = position;
  el.getBoundingClientRect = () => ({ height, width: 300, top: 0, left: 0, right: 300, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty(PLUS_BAR_VAR);
});

describe("pinnedHeight", () => {
  it("counts a fixed, showing bar only", () => {
    expect(pinnedHeight(bar("fixed", 64))).toBe(64);
    expect(pinnedHeight(bar("static", 64))).toBe(0);
    const hidden = bar("fixed", 64);
    hidden.style.display = "none";
    expect(pinnedHeight(hidden)).toBe(0);
    expect(pinnedHeight(null)).toBe(0);
    // a line that ends a fixed-height page counts when the caller says it is pinned
    expect(pinnedHeight(bar("static", 40), true)).toBe(40);
  });
});

describe("usePlusBar", () => {
  it("publishes the tallest pinned bar and clears it when the page goes", async () => {
    const short = bar("fixed", 50);
    const tall = bar("fixed", 70);
    const show = ref(true);
    const Page = defineComponent({
      setup() {
        const a = ref<HTMLElement | null>(short);
        const b = ref<HTMLElement | null>(null);
        usePlusBar(a);
        usePlusBar(b);
        return { b };
      },
      render: () => null,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = createApp({ render: () => (show.value ? h(Page, { ref: "page" }) : null) });
    const vm = app.mount(host) as unknown as { $refs: { page: { b: HTMLElement | null } } };
    await nextTick();
    expect(barVar()).toBe("50px");
    vm.$refs.page.b = tall;
    await nextTick();
    await nextTick();
    expect(barVar()).toBe("70px");
    show.value = false;
    await nextTick();
    expect(barVar()).toBe("0px");
    app.unmount();
  });
});
