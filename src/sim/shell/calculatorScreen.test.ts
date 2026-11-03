import { createApp, defineComponent, h, nextTick } from "vue";
import { RouterView, createMemoryHistory, createRouter, type Router } from "vue-router";
import { describe, expect, it } from "vitest";
import { CALCULATOR_SCREENS, calculatorScreenOf, requestedScreen, useCalculatorScreenLink } from "./calculatorScreen";

describe("calculatorScreenOf", () => {
  it("reads Ryan's section keys and a few spoken names, nothing else", () => {
    for (const key of CALCULATOR_SCREENS) expect(calculatorScreenOf(key)).toBe(key);
    expect(calculatorScreenOf("Optimizer")).toBe("optimizer");
    expect(calculatorScreenOf("team-buffs")).toBe("party");
    expect(calculatorScreenOf("buildcard")).toBe("build-card");
    expect(calculatorScreenOf(["rotations", "enemy"])).toBe("rotations");
    expect(calculatorScreenOf("results")).toBeNull(); // phone-only in v3
    expect(calculatorScreenOf("constellations")).toBeNull(); // classic only
    expect(calculatorScreenOf("drop table")).toBeNull();
    expect(calculatorScreenOf(undefined)).toBeNull();
    expect(calculatorScreenOf(null)).toBeNull();
  });

  it("sends the old /optimizer address to the optimizer, and a query wins over it", () => {
    expect(requestedScreen({}, "/optimizer")).toBe("optimizer");
    expect(requestedScreen({ screen: "enemy" }, "/optimizer")).toBe("enemy");
    expect(requestedScreen({}, "/teams")).toBeNull();
    expect(requestedScreen({}, undefined)).toBeNull();
  });
});

describe("useCalculatorScreenLink", () => {
  async function mount(path: string): Promise<{ router: Router; opened: string[] }> {
    const opened: string[] = [];
    const Calculator = defineComponent({
      setup() {
        useCalculatorScreenLink((screen) => opened.push(screen));
        return () => h("div");
      },
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: Calculator },
        { path: "/optimizer", redirect: "/" },
        { path: "/teams", component: { render: () => null } },
      ],
    });
    await router.push(path);
    await router.isReady();
    const el = document.createElement("div");
    document.body.appendChild(el);
    createApp({ render: () => h(RouterView) })
      .use(router)
      .mount(el);
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { router, opened };
  }

  it("opens the section a link names, then drops the query and keeps the rest", async () => {
    const { router, opened } = await mount("/?screen=optimizer&char=Aemeath#top");
    expect(opened).toEqual(["optimizer"]);
    expect(router.currentRoute.value.fullPath).toBe("/?char=Aemeath#top");
  });

  it("opens a section asked for while the calculator is already showing (the palette on the calculator)", async () => {
    const { router, opened } = await mount("/");
    expect(opened).toEqual([]);
    await router.push("/?screen=build-card");
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0)); // the query is dropped with a router.replace
    expect(opened).toEqual(["build-card"]);
    expect(router.currentRoute.value.fullPath).toBe("/");
  });

  it("lands the old /optimizer page on the optimizer and ignores an unknown section", async () => {
    expect((await mount("/optimizer")).opened).toEqual(["optimizer"]);
    const unknown = await mount("/?screen=nope");
    expect(unknown.opened).toEqual([]);
    expect(unknown.router.currentRoute.value.fullPath).toBe("/");
  });
});
