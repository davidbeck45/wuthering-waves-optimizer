// Wuthering Tools+: Back with the Ask sheet open on a phone closes the sheet and stays on the page, on a real router (it
// is a section, not a <dialog>, so no close watcher takes the gesture: Back left /account for the page before).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { installAskBackGuard, installSheetBackGuard } from "./askBackGuard";

const settled = (router: Router): Promise<void> =>
  new Promise((resolve) => {
    const off = router.afterEach(() => {
      off();
      resolve();
    });
  });

describe("Back and the Ask sheet", () => {
  const page = { template: "<div />" };
  let router: Router;
  let stop: () => void;
  let open = false;
  let closes = 0;

  beforeEach(async () => {
    open = false;
    closes = 0;
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: page }, { path: "/today", component: page }, { path: "/account", component: page }] });
    await router.push("/today");
    await router.push("/account");
    stop = installAskBackGuard(router, {
      sheetOpen: () => open,
      close: () => {
        open = false;
        closes += 1;
      },
    });
  });
  afterEach(() => stop());

  it("closes the sheet and leaves the page where it was", async () => {
    open = true;
    const done = settled(router);
    router.back();
    await done;
    expect(closes).toBe(1);
    expect(open).toBe(false);
    expect(router.currentRoute.value.path).toBe("/account");
  });

  it("leaves the page on the next Back, with the sheet closed", async () => {
    open = true;
    let done = settled(router);
    router.back();
    await done;
    done = settled(router);
    router.back();
    await done;
    expect(router.currentRoute.value.path).toBe("/today");
    expect(closes).toBe(1);
  });

  it("does nothing without the sheet", async () => {
    const done = settled(router);
    router.back();
    await done;
    expect(closes).toBe(0);
    expect(router.currentRoute.value.path).toBe("/today");
  });

  it("lets a link inside the sheet navigate: only Back closes it", async () => {
    open = true;
    await router.push("/");
    expect(closes).toBe(0);
    expect(router.currentRoute.value.path).toBe("/");
  });
});

describe("Back and two sheets (Ask over /my-rankings' Options, or Play along)", () => {
  const page = { template: "<div />" };
  let router: Router;
  const stops: Array<() => void> = [];
  const ask = { open: false, closes: 0 };
  const options = { open: false, closes: 0 };

  beforeEach(async () => {
    Object.assign(ask, { open: false, closes: 0 });
    Object.assign(options, { open: false, closes: 0 });
    router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: page }, { path: "/account", component: page }, { path: "/my-rankings", component: page }, { path: "/rankings", component: page }] });
    await router.push("/account");
    await router.push("/my-rankings");
    for (const sheet of [ask, options]) {
      stops.push(
        installSheetBackGuard(router, {
          sheetOpen: () => sheet.open,
          close: () => {
            sheet.open = false;
            sheet.closes += 1;
          },
        }),
      );
    }
  });
  afterEach(() => stops.splice(0).forEach((stop) => stop()));

  it("Back with the Options sheet open closes it and stays on /my-rankings; the next Back leaves", async () => {
    options.open = true;
    let done = settled(router);
    router.back();
    await done;
    expect(options).toEqual({ open: false, closes: 1 });
    expect(router.currentRoute.value.path).toBe("/my-rankings");
    done = settled(router);
    router.back();
    await done;
    expect(router.currentRoute.value.path).toBe("/account");
  });

  it("one Back closes one sheet, and a link inside the sheet still open then navigates", async () => {
    ask.open = true;
    options.open = true;
    const done = settled(router);
    router.back();
    await done;
    expect(ask).toEqual({ open: false, closes: 1 });
    expect(options).toEqual({ open: true, closes: 0 });
    expect(router.currentRoute.value.path).toBe("/my-rankings");
    // the Options sheet's "wuwa_calc rankings" link: a push, not a Back
    await router.push("/rankings");
    expect(router.currentRoute.value.path).toBe("/rankings");
    expect(options.closes).toBe(0);
  });
});
